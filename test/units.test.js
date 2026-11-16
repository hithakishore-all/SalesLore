// Unit tests: configuration checks and that the offline snapshot matches the SQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadConfig, checkConfig, slackStatus, parseUserMap } from '../src/config.js';
import { sqlFiles, readSql } from '../scripts/sql-files.mjs';
import { scriptedSummary } from '../src/engine/model.js';

test('config: live mode without DATABASE_URL says how to fix it', () => {
  const p = checkConfig(loadConfig(['node', 'x'], {}));
  assert.equal(p.length, 1);
  assert.match(p[0].fix, /npm run offline/);
});

test('config: offline needs nothing; bad MODEL is caught', () => {
  assert.equal(checkConfig(loadConfig(['node', 'x', '--offline'], {})).length, 0);
  assert.match(checkConfig(loadConfig(['node', 'x', '--offline'], { MODEL: 'gpt' }))[0].what, /not supported/);
  assert.match(checkConfig(loadConfig(['node', 'x', '--offline'], { MODEL: 'anthropic' }))[0].what, /ANTHROPIC_API_KEY/);
});

test('config: Slack token checks look at presence and prefix only', () => {
  assert.equal(slackStatus(loadConfig(['n'], {})).enabled, false);
  assert.match(slackStatus(loadConfig(['n'], { SLACK_BOT_TOKEN: 'abc', SLACK_APP_TOKEN: 'xapp-1' })).reason, /xoxb-/);
  assert.equal(slackStatus(loadConfig(['n'], { SLACK_BOT_TOKEN: 'xoxb-1', SLACK_APP_TOKEN: 'xapp-1' })).enabled, true);
  assert.deepEqual(parseUserMap(' U1=dana, U2 = leo ,bad'), { U1: 'dana', U2: 'leo' });
});

test('scripted wording is deterministic', () => {
  const draft = { people: [{ name: 'A', relationship: 'decides_for' }], next: [{ text: 'Call A' }] };
  const acct = { name: 'X', segment: 'Enterprise', stage: 'Proposal', amount: 100000 };
  assert.equal(scriptedSummary(acct, draft, 'ready'), scriptedSummary(acct, draft, 'ready'));
});

test('offline snapshot matches what the SQL produces today', async () => {
  const db = new PGlite({ parsers: { 1082: v => v, 1700: v => Number(v) } });
  for (const f of sqlFiles({ includeRole: false })) await db.exec(readSql(f));
  const ctx = (await db.query('SELECT * FROM app.v_saleslore_context ORDER BY account_id, item_type, sort_order, item_key')).rows;
  const snap = JSON.parse(fs.readFileSync(new URL('../fixtures/snapshot.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx)), snap.context, 'Run: npm run build:fixtures');
  await db.close();
});
