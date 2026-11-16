// End-to-end smoke test: starts the real server (offline mode) on a free port and walks
// the whole SalesLore workflow through the HTTP API, including the failure paths.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let proc, base;

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer(); s.unref(); s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
async function call(method, path, { user = 'dana', body, raw } = {}) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'X-SalesLore-User': user }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), SALESLORE_HOST: '127.0.0.1', MODEL: 'scripted', SLACK_BOT_TOKEN: '', SLACK_APP_TOKEN: '', DATABASE_URL: '' };
  proc = spawn(process.execPath, ['src/index.js', '--offline', '--no-slack'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', d => (out += d)); proc.stderr.on('data', d => (out += d));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Server did not start:\n' + out);
});
after(() => new Promise(resolve => { proc.on('exit', resolve); proc.kill('SIGTERM'); }));

test('health reports offline store', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.store, 'offline');
});

test('bootstrap lists 10 accounts with the expected readiness', async () => {
  const r = await call('GET', '/api/bootstrap');
  assert.equal(r.status, 200);
  assert.equal(r.body.accounts.length, 10);
  const rd = Object.fromEntries(r.body.accounts.map(a => [a.account_id, a.readiness]));
  assert.deepEqual(
    { halcyon: rd.halcyon, pinecrest: rd.pinecrest, orchard: rd.orchard, tidewater: rd.tidewater, marlow: rd.marlow },
    { halcyon: 'ready', pinecrest: 'stop', orchard: 'risk', tidewater: 'unknown', marlow: 'review' });
  assert.equal(r.body.transfer.owner_id, 'dana');
});

test('every claim in a brief carries evidence', async () => {
  const r = await call('GET', '/api/accounts/halcyon');
  assert.equal(r.status, 200);
  const b = r.body.brief;
  for (const c of [...b.people, ...b.commitments, ...b.risks, ...b.facts, ...b.next]) assert.match(c.evidence_id, /^EV-/);
  assert.equal(b.people.find(p => p.relationship === 'decides_for').name, 'Priya Nair');
  assert.ok(b.next.some(n => n.pattern_step_id === 'PS-01'));
});

test('validator rejects the uncited claim, retries, then passes (Brightwater)', async () => {
  const r = await call('POST', '/api/accounts/brightwater/runs');
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'validated');
  assert.equal(r.body.attempts, 2);
  assert.ok(r.body.log.some(l => l.kind === 'fail' && /Champion has approved budget/.test(l.text)));
  assert.ok(!JSON.stringify(r.body.brief).includes('Champion has approved budget'));
});

test('approval is owner-only and idempotent', async () => {
  const run = (await call('POST', '/api/accounts/halcyon/runs')).body;
  const leo = await call('POST', `/api/runs/${run.run_id}/approve`, { user: 'leo' });
  assert.equal(leo.status, 403);
  assert.match(leo.body.error, /Dana Whitfield/);
  const first = await call('POST', `/api/runs/${run.run_id}/approve`);
  assert.equal(first.status, 201);
  assert.equal(first.body.created, true);
  const again = await call('POST', `/api/runs/${run.run_id}/approve`);
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  const boot = await call('GET', '/api/bootstrap');
  assert.equal(boot.body.accounts.find(a => a.account_id === 'halcyon').approved, true);
});

test('stop rule: Pinecrest escalates, has no outreach and cannot be approved', async () => {
  const run = (await call('POST', '/api/accounts/pinecrest/runs')).body;
  assert.equal(run.status, 'escalated');
  assert.equal(run.brief.next.length, 0);
  const ap = await call('POST', `/api/runs/${run.run_id}/approve`);
  assert.equal(ap.status, 409);
  const ask = await call('POST', '/api/ask', { body: { question: '/saleslore next Pinecrest Bank' } });
  assert.equal(ask.body.kind, 'stop');
});

test('unknowns, conflicts, privacy and pattern rules', async () => {
  const tide = (await call('GET', '/api/accounts/tidewater')).body.brief;
  assert.deepEqual([...tide.unknowns].sort(), ['Budget', 'Decision maker', 'Timeline']);
  const marlow = (await call('GET', '/api/accounts/marlow')).body.brief;
  assert.equal(marlow.conflicts[0].items.length, 2);
  const sable = (await call('GET', '/api/accounts/sable')).body.brief;
  assert.equal(sable.privacy_excluded, 1);
  assert.ok(!JSON.stringify(sable).includes('Family'));
  const corvid = (await call('GET', '/api/accounts/corvid')).body.brief;
  assert.ok(corvid.skipped.some(s => s.step === 'PS-08'));
  assert.ok(!corvid.next.some(n => n.pattern_step_id === 'PS-08'));
  const juniper = (await call('GET', '/api/accounts/juniper')).body.brief;
  assert.ok(juniper.skipped.some(s => s.step === 'PS-04'));
});

test('companion answers with evidence', async () => {
  const r = await call('POST', '/api/ask', { user: 'leo', body: { question: 'Who really decides at Halcyon?' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'people');
  assert.ok(r.body.lines.every(l => /^EV-/.test(l.evidence_id)));
});

test('bad input gets clear 4xx errors', async () => {
  assert.equal((await call('POST', '/api/ask', { body: {} })).status, 400);
  assert.equal((await call('POST', '/api/ask', { raw: '{not json' })).status, 400);
  assert.equal((await call('GET', '/api/accounts/NOT_VALID!')).status, 400);
  assert.equal((await call('GET', '/api/accounts/nope')).status, 404);
  assert.equal((await call('POST', '/api/accounts/halcyon/runs', { user: 'mallory' })).status, 400);
  assert.equal((await call('GET', '/api/evidence/EV-XXX-9999')).status, 404);
  assert.equal((await call('GET', '/api/does-not-exist')).status, 404);
});

test('audit log records agent steps, approvals and denials', async () => {
  const r = await call('GET', '/api/audit?limit=500');
  const actions = new Set(r.body.map(e => e.action));
  for (const a of ['discover', 'validate', 'approve', 'approve_denied', 'consent']) assert.ok(actions.has(a), `missing ${a}`);
});

test('web console is served', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /SalesLore/);
});
