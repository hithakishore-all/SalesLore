// The SQL files, in order. 06 uses your real Salesforce sync if you built one, else the sample.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const SQL_DIR = fileURLToPath(new URL('../db/sql/', import.meta.url));
export function sqlFiles({ includeRole = true } = {}) {
  const sync = fs.existsSync(SQL_DIR + '06_sync.sql') ? '06_sync.sql' : '06_sync_sample.sql';
  const files = ['01_setup.sql', '02_tables.sql', '03_seed.sql', '04_graph.sql', '05_views.sql', sync, 'rebuild'];
  if (includeRole) files.push('07_app_role.sql');
  return files;
}
export function readSql(name) {
  return name === 'rebuild' ? 'SELECT * FROM graph.rebuild();' : fs.readFileSync(SQL_DIR + name, 'utf8');
}
