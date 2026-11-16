// SalesLore web console. Talks only to this server's JSON API.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n / 1000).toLocaleString() + 'K';
const fmtDate = d => d ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const STATUS = { ready: ['Ready', 's-ready'], review: ['Needs review', 's-review'], risk: ['At risk', 's-risk'], stop: ['Stop', 's-stop'], unknown: ['Unknown', 's-unknown'] };
const pill = st => `<span class="pill ${STATUS[st][1]}">${STATUS[st][0]}</span>`;

const state = { user: localStorageGet('saleslore-user') || 'dana', acct: null, boot: null, chat: [], evCache: {} };
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be unavailable */ } }

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { ...opts, headers: { 'content-type': 'application/json', 'X-SalesLore-User': state.user, ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status });
  return body;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); }
const rc = id => id ? `<button class="rc" aria-expanded="false" data-ev="${esc(id)}" title="Show the source">${esc(id)}</button>` : '';
const userName = () => state.boot.sellers.find(s => s.seller_id === state.user)?.name || state.user;

// Receipts: click an evidence ID to unfold its source in place.
document.addEventListener('click', async e => {
  const b = e.target.closest('.rc'); if (!b) return;
  e.preventDefault();
  const next = b.nextElementSibling?.classList.contains('receipt') ? b.nextElementSibling : null;
  if (b.getAttribute('aria-expanded') === 'true' && next) { next.remove(); b.setAttribute('aria-expanded', 'false'); return; }
  const id = b.dataset.ev;
  try {
    const ev = state.evCache[id] ||= await api('/evidence/' + encodeURIComponent(id));
    const r = document.createElement('span'); r.className = 'receipt';
    r.innerHTML = `<q>${esc(ev.text)}</q><span class="src">${esc(ev.source_system)} · ${esc(ev.speaker)} · ${fmtDate(ev.source_date)} · ${esc(id)}</span>`;
    b.after(r); b.setAttribute('aria-expanded', 'true');
  } catch (err) { toast(err.message); }
});

function acctList(view) {
  return `<div class="panel acct-list" role="group" aria-label="Accounts">${state.boot.accounts.map(a => `<button data-pick="${a.account_id}" data-view="${view}" aria-pressed="${a.account_id === state.acct}">
    <span>${esc(a.name)}<small>${esc(a.segment)} · ${money(a.amount)}</small></span>${pill(a.readiness)}</button>`).join('')}</div>`;
}

async function vOverview() {
  const b = state.boot; const accts = b.accounts;
  const count = st => accts.filter(a => a.readiness === st).length;
  const total = accts.reduce((s, a) => s + a.amount, 0);
  const t = b.transfer;
  return `<div class="view-head"><div><h1>${esc(t.from_name)}'s book moves to ${esc(t.to_name)}</h1>
    <p>${esc(t.to_name)} inherits ${accts.length} accounts. SalesLore builds a cited brief for each one from the governed view, and ${esc(t.owner_name)} approves before ${esc(t.to_name)} relies on it.</p></div>
    <div class="btn-row"><a class="btn" href="#transfers" style="text-decoration:none">Run the agents</a></div></div>
  <div class="stats" role="list">
    <div class="stat" role="listitem"><b>${money(total)}</b><span>Inherited pipeline</span></div>
    <div class="stat" role="listitem"><b>${count('ready')}</b><span>Ready</span></div>
    <div class="stat" role="listitem"><b>${count('review') + count('risk')}</b><span>Needs review or at risk</span></div>
    <div class="stat" role="listitem"><b>${count('stop')}</b><span>Stopped</span></div>
    <div class="stat" role="listitem"><b>${accts.filter(a => a.approved).length} of ${accts.length}</b><span>Briefs approved</span></div>
  </div>
  <div class="panel" style="overflow-x:auto"><table><thead><tr><th>Account</th><th>Segment</th><th>Stage</th><th class="num">Pipeline</th><th>Readiness</th><th>Brief</th><th>What this record shows</th></tr></thead><tbody>
  ${accts.map(a => `<tr class="click" data-go="${a.account_id}" tabindex="0"><td><b>${esc(a.name)}</b></td><td>${esc(a.segment)}</td><td>${esc(a.stage)}</td><td class="num">${money(a.amount)}</td><td>${pill(a.readiness)}</td>
    <td>${a.approved ? '<span class="pill s-approved">Approved</span>' : a.last_run ? `<span class="muted">${esc(a.last_run.status)}</span>` : '<span class="muted">Not run</span>'}</td><td class="muted">${esc(a.proves)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

async function vSellers() {
  const p = state.boot.patterns; const seller = p[0]?.seller_name || 'Seller';
  return `<div class="view-head"><div><h1>Seller DNA: ${esc(seller)}</h1>
    <p>How ${esc(seller)} works, distilled from calls and emails, then reviewed by ${esc(seller)}. Only approved steps are ever coached.</p></div></div>
  <div class="panel">${p.map(s => `<div class="pattern ${s.status === 'rejected' ? 'rejected' : ''}">
    <div><h3>${esc(s.step_id)} · ${esc(s.text)}</h3><p>Applies to: ${esc(s.segments.join(', '))}${rc(s.evidence_id)}</p>${s.note ? `<p>${esc(s.note)}</p>` : ''}</div>
    <div>${s.status === 'approved' ? `<span class="pill s-ready">Approved by ${esc(seller.split(' ')[0])}</span>` : s.status === 'rejected' ? `<span class="pill s-stop">Rejected by ${esc(seller.split(' ')[0])}</span>` : '<span class="pill s-unknown">Proposed</span>'}</div></div>`).join('')}</div>`;
}

function briefHtml(b) {
  const li = c => `<li>${esc(c.text)}${rc(c.evidence_id)}</li>`;
  let h = `<article class="panel pad dossier"><h2>${esc(b.account.name)}</h2>
    <div class="meta">${esc(b.account.segment)} · ${esc(b.account.stage)} · ${money(b.account.amount)} · from ${esc(b.transfer.from)} to ${esc(b.transfer.to)} ${pill(b.status)} ${b.approved ? `<span class="pill s-approved">Approved by ${esc(b.transfer.owner.split(' ')[0])}</span>` : ''}</div>`;
  if (b.flag) h += `<div class="notice ${b.flag[0]}">${esc(b.flag[1])}</div>`;
  if (b.summary) h += `<p style="margin-top:14px">${esc(b.summary)}</p>`;
  if (b.preview) h += `<p class="muted" style="font-family:var(--font-ui);font-size:13px;margin-top:10px">Preview. Run the agents in Transfers to produce a brief for approval.</p>`;
  h += `<h3>Who matters</h3>` + (b.people.length ? `<ul>${b.people.map(p => `<li><b>${esc(p.name)}</b> (${esc(p.role)})${p.stale ? ' <span class="pill s-risk">stale</span>' : ''}. ${esc(p.text.slice(p.name.length + 2))}${rc(p.evidence_id)}</li>`).join('')}</ul>` : `<p class="unknown-val">Unknown. No evidence names a decision maker.</p>`);
  if (b.unknowns.length) h += `<h3>Unknown</h3><ul>${b.unknowns.map(u => `<li><span class="unknown-val">${esc(u)}: unknown</span></li>`).join('')}</ul>`;
  if (b.facts.length) h += `<h3>What we know</h3><ul>${b.facts.map(li).join('')}</ul>`;
  if (b.conflicts.length) h += `<h3>Conflicting evidence</h3><ul>${b.conflicts.flatMap(c => c.items).map(i => `<li>${fmtDate(i.date)}: “${esc(i.text)}”${rc(i.evidence_id)}</li>`).join('')}</ul>`;
  h += `<h3>Open promises</h3>` + (b.commitments.length ? `<ul>${b.commitments.map(li).join('')}</ul>` : `<p class="muted">None on record.</p>`);
  h += `<h3>Risks</h3>` + (b.risks.length ? `<ul>${b.risks.map(li).join('')}</ul>` : `<p class="muted">None on record.</p>`);
  h += `<h3>Next steps, the way ${esc(b.transfer.from.split(' ')[0])} worked</h3>` + (b.next.length ? `<ol>${b.next.map(n => `<li>${esc(n.text)}${rc(n.evidence_id)}${n.pattern_step_id ? `<span class="step-tag">${esc(n.pattern_step_id)}</span>` : ''}</li>`).join('')}</ol>` : `<p><b>No outreach.</b> Wait for ${esc(b.transfer.owner)}'s decision.</p>`);
  h += `<p class="muted" style="font-family:var(--font-ui);font-size:13px;margin-top:18px">${esc(b.transfer.to)} owns every customer message. SalesLore drafts and cites; it never sends.</p></article>`;
  return h;
}

async function vAccounts() {
  const { brief } = await api('/accounts/' + state.acct);
  return `<div class="view-head"><div><h1>Account Memory</h1><p>One brief per inherited account. Click any yellow receipt to see the source behind a claim.</p></div>
    <div class="btn-row"><a class="btn ghost" href="#graph" style="text-decoration:none">View graph</a><a class="btn" href="#transfers" style="text-decoration:none">Run agents</a></div></div>
  <div class="split">${acctList('accounts')}${briefHtml(brief)}</div>`;
}

const NODE_STYLE = { account: ['var(--navy)', '#fff', 'var(--navy)'], seller: ['var(--navy-2)', '#fff', 'var(--navy-2)'], opportunity: ['var(--amber-soft)', 'var(--ink)', 'var(--line)'],
  person: ['var(--sage-soft)', 'var(--ink)', 'var(--line)'], commitment: ['var(--paper)', 'var(--ink)', 'var(--sun)'], risk: ['var(--critical-soft)', 'var(--ink)', 'var(--critical)'],
  fact: ['var(--paper)', 'var(--ink)', 'var(--line)'], pattern_step: ['var(--paper)', 'var(--ink)', 'var(--sage)'], unknown: ['var(--unknown-soft)', 'var(--unknown)', 'var(--unknown)'] };
const REL = { decides_for: 'decides', champion_of: 'champion', influences: 'influences', blocks: 'blocks', owns: 'owns', has_deal: 'has deal', promised: 'promised', describes: 'describes', applies_to: 'applies to', unknown: '?' };
let graphCache = null;
async function vGraph() {
  const g = graphCache = await api(`/accounts/${state.acct}/graph`);
  const a = state.boot.accounts.find(x => x.account_id === state.acct);
  const pos = {}; const by = t => g.nodes.filter(n => n.node_type === t);
  const col = (arr, x, y0, y1) => arr.forEach((n, i) => { pos[n.node_id] = [x, arr.length === 1 ? (y0 + y1) / 2 : y0 + (i * (y1 - y0)) / (arr.length - 1)]; });
  by('account').forEach(n => (pos[n.node_id] = [430, 250]));
  by('opportunity').forEach(n => (pos[n.node_id] = [430, 390]));
  by('seller').forEach(n => (pos[n.node_id] = [300, 60]));
  col([...by('person'), ...by('unknown')], 750, 120, 440);
  col(by('pattern_step'), 110, 160, 440);
  const slots = [[580, 60], [110, 60], [110, 520], [760, 520]];
  [...by('commitment'), ...by('fact')].slice(0, slots.length).forEach((n, i) => (pos[n.node_id] = slots[i]));
  by('risk').forEach((n, i, arr) => (pos[n.node_id] = [430 + (i - (arr.length - 1) / 2) * 200, 505]));
  const clip = (s, n) => (s = String(s ?? '')).length > n ? s.slice(0, n - 1) + '…' : s;
  const edges = g.edges.filter(e => pos[e.from_node] && pos[e.to_node]).map(e => {
    const [x1, y1] = pos[e.from_node], [x2, y2] = pos[e.to_node];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)" stroke-width="1.6" ${e.rel === 'unknown' ? 'stroke-dasharray="5 5"' : ''}/>
      <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" font-size="12" fill="var(--muted)" paint-order="stroke" stroke="var(--paper)" stroke-width="4">${esc(REL[e.rel] || e.rel)}</text>`;
  }).join('');
  const nodes = g.nodes.filter(n => pos[n.node_id]).map(n => {
    const [x, y] = pos[n.node_id]; const [fill, ink, stroke] = NODE_STYLE[n.node_type]; const w = n.node_type === 'account' ? 196 : 172;
    return `<g class="g-node" tabindex="0" role="button" data-node="${esc(n.node_id)}" aria-label="${esc(n.label + ', ' + (n.detail || ''))}">
      <rect x="${x - w / 2}" y="${y - 25}" width="${w}" height="50" rx="9" fill="${fill}" stroke="${n.is_stale ? 'var(--amber)' : stroke}" ${n.node_type === 'unknown' || n.is_stale ? 'stroke-dasharray="5 4"' : ''}/>
      <text x="${x}" y="${y - 4}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${ink}">${esc(clip(n.label, 24))}</text>
      <text x="${x}" y="${y + 14}" text-anchor="middle" font-size="11.5" fill="${ink}" opacity=".8">${esc(clip(n.detail, 28))}</text></g>`;
  }).join('');
  return `<div class="view-head"><div><h1>Knowledge Graph</h1><p>The context graph for one account, read from Postgres. Edges from a source carry an evidence ID. Click a node to see what it rests on.</p></div></div>
  <div class="split">${acctList('graph')}<div><div class="panel pad graph-wrap"><svg class="graph" viewBox="0 0 860 560" role="img" aria-label="Context graph for ${esc(a.name)}">${edges}${nodes}</svg>
    <div class="legend"><span><i style="background:var(--sage-soft)"></i>Person</span><span><i style="background:var(--amber-soft)"></i>Deal</span><span><i style="background:var(--paper);border:1px solid var(--sun)"></i>Promise</span><span><i style="background:var(--critical-soft)"></i>Risk</span><span><i style="background:var(--paper);border:1px solid var(--sage)"></i>Pattern step</span><span><i style="background:var(--unknown-soft)"></i>Unknown (dashed)</span></div></div>
    <div class="panel pad" id="node-detail" style="margin-top:14px"><p class="muted" style="margin:0">Select a node to see its evidence.</p></div></div></div>`;
}
async function showNode(id) {
  const n = graphCache.nodes.find(x => x.node_id === id); if (!n) return;
  const ids = [...new Set([n.evidence_id, ...graphCache.edges.filter(e => (e.from_node === id || e.to_node === id) && e.evidence_id).map(e => e.evidence_id)].filter(Boolean))];
  const evs = await Promise.all(ids.map(async i => (state.evCache[i] ||= await api('/evidence/' + encodeURIComponent(i)))));
  $('#node-detail').innerHTML = `<h2 style="font-size:17px">${esc(n.label)}</h2><p class="muted" style="margin:2px 0 10px">${esc(n.detail || '')}${n.is_stale ? ' · stale' : ''}</p>` +
    (evs.length ? evs.map(ev => `<div class="receipt"><q>${esc(ev.text)}</q><span class="src">${esc(ev.source_system)} · ${esc(ev.speaker)} · ${fmtDate(ev.source_date)} · ${esc(ev.evidence_id)}</span></div>`).join('')
      : `<p class="muted" style="margin:0">${n.node_type === 'unknown' ? 'No evidence found, so SalesLore leaves this unknown.' : 'Structural node from Salesforce ownership and deal records.'}</p>`);
}

const STAGES = [['Discover', 'Find accounts in scope'], ['Research', 'Pull cited evidence'], ['Compose', 'Draft brief and steps'], ['Validate', 'Reject uncited claims'], ['Approve', 'Owner only, sends nothing']];
async function vTransfers() {
  const a = state.boot.accounts.find(x => x.account_id === state.acct);
  return `<div class="view-head"><div><h1>Knowledge Transfer</h1><p>Run the agents on one account and watch each stage. Validate retries at most twice, then escalates. Only ${esc(state.boot.transfer.owner_name)}, the owner, can approve.</p></div>
    <div class="btn-row"><button class="btn" id="run">Run agents on ${esc(a.name)}</button></div></div>
  <div class="split">${acctList('transfers')}<div>
    <div class="stages">${STAGES.map((s, i) => `<div class="stage" id="st${i}"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}</div>
    <div class="grid2"><div class="panel pad"><h2 style="font-size:17px;margin-bottom:8px">Run log</h2><ul class="log" id="runlog"><li><span class="who muted">Idle</span><span class="muted">Press Run to start.</span></li></ul></div>
    <div class="panel pad" id="approve-box"><h2 style="font-size:17px;margin-bottom:8px">Approval</h2><p class="muted" style="margin:0">Waiting for a validated brief.</p></div></div>
  </div></div>`;
}
async function runAgents() {
  const btn = $('#run'); btn.disabled = true;
  const ul = $('#runlog'); ul.innerHTML = '<li><span class="who">Running</span><span class="muted">Agents are working...</span></li>';
  STAGES.forEach((_, i) => ($('#st' + i).className = 'stage'));
  let run;
  try { run = await api(`/accounts/${state.acct}/runs`, { method: 'POST' }); }
  catch (err) { ul.innerHTML = `<li><span class="who bad">Error</span><span class="bad">${esc(err.message)}</span></li>`; btn.disabled = false; return; }
  ul.innerHTML = '';
  const idx = { Discover: 0, Research: 1, Compose: 2, Validate: 3 };
  const gap = matchMedia('(prefers-reduced-motion: reduce)').matches ? 60 : 650;
  for (const l of run.log) {
    STAGES.forEach((_, k) => { const el = $('#st' + k); if (el.classList.contains('active')) el.className = 'stage done'; });
    $('#st' + idx[l.stage]).className = 'stage ' + (l.kind === 'fail' ? 'fail' : 'active');
    ul.insertAdjacentHTML('beforeend', `<li><span class="who">${esc(l.stage)}</span><span class="${l.kind === 'fail' ? 'bad' : ''}">${esc(l.text)}</span></li>`);
    await new Promise(r => setTimeout(r, gap));
  }
  STAGES.slice(0, 4).forEach((_, k) => { const el = $('#st' + k); if (!el.classList.contains('fail')) el.className = 'stage done'; });
  btn.disabled = false;
  const box = $('#approve-box');
  if (run.status !== 'validated') {
    $('#st3').className = 'stage fail';
    box.innerHTML = `<h2 style="font-size:17px;margin-bottom:8px">Escalated to ${esc(state.boot.transfer.owner_name)}</h2><div class="notice stop" style="margin-top:0">${esc(run.brief.flag ? run.brief.flag[1] : 'No brief to approve.')}</div>`;
    await refreshBoot(); return;
  }
  $('#st4').className = 'stage active';
  box.innerHTML = `<h2 style="font-size:17px;margin-bottom:8px">Brief ready for approval</h2><p style="margin:0 0 12px" class="muted">Signed in as ${esc(userName())}. Approving publishes the brief to ${esc(state.boot.transfer.to_name)}. It sends nothing to the customer.</p>
    <div class="btn-row"><button class="btn" id="approve">Approve brief</button><a class="btn ghost" href="#accounts" style="text-decoration:none">Read the brief</a></div><p id="approve-msg" style="margin:10px 0 0;font-size:14px"></p>`;
  $('#approve').onclick = async () => {
    const msg = $('#approve-msg');
    try {
      const r = await api(`/runs/${run.run_id}/approve`, { method: 'POST' });
      $('#st4').className = 'stage done';
      msg.textContent = r.created ? `Approved. ${state.boot.transfer.to_name} can now rely on this brief.` : 'Already approved. Nothing changed.';
      if (r.created) toast('Brief approved for ' + run.brief.account.name);
      await refreshBoot();
    } catch (err) { msg.innerHTML = `<span style="color:var(--critical)">${esc(err.message)}</span>`; }
  };
  await refreshBoot();
}

function renderMsg(m) {
  if (m.role === 'user') return `<div class="msg"><div class="av leo">${esc(m.initials)}</div><div><div class="who">${esc(m.name)}<small>${esc(m.title)}</small></div><div class="body">${esc(m.text)}</div></div></div>`;
  const o = m.out;
  return `<div class="msg"><div class="av bot">SL</div><div><div class="who">SalesLore<small>app</small></div><div class="body"><b>${esc(o.title)}</b><ul>${o.lines.map(l => `<li>${esc(l.text)}${rc(l.evidence_id)}${l.step ? `<span class="step-tag">${esc(l.step)}</span>` : ''}</li>`).join('')}</ul>${o.footer ? `<span class="muted" style="font-size:13px">${esc(o.footer)}</span>` : ''}</div></div></div>`;
}
async function vCompanion() {
  const prompts = ['Who really decides at Halcyon?', 'What would Maya do next at Halcyon?', 'What did Maya promise Lumen?', 'What is the budget timing at Marlow?', '/saleslore next Pinecrest Bank', 'Who decides at Tidewater?'];
  return `<div class="view-head"><div><h1>SalesLore Companion, in Slack</h1><p>${esc(state.boot.transfer.to_name)} uses the Companion inside Slack. This panel calls the same API the Slack bot uses, so you can try it without a Slack workspace.</p></div></div>
  <div class="slack-bar" role="note"><span class="dot"></span><div><b>Slack view</b><br><span>SalesLore Companion lives in Slack. This is what ${esc(state.boot.transfer.to_name)} sees in his workspace.</span></div></div>
  <div class="slackwin"><nav class="side" aria-label="Slack sidebar"><div class="ws">Kestrel Cloud</div><div class="grp">Channels</div><div class="ch"># deals-enterprise</div><div class="ch on"># inherited-accounts</div><div class="ch"># sales-team</div><div class="grp">Apps</div><div class="ch slack-app">SalesLore</div></nav>
  <div class="chat"><div class="chat-head"># inherited-accounts <span>· Kestrel Cloud workspace</span></div>
    <div class="msgs" id="msgs">${state.chat.map(renderMsg).join('') || '<p class="muted">Ask a question or tap a suggestion below.</p>'}</div>
    <div class="chips">${prompts.map(p => `<button data-ask="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <form class="compose" id="ask-form"><label for="ask" style="position:absolute;left:-9999px">Ask SalesLore</label><input id="ask" placeholder="Ask about an inherited account" autocomplete="off" maxlength="500"><button class="btn">Send</button></form></div></div>`;
}
async function ask(q) {
  const me = state.boot.sellers.find(s => s.seller_id === state.user) || { name: state.user, role: '' };
  const msgs = $('#msgs');
  const user = { role: 'user', name: me.name, title: me.role, initials: me.name.split(' ').map(w => w[0]).join(''), text: q };
  try {
    const out = await api('/ask', { method: 'POST', body: JSON.stringify({ question: q, account_id: state.acct }) });
    state.chat.push(user, { role: 'bot', out });
    if (msgs.querySelector('p.muted')) msgs.innerHTML = '';
    msgs.insertAdjacentHTML('beforeend', renderMsg(user) + renderMsg({ role: 'bot', out }));
    msgs.scrollTop = 1e6;
  } catch (err) { toast(err.message); }
}

async function vGovernance() {
  const rows = await api('/audit?limit=200');
  return `<div class="view-head"><div><h1>Evidence Ledger</h1><p>Every agent step and human decision, newest first, from the audit log.</p></div></div>
  <div class="grid2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)"><div class="panel" style="overflow-x:auto"><table><thead><tr><th style="width:170px">When (UTC)</th><th style="width:150px">Who</th><th>What</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="muted">${esc(String(r.at).replace('T', ' ').slice(0, 16))}</td><td>${esc(r.actor)}</td><td>${esc(r.detail || r.action)}</td></tr>`).join('')}</tbody></table></div>
  <div class="panel pad"><h2 style="font-size:17px;margin-bottom:10px">Rules SalesLore keeps</h2><ul style="margin:0;padding-left:18px;font-size:14px">
    <li>Evidence before answers</li><li>Consent before capture</li><li>Owners approve; successors own every customer message</li><li>Personal details are filtered out</li><li>Missing, stale and conflicting facts are labeled</li><li>Every action is logged</li><li>No impersonation, no sending</li></ul>
    <p class="muted" style="font-size:13px;margin-top:14px">Agents read one governed view, app.v_saleslore_context.</p></div></div>`;
}

const VIEWS = { overview: vOverview, sellers: vSellers, accounts: vAccounts, graph: vGraph, transfers: vTransfers, companion: vCompanion, governance: vGovernance };
async function refreshBoot() { state.boot = await api('/bootstrap'); }
async function render() {
  const name = (location.hash || '#overview').slice(1); const v = VIEWS[name] ? name : 'overview';
  document.querySelectorAll('#nav a').forEach(l => l.setAttribute('aria-current', l.getAttribute('href') === '#' + v ? 'page' : 'false'));
  try { $('#view').innerHTML = await VIEWS[v](); }
  catch (err) { $('#view').innerHTML = `<div class="error"><b>Could not load this view.</b> ${esc(err.message)}</div>`; return; }
  if (v === 'transfers') $('#run').onclick = runAgents;
  if (v === 'companion') { $('#msgs').scrollTop = 1e6; $('#ask-form').onsubmit = e => { e.preventDefault(); const i = $('#ask'); if (i.value.trim()) { ask(i.value.trim()); i.value = ''; } }; }
}
document.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]'); if (pick) { state.acct = pick.dataset.pick; render(); return; }
  const go = e.target.closest('[data-go]'); if (go) { state.acct = go.dataset.go; location.hash = '#accounts'; return; }
  const q = e.target.closest('[data-ask]'); if (q) { ask(q.dataset.ask); return; }
  const n = e.target.closest('[data-node]'); if (n) showNode(n.dataset.node);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); state.acct = go.dataset.go; location.hash = '#accounts'; }
  const n = e.target.closest('[data-node]'); if (n) { e.preventDefault(); showNode(n.dataset.node); }
});

async function init() {
  try { await refreshBoot(); }
  catch (err) { $('#view').innerHTML = `<div class="error"><b>SalesLore cannot reach its API.</b> ${esc(err.message)}. Is the server running? See docs/TROUBLESHOOTING.md.</div>`; return; }
  state.acct = state.boot.accounts.find(a => a.account_id === 'halcyon')?.account_id || state.boot.accounts[0].account_id;
  const who = $('#who');
  who.innerHTML = state.boot.sellers.map(s => `<option value="${esc(s.seller_id)}">${esc(s.name)}, ${esc(s.role)}</option>`).join('');
  if (!state.boot.sellers.some(s => s.seller_id === state.user)) state.user = state.boot.transfer.owner_id;
  who.value = state.user;
  who.onchange = () => { state.user = who.value; localStorageSet('saleslore-user', state.user); toast('Now signed in as ' + userName()); render(); };
  $('#mode').innerHTML = `${state.boot.mode === 'live' ? 'live Postgres' : 'offline snapshot'}<span class="mode-chip">${esc(state.boot.model)}</span>`;
  if (state.boot.today) $('#banner').textContent = `Synthetic demo data. Every company, person, quote and number is fictional. Demo date pinned to ${fmtDate(state.boot.today)}.`;
  addEventListener('hashchange', render);
  render();
}
init();
