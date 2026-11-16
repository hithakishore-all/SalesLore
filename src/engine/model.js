// Wording for the brief summary. "scripted" (default) is deterministic and works offline.
// "anthropic" asks a live model to phrase the summary, using ONLY the cited claims it is given.
// Either way, claims, evidence IDs and next steps come from the governed view, never from the model.

const fmtMoney = n => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);

export function scriptedSummary(account, draft, status) {
  const lead = { stop: 'On hold', risk: 'At risk', unknown: 'Thin on evidence', review: 'Needs a person to settle a conflict', ready: 'Ready to work' }[status];
  const decider = draft.people.find(p => p.relationship === 'decides_for');
  const who = decider ? `${decider.name} decides.` : 'No decision maker on record yet.';
  const first = draft.next[0] ? ` First step: ${draft.next[0].text.charAt(0).toLowerCase()}${draft.next[0].text.slice(1)}.` : '';
  return `${lead}. ${account.name}, ${account.segment.toLowerCase()} ${account.stage.toLowerCase()} deal worth ${fmtMoney(account.amount)}. ${who}${first}`;
}

export async function wordSummary(cfg, account, draft, status, fetchImpl = globalThis.fetch) {
  const fallback = scriptedSummary(account, draft, status);
  if (cfg.model !== 'anthropic' || !cfg.anthropicKey) return fallback;
  const facts = draft.claims.map(c => `- ${c.text} [${c.evidence_id}]`).join('\n');
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.anthropicModel, max_tokens: 200,
        system: 'You write one or two plain sentences summarizing an inherited sales account for the new account executive. Use only the facts given. Do not add numbers, names or promises that are not in the facts. No evidence IDs in your text.',
        messages: [{ role: 'user', content: `Account: ${account.name} (${account.segment}, ${account.stage}). Status: ${status}.\nFacts:\n${facts}` }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const text = body.content?.find(b => b.type === 'text')?.text?.trim();
    return text || fallback;
  } catch (err) {
    console.warn(`[model] Live wording failed (${err.message}); using scripted wording.`);
    return fallback;
  }
}
