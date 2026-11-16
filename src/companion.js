// SalesLore Companion: answers questions about inherited accounts from approved, cited knowledge.
// Shared by the Slack bot and the web console. Returns structured answers; each surface renders them.
import { previewBrief } from './engine/agents.js';

export function matchAccount(accounts, text) {
  const t = text.toLowerCase();
  return accounts.find(a => t.includes(a.name.toLowerCase())) ||
    accounts.find(a => t.includes(a.name.toLowerCase().split(' ')[0])) || null;
}

// Prefer the latest approved run's brief; fall back to a validated preview.
export async function briefFor(store, cfg, accountId) {
  const run = await store.latestRun(accountId);
  if (run && run.status !== 'failed') {
    const approval = await store.approval(run.run_id);
    return { ...(typeof run.brief === 'string' ? JSON.parse(run.brief) : run.brief), run_id: run.run_id, approved: !!approval };
  }
  return { ...(await previewBrief(store, cfg, accountId)), approved: false };
}

export async function answer(store, cfg, question, fallbackAccountId = null) {
  const q = String(question || '').trim();
  if (!q) return { kind: 'help', title: 'Ask about an inherited account', lines: [{ text: 'Try "Who decides at Halcyon?" or "/saleslore next Lumen Robotics".' }] };
  const accounts = await store.accounts();
  const acct = matchAccount(accounts, q) || accounts.find(a => a.account_id === fallbackAccountId);
  if (!acct) return { kind: 'help', title: 'Which account?', lines: [{ text: `Name one of the inherited accounts, for example ${accounts.slice(0, 3).map(a => a.name).join(', ')}.` }] };
  const b = await briefFor(store, cfg, acct.account_id);
  const t = q.toLowerCase();
  const base = { account_id: acct.account_id, account: acct.name, approved: b.approved };

  if (b.stop && /next|reach|email|call|contact|outreach|follow/.test(t)) {
    return { ...base, kind: 'stop', title: `Stop: no outreach at ${acct.name}`, lines: [{ text: `${b.stop.text}. Every outreach step was removed and the transfer owner, ${b.transfer.owner}, decides what happens next.`, evidence_id: b.stop.evidence_id }] };
  }
  if (/who|decide|buyer|sign|champion/.test(t)) {
    if (!b.people.length) return { ...base, kind: 'unknown', title: `Unknown at ${acct.name}`, lines: [{ text: 'No evidence names a decision maker, so I will not guess. Maya would ask who signs by the second meeting.', evidence_id: 'EV-PAT-002' }] };
    return { ...base, kind: 'people', title: `Who matters at ${acct.name}`, lines: b.people.map(p => ({ text: `${p.text} (${p.role})${p.stale ? ' [stale]' : ''}`, evidence_id: p.evidence_id })) };
  }
  if (/promise|commit|owe/.test(t)) {
    return { ...base, kind: 'commitments', title: `Open promises at ${acct.name}`, lines: b.commitments.length ? b.commitments.map(c => ({ text: c.text, evidence_id: c.evidence_id })) : [{ text: 'No open promises on record.' }] };
  }
  if (/budget|timing|when|q1|q2/.test(t) && b.conflicts.length) {
    return { ...base, kind: 'conflict', title: `Sources disagree at ${acct.name}`, lines: [...b.conflicts.flatMap(c => c.items.map(i => ({ text: `${i.date}: "${i.text}"`, evidence_id: i.evidence_id }))), { text: 'Please confirm with the customer before planning around either.' }] };
  }
  if (/risk|block|worr/.test(t)) {
    return { ...base, kind: 'risks', title: `Risks at ${acct.name}`, lines: b.risks.length ? b.risks.map(r => ({ text: r.text, evidence_id: r.evidence_id })) : [{ text: 'No risks on record.' }] };
  }
  if (/next|maya|would|before|pricing|do now|step/.test(t)) {
    return { ...base, kind: 'next', title: `What Maya would do next at ${acct.name}`, lines: b.next.length ? b.next.map(n => ({ text: n.text, evidence_id: n.evidence_id, step: n.pattern_step_id })) : [{ text: 'No next steps. Wait for the transfer owner.' }], footer: 'Drafts are yours to edit and send. SalesLore never sends anything.' };
  }
  const lines = [{ text: `${acct.segment}, ${acct.stage}, $${Math.round(acct.amount / 1000)}K. Readiness: ${b.status}.` }];
  if (b.flag) lines.push({ text: b.flag[1] });
  if (b.summary) lines.push({ text: b.summary });
  return { ...base, kind: 'brief', title: `${acct.name} brief${b.approved ? ' (approved)' : ' (not yet approved)'}`, lines, footer: 'Ask "who decides", "what did Maya promise", "risks" or "next steps".' };
}
