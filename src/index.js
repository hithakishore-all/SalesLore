#!/usr/bin/env node
// SalesLore entry point: web console + API, plus the Slack bot when tokens are set.
//   npm start            live mode (Postgres from DATABASE_URL)
//   npm run offline      offline mode (fixtures snapshot, no accounts needed)
import { loadConfig, checkConfig, slackStatus } from './config.js';
import { createStore } from './store/index.js';
import { createApp, listen } from './server.js';

const cfg = loadConfig();
const problems = checkConfig(cfg);
if (problems.length) {
  console.error('\nSalesLore cannot start yet:\n');
  for (const p of problems) console.error(`  - ${p.what}\n    Fix: ${p.fix}\n`);
  process.exit(1);
}

const store = createStore(cfg);
try {
  await store.health();
} catch (err) {
  console.error(`\nCannot reach Postgres: ${err.message}\nFix: check DATABASE_URL and that Postgres is running (docs/SETUP_POSTGRES.md), or run: npm run offline\n`);
  process.exit(1);
}

const app = createApp({ store, cfg });
let server;
try {
  server = await listen(app, cfg);
} catch (err) {
  console.error(err.code === 'EADDRINUSE' ? `\nPort ${cfg.port} is already in use. Set PORT=3001 in .env or stop the other process.\n` : err);
  process.exit(1);
}
console.log(`\nSalesLore is running (${store.mode} mode, ${cfg.model} wording)`);
console.log(`  Web console: http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`);

let slackApp = null;
const slack = slackStatus(cfg);
console.log(`  ${slack.reason}`);
if (slack.enabled) {
  const { startSlack } = await import('./slack.js');
  try { slackApp = await startSlack({ store, cfg }); console.log('  Slack: connected. Try /saleslore help'); }
  catch (err) { console.error(`  Slack failed to start: ${err.message}. See docs/TROUBLESHOOTING.md#slack`); }
}
console.log('  Press Ctrl+C to stop.\n');

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received, shutting down...`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  try {
    if (slackApp) await slackApp.stop();
    await new Promise(r => server.close(r));
    await store.close();
  } finally { process.exit(0); }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
