// Express web console + JSON API. Shares the engine and store with the Slack bot.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgents, approve, readiness, SalesLoreError } from './engine/agents.js';
import { answer, briefFor } from './companion.js';
import { slackStatus } from './config.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const ID_RE = /^[a-z0-9-]{1,64}$/;

export function createApp({ store, cfg }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const checkId = (v, what) => { if (!ID_RE.test(String(v || ''))) throw new SalesLoreError(400, `Invalid ${what}. Use lowercase letters, digits and dashes.`); };

  // Demo identity: the console's user picker sends X-SalesLore-User. Put SSO in front of this in production.
  async function actor(req) {
    const id = String(req.get('X-SalesLore-User') || 'dana').toLowerCase();
    checkId(id, 'user');
    const sellers = await store.sellers();
    const s = sellers.find(x => x.seller_id === id);
    if (!s) throw new SalesLoreError(400, `Unknown user "${id}". Valid users: ${sellers.map(x => x.seller_id).join(', ')}.`);
    return s;
  }

  app.get('/api/health', wrap(async (req, res) => {
    let db;
    try { db = await store.health(); } catch (err) { return res.status(503).json({ ok: false, store: store.mode, error: `Database unreachable: ${err.message}. See docs/TROUBLESHOOTING.md.` }); }
    res.json({ ...db, model: cfg.model, slack: slackStatus(cfg).reason });
  }));

  app.get('/api/bootstrap', wrap(async (req, res) => {
    const [transfer, sellers, accounts, patterns, config, approvals] = await Promise.all([
      store.transfer(), store.sellers(), store.accounts(), store.patterns(), store.config(), store.approvals()]);
    const approvedAccounts = new Set(approvals.map(a => a.account_id));
    const rows = [];
    for (const a of accounts) {
      const ctx = await store.context(a.account_id);
      const run = await store.latestRun(a.account_id);
      rows.push({ ...a, readiness: readiness(ctx), approved: approvedAccounts.has(a.account_id), last_run: run ? { run_id: run.run_id, status: run.status } : null });
    }
    res.json({ mode: store.mode, model: cfg.model, today: config.demo_today || null, transfer, sellers, accounts: rows, patterns });
  }));

  app.get('/api/accounts/:id', wrap(async (req, res) => {
    checkId(req.params.id, 'account id');
    if (!(await store.account(req.params.id))) throw new SalesLoreError(404, `No account with id "${req.params.id}".`);
    const brief = await briefFor(store, cfg, req.params.id);
    const run = await store.latestRun(req.params.id);
    res.json({ brief, run: run ? { run_id: run.run_id, status: run.status, attempts: run.attempts, log: run.log } : null });
  }));

  app.get('/api/accounts/:id/graph', wrap(async (req, res) => {
    checkId(req.params.id, 'account id');
    if (!(await store.account(req.params.id))) throw new SalesLoreError(404, `No account with id "${req.params.id}".`);
    res.json(await store.graph(req.params.id));
  }));

  app.post('/api/accounts/:id/runs', wrap(async (req, res) => {
    checkId(req.params.id, 'account id');
    const run = await runAgents(store, cfg, req.params.id, await actor(req));
    res.status(201).json(run);
  }));

  app.post('/api/runs/:runId/approve', wrap(async (req, res) => {
    if (!/^[a-z0-9-]{1,96}$/.test(req.params.runId)) throw new SalesLoreError(400, 'Invalid run id.');
    const result = await approve(store, req.params.runId, await actor(req));
    res.status(result.created ? 201 : 200).json(result);
  }));

  app.post('/api/ask', wrap(async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || !question.trim()) throw new SalesLoreError(400, 'Send JSON like {"question": "Who decides at Halcyon?"}.');
    if (question.length > 500) throw new SalesLoreError(400, 'Questions are limited to 500 characters.');
    const accountId = req.body?.account_id;
    if (accountId != null) checkId(accountId, 'account id');
    const who = await actor(req);
    const out = await answer(store, cfg, question, accountId);
    await store.log({ actor: who.name, action: 'ask', account_id: out.account_id || null, detail: question.slice(0, 200) });
    res.json(out);
  }));

  app.get('/api/evidence/:id', wrap(async (req, res) => {
    if (!/^EV-[A-Z]{3,4}-\d{3,4}$/.test(req.params.id)) throw new SalesLoreError(400, 'Invalid evidence id.');
    const ev = await store.evidenceById(req.params.id);
    if (!ev) throw new SalesLoreError(404, `No evidence with id "${req.params.id}".`);
    res.json(ev);
  }));

  app.get('/api/audit', wrap(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(await store.auditLog(limit));
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.path}.` }));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  // Errors: 4xx for bad input, JSON always.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    if (err instanceof SalesLoreError) return res.status(err.status).json({ error: err.message });
    console.error('[server]', err);
    res.status(500).json({ error: 'Something went wrong on the server. Check the terminal log.' });
  });
  return app;
}

export function listen(app, cfg) {
  return new Promise((resolve, reject) => {
    const server = app.listen(cfg.port, cfg.host, () => resolve(server));
    server.on('error', reject);
  });
}

export { PUBLIC_DIR, path };
