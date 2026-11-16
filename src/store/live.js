// Live store: Postgres through the least-privilege saleslore_app user.
// Reads only the governed views in the app schema.
import pg from 'pg';

pg.types.setTypeParser(1082, v => v); // DATE as 'YYYY-MM-DD', no timezone shifts
pg.types.setTypeParser(1700, v => Number(v)); // NUMERIC as number

export function createLiveStore(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.SALESLORE_DB_POOL_MAX || 5) });
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
  return {
    mode: 'live',
    async health() {
      const [r] = await q("SELECT app.today()::text AS today, (SELECT count(*)::int FROM app.v_accounts) AS accounts");
      return { ok: true, store: 'live', today: r.today, accounts: r.accounts };
    },
    async config() {
      const rows = await q('SELECT key, value FROM app.config');
      return Object.fromEntries(rows.map(r => [r.key, r.value]));
    },
    async accounts() { return q('SELECT * FROM app.v_accounts ORDER BY amount DESC, name'); },
    async account(id) { return (await q('SELECT * FROM app.v_accounts WHERE account_id = $1', [id]))[0] || null; },
    async context(id) { return q('SELECT * FROM app.v_saleslore_context WHERE account_id = $1 ORDER BY item_type, sort_order, item_key', [id]); },
    async evidence(ids) { return ids.length ? q('SELECT * FROM app.v_evidence WHERE evidence_id = ANY($1)', [ids]) : []; },
    async evidenceById(id) { return (await q('SELECT * FROM app.v_evidence WHERE evidence_id = $1', [id]))[0] || null; },
    async patterns() { return q('SELECT * FROM app.v_pattern_steps ORDER BY step_id'); },
    async sellers() { return q('SELECT * FROM app.v_sellers ORDER BY seller_id'); },
    async transfer() { return (await q('SELECT * FROM app.v_transfers ORDER BY started_on DESC LIMIT 1'))[0] || null; },
    async graph(id) {
      const edges = await q('SELECT * FROM app.v_graph_edges WHERE account_id = $1', [id]);
      const ids = [...new Set(edges.flatMap(e => [e.from_node, e.to_node]))];
      const nodes = await q('SELECT * FROM app.v_graph_nodes WHERE account_id = $1 OR node_id = ANY($2)', [id, ids]);
      return { nodes, edges };
    },
    async saveRun(run) {
      await q(`INSERT INTO app.runs (run_id, account_id, status, attempts, brief, log, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (run_id) DO NOTHING`,
        [run.run_id, run.account_id, run.status, run.attempts, JSON.stringify(run.brief), JSON.stringify(run.log), run.created_by]);
      return run;
    },
    async latestRun(id) { return (await q('SELECT * FROM app.runs WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1', [id]))[0] || null; },
    async run(runId) { return (await q('SELECT * FROM app.runs WHERE run_id = $1', [runId]))[0] || null; },
    async approval(runId) { return (await q('SELECT * FROM app.approvals WHERE run_id = $1', [runId]))[0] || null; },
    async approvals() { return q('SELECT * FROM app.approvals'); },
    async approve({ run_id, account_id, approved_by }) {
      const rows = await q(`INSERT INTO app.approvals (run_id, account_id, approved_by) VALUES ($1, $2, $3)
                            ON CONFLICT (run_id) DO NOTHING RETURNING *`, [run_id, account_id, approved_by]);
      if (rows.length) return { created: true, approval: rows[0] };
      return { created: false, approval: (await q('SELECT * FROM app.approvals WHERE run_id = $1', [run_id]))[0] };
    },
    async log({ actor, action, account_id = null, detail = null, idempotency_key = null }) {
      const rows = await q(`INSERT INTO app.audit_log (actor, action, account_id, detail, idempotency_key)
                            VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING event_id`,
        [actor, action, account_id, detail, idempotency_key]);
      return rows.length > 0;
    },
    async auditLog(limit = 200) { return q('SELECT * FROM app.audit_log ORDER BY at DESC, event_id DESC LIMIT $1', [limit]); },
    async close() { await pool.end(); },
  };
}
