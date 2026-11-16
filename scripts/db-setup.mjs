#!/usr/bin/env node
// Creates (or refreshes) the SalesLore database objects in Postgres. Safe to re-run.
// Uses DATABASE_ADMIN_URL (an admin login you own). If SALESLORE_DB_PASSWORD is set in .env,
// it also sets the app user's password, so you never type it into a SQL file.
//   npm run db:setup
import 'dotenv/config';
import pg from 'pg';
import { sqlFiles, readSql } from './sql-files.mjs';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL is not set. Add it to .env, for example:\n  DATABASE_ADMIN_URL=postgresql://localhost:5432/saleslore\nSee docs/SETUP_POSTGRES.md step 2.');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (err) {
  console.error(`Cannot connect with DATABASE_ADMIN_URL: ${err.message}\nIs Postgres running? See docs/SETUP_POSTGRES.md and docs/TROUBLESHOOTING.md.`);
  process.exit(1);
}
try {
  for (const f of sqlFiles()) {
    await client.query(readSql(f));
    console.log('  ran', f === 'rebuild' ? 'graph.rebuild()' : f);
  }
  const pw = process.env.SALESLORE_DB_PASSWORD;
  if (pw) {
    await client.query(`ALTER ROLE saleslore_app PASSWORD ${client.escapeLiteral(pw)}`);
    console.log('  set the saleslore_app password from SALESLORE_DB_PASSWORD');
  } else {
    console.log('  SALESLORE_DB_PASSWORD not set: set the app password yourself (docs/SETUP_POSTGRES.md step 3).');
  }
  const { rows } = await client.query('SELECT count(*)::int AS n FROM app.v_accounts');
  console.log(`Done. ${rows[0].n} accounts ready in the governed views.`);
} catch (err) {
  console.error(`Setup failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
