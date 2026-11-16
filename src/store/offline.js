// Offline store: reads the fixtures snapshot built from the real SQL (npm run build:fixtures)
// and keeps runs, approvals and the audit log in memory.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_SNAPSHOT = fileURLToPath(new URL('../../fixtures/snapshot.json', import.meta.url));

export function createOfflineStore(path = DEFAULT_SNAPSHOT) {
  if (!fs.existsSync(path)) throw new Error(`Offline snapshot not found at ${path}. Run: npm run build:fixtures`);
  const snap = JSON.parse(fs.readFileSync(path, 'utf8'));
  const runs = [];
  const approvals = [];
  const audit = snap.audit_seed.map((e, i) => ({ event_id: i + 1, ...e }));
  const keys = new Set();
  return {
    mode: 'offline',
    async health() { return { ok: true, store: 'offline', snapshot_built_at: snap.built_at }; },
    async config() { return { ...snap.config }; },
    async accounts() { return snap.accounts; },
    async account(id) { return snap.accounts.find(a => a.account_id === id) || null; },
    async context(id) { return snap.context.filter(r => r.account_id === id); },
    async evidence(ids) { return snap.evidence.filter(e => ids.includes(e.evidence_id)); },
    async evidenceById(id) { return snap.evidence.find(e => e.evidence_id === id) || null; },
    async patterns() { return snap.patterns; },
    async sellers() { return snap.sellers; },
    async transfer() { return snap.transfer; },
    async graph(id) {
      const nodes = snap.graph_nodes.filter(n => n.account_id === id);
      const edges = snap.graph_edges.filter(e => e.account_id === id);
      const ids = new Set(nodes.map(n => n.node_id));
      const extra = snap.graph_nodes.filter(n => !ids.has(n.node_id) && edges.some(e => e.from_node === n.node_id || e.to_node === n.node_id));
      return { nodes: [...nodes, ...extra], edges };
    },
    async saveRun(run) { runs.push({ ...run, created_at: new Date().toISOString() }); return run; },
    async latestRun(id) { return [...runs].reverse().find(r => r.account_id === id) || null; },
    async run(runId) { return runs.find(r => r.run_id === runId) || null; },
    async approval(runId) { return approvals.find(a => a.run_id === runId) || null; },
    async approvals() { return approvals; },
    async approve({ run_id, account_id, approved_by }) {
      const existing = approvals.find(a => a.run_id === run_id);
      if (existing) return { created: false, approval: existing };
      const approval = { run_id, account_id, approved_by, approved_at: new Date().toISOString() };
      approvals.push(approval);
      return { created: true, approval };
    },
    async log({ actor, action, account_id = null, detail = null, idempotency_key = null }) {
      if (idempotency_key && keys.has(idempotency_key)) return false;
      if (idempotency_key) keys.add(idempotency_key);
      audit.push({ event_id: audit.length + 1, at: new Date().toISOString(), actor, action, account_id, detail, idempotency_key });
      return true;
    },
    async auditLog(limit = 200) { return [...audit].reverse().slice(0, limit); },
    async close() {},
  };
}
