// The SalesLore agent flow: Discover -> Research -> Compose -> Validate.
// Approval is a separate, owner-only step (see approve()). Nothing here sends anything.
import crypto from 'node:crypto';
import { wordSummary } from './model.js';

const REL_LABEL = { decides_for: 'decides', champion_of: 'champion', influences: 'influences', blocks: 'blocker' };

export class SalesLoreError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Readiness of an account, from its governed context alone.
export function readiness(ctx) {
  if (ctx.some(r => r.item_type === 'stop')) return 'stop';
  if (!ctx.some(r => r.item_type === 'person')) return 'unknown';
  if (ctx.some(r => r.item_type === 'person' && r.is_stale)) return 'risk';
  if (conflicts(ctx).length) return 'review';
  return 'ready';
}

export function conflicts(ctx) {
  const byKey = {};
  for (const r of ctx) if (r.fact_key && r.item_type === 'fact') (byKey[r.fact_key] ||= []).push(r);
  return Object.entries(byKey).filter(([, rows]) => new Set(rows.map(r => r.label)).size > 1)
    .map(([key, rows]) => ({ key, items: rows.map(r => ({ text: r.label, evidence_id: r.evidence_id, date: r.source_date })) }));
}

// Compose: turn context rows into cited claims and next steps. `rejected` holds claim keys the validator refused.
export function compose(account, ctx, rejected = new Set()) {
  const notes = [];
  const claim = (key, kind, text, evidence_id, extra = {}) => ({ key, kind, text, evidence_id: evidence_id || null, ...extra });
  const conf = conflicts(ctx);
  const conflictKeys = new Set(conf.map(c => c.key));
  const stopped = ctx.some(r => r.item_type === 'stop');
  const people = ctx.filter(r => r.item_type === 'person').map(r => claim('person:' + r.item_key, 'person',
    `${r.label}, ${r.detail}`, r.evidence_id, { name: r.label, relationship: r.relationship, role: REL_LABEL[r.relationship], stale: !!r.is_stale }));
  const commitments = ctx.filter(r => r.item_type === 'commitment').map(r => claim('fact:' + r.item_key, 'commitment', r.label, r.evidence_id, { due: r.due_date }));
  const risks = ctx.filter(r => r.item_type === 'risk').map(r => claim('fact:' + r.item_key, 'risk', r.label, r.evidence_id));
  const facts = ctx.filter(r => r.item_type === 'fact' && !conflictKeys.has(r.fact_key)).map(r => claim('fact:' + r.item_key, 'fact', r.label, r.evidence_id));
  const draft = ctx.filter(r => r.item_type === 'note').map(r => claim('note:' + r.item_key, 'fact', r.label, r.evidence_id, { from: 'seller notes' }))
    .filter(c => !rejected.has(c.key));
  const next = [];
  const skipped = [];
  for (const t of ctx.filter(r => r.item_type === 'task').sort((a, b) => a.sort_order - b.sort_order)) {
    if (t.pattern_step_id && t.pattern_status === 'rejected') { skipped.push({ step: t.pattern_step_id, why: `rejected by the seller; "${t.label}" is never coached` }); continue; }
    if (t.pattern_step_id && t.pattern_applies === false) { skipped.push({ step: t.pattern_step_id, why: `does not apply to ${account.segment} deals at the ${account.stage.toLowerCase()} stage` }); continue; }
    if (stopped && t.is_outreach) { notes.push(`Removed outreach step: ${t.label}`); continue; }
    next.push(claim('task:' + t.item_key, 'next', t.label, t.evidence_id, { pattern_step_id: t.pattern_step_id || null }));
  }
  const unknowns = ctx.filter(r => r.item_type === 'unknown').map(r => r.label);
  const stop = ctx.find(r => r.item_type === 'stop');
  const privacy = ctx.find(r => r.item_type === 'privacy_excluded');
  const claims = [...people, ...commitments, ...risks, ...facts, ...draft, ...next];
  return { claims, people, commitments, risks, facts: [...facts, ...draft], next, unknowns, conflicts: conf, skipped, notes,
    stop: stop ? { text: stop.label, evidence_id: stop.evidence_id } : null,
    privacy_excluded: privacy ? Number(privacy.label) : 0 };
}

// Validate: every claim must cite evidence that exists in the governed evidence view.
export function validate(draft, evidenceIds) {
  const failures = draft.claims.filter(c => !c.evidence_id || !evidenceIds.has(c.evidence_id));
  return { ok: failures.length === 0, failures };
}

export function flagFor(status, draft, account) {
  if (status === 'stop') return ['stop', `Stop: ${draft.stop.text}. SalesLore removed every outreach step and escalated to the transfer owner.`];
  if (status === 'risk') {
    const p = draft.people.find(x => x.stale);
    return ['warn', `Stale: ${p.name} may be out of date (last contact is past the stale cutoff, or their email bounced). Treat facts about them as unverified.`];
  }
  if (status === 'unknown') return ['unk', `Unknown: ${draft.unknowns.join(', ')}. SalesLore will not guess these.`];
  if (status === 'review') return ['warn', `Conflict: sources disagree on ${draft.conflicts.map(c => c.key.replace(/_/g, ' ')).join(', ')}. A person should confirm.`];
  if (draft.privacy_excluded) return ['ok', `Privacy filter: ${draft.privacy_excluded} personal, non-business fact excluded before it reached the graph.`];
  if (draft.skipped.length) return ['ok', draft.skipped.map(s => `${s.step} skipped: ${s.why}.`).join(' ')];
  return null;
}

// Run the four agents for one account and store the result. Returns the saved run.
export async function runAgents(store, cfg, accountId, actor) {
  const t0 = Date.now();
  const log = [];
  const say = (stage, text, kind = 'ok') => log.push({ stage, text, kind, ms: Date.now() - t0 });
  const account = await store.account(accountId);
  if (!account) throw new SalesLoreError(404, `No account with id "${accountId}".`);
  const transfer = await store.transfer();
  const sellers = await store.sellers();
  const from = sellers.find(s => s.seller_id === transfer?.from_id);

  // Discover
  if (!from || from.consent_status !== 'granted') {
    throw new SalesLoreError(409, `${from ? from.name : 'The departing seller'} has not granted consent, so SalesLore cannot capture their knowledge.`);
  }
  const ctx = await store.context(accountId);
  const people = ctx.filter(r => r.item_type === 'person').length;
  say('Discover', `${account.name} in scope. Owner moves from ${transfer.from_name} to ${transfer.to_name}. ${people} ${people === 1 ? 'person' : 'people'}, 1 deal.`);

  // Research
  const cited = [...new Set(ctx.map(r => r.evidence_id).filter(Boolean))];
  const evidence = await store.evidence(cited);
  const evidenceIds = new Set(evidence.map(e => e.evidence_id));
  const newest = evidence.map(e => e.source_date).sort().at(-1);
  say('Research', `Pulled ${evidence.length} evidence items from v_saleslore_context${newest ? `. Newest: ${newest}` : ''}.`);

  // Compose + Validate, with bounded retries
  const cfgRow = await store.config();
  const maxRetries = Number(cfgRow.max_validate_retries ?? 2);
  const rejected = new Set();
  let draft, result, attempts = 0;
  for (;;) {
    attempts++;
    draft = compose(account, ctx, rejected);
    say('Compose', `Drafted brief: ${draft.claims.length} claims, ${draft.next.length} next ${draft.next.length === 1 ? 'step' : 'steps'}.` +
      (draft.skipped.length ? ` Skipped ${draft.skipped.map(s => s.step).join(', ')}.` : '') + (draft.notes.length ? ` ${draft.notes.length} outreach step(s) removed.` : ''));
    result = validate(draft, evidenceIds);
    if (result.ok) break;
    const retry = attempts - 1;
    for (const f of result.failures) rejected.add(f.key);
    if (retry >= maxRetries) {
      say('Validate', `Still ${result.failures.length} uncited claim(s) after ${maxRetries} retries. Escalated to ${transfer.owner_name}.`, 'fail');
      break;
    }
    say('Validate', `Rejected: ${result.failures.map(f => `"${f.text}"`).join(', ')} has no evidence. Retry ${retry + 1} of ${maxRetries}.`, 'fail');
  }

  let status = readiness(ctx);
  let runStatus = 'validated';
  if (!result.ok) runStatus = 'failed';
  else if (status === 'stop') {
    runStatus = 'escalated';
    say('Validate', `Stop rule: ${draft.stop.text}. Outreach steps removed. Escalated to ${transfer.owner_name}.`, 'fail');
  } else {
    const extras = [];
    if (status === 'risk') extras.push('flagged stale contact');
    if (status === 'unknown') extras.push(`${draft.unknowns.length} facts shown as unknown`);
    if (status === 'review') extras.push('conflicting evidence needs a person');
    say('Validate', `${draft.claims.length} of ${draft.claims.length} claims cited. Passed${attempts > 1 ? ` on retry ${attempts - 1}` : ''}.${extras.length ? ' ' + extras.join('; ') + '.' : ''}`);
  }

  const brief = {
    account: { account_id: account.account_id, name: account.name, segment: account.segment, stage: account.stage, amount: account.amount, proves: account.proves },
    transfer: { from: transfer.from_name, to: transfer.to_name, owner: transfer.owner_name },
    status, flag: flagFor(status, draft, account),
    summary: await wordSummary(cfg, account, draft, status),
    people: draft.people, commitments: draft.commitments, risks: draft.risks, facts: draft.facts,
    conflicts: draft.conflicts, unknowns: draft.unknowns, next: draft.next, skipped: draft.skipped,
    privacy_excluded: draft.privacy_excluded, stop: draft.stop,
  };
  const run = {
    run_id: `${accountId}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`,
    account_id: accountId, status: runStatus, attempts, brief, log, created_by: actor.name,
  };
  await store.saveRun(run);
  for (const [i, l] of log.entries()) {
    await store.log({ actor: `${l.stage} agent`, action: l.stage.toLowerCase(), account_id: accountId, detail: l.text, idempotency_key: `${run.run_id}:${i}` });
  }
  return run;
}

// Owner-only approval. Publishes the brief to the successor. Sends nothing to the customer.
export async function approve(store, runId, actor) {
  const run = await store.run(runId);
  if (!run) throw new SalesLoreError(404, `No run with id "${runId}".`);
  const transfer = await store.transfer();
  if (!actor || actor.seller_id !== transfer.owner_id) {
    await store.log({ actor: actor?.name || 'unknown user', action: 'approve_denied', account_id: run.account_id, detail: `Not the owner. Only ${transfer.owner_name} can approve.` });
    throw new SalesLoreError(403, `Only the transfer owner, ${transfer.owner_name}, can approve this brief.`);
  }
  if (run.status !== 'validated') throw new SalesLoreError(409, `This run ended as "${run.status}", so there is no brief to approve.`);
  const { created, approval } = await store.approve({ run_id: runId, account_id: run.account_id, approved_by: actor.name });
  if (created) await store.log({ actor: actor.name, action: 'approve', account_id: run.account_id, detail: `Approved brief ${runId}. Nothing sent to the customer.`, idempotency_key: `approve:${runId}` });
  return { created, approval };
}

// A preview brief without storing a run (used for listing and the Companion before any run).
export async function previewBrief(store, cfg, accountId) {
  const account = await store.account(accountId);
  if (!account) throw new SalesLoreError(404, `No account with id "${accountId}".`);
  const ctx = await store.context(accountId);
  const transfer = await store.transfer();
  const ev = new Set((await store.evidence([...new Set(ctx.map(r => r.evidence_id).filter(Boolean))])).map(e => e.evidence_id));
  const rejected = new Set();
  let draft = compose(account, ctx);
  const v = validate(draft, ev);
  if (!v.ok) { v.failures.forEach(f => rejected.add(f.key)); draft = compose(account, ctx, rejected); }
  const status = readiness(ctx);
  return {
    account: { account_id: account.account_id, name: account.name, segment: account.segment, stage: account.stage, amount: account.amount, proves: account.proves },
    transfer: { from: transfer.from_name, to: transfer.to_name, owner: transfer.owner_name },
    status, flag: flagFor(status, draft, account), summary: null,
    people: draft.people, commitments: draft.commitments, risks: draft.risks, facts: draft.facts,
    conflicts: draft.conflicts, unknowns: draft.unknowns, next: draft.next, skipped: draft.skipped,
    privacy_excluded: draft.privacy_excluded, stop: draft.stop, preview: true,
  };
}
