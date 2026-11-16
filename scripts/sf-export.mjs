#!/usr/bin/env node
// Exports the SalesLore demo records from your Salesforce org (alias: saleslore) to salesforce/exports/.
// Needs the Salesforce CLI (sf) and a prior: sf org login web --alias saleslore
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../salesforce/exports/', import.meta.url));
fs.mkdirSync(dir, { recursive: true });
const queries = {
  'accounts.json': "SELECT Id, Name, Description FROM Account WHERE Description LIKE 'SalesLore demo:%'",
  'opportunities.json': "SELECT Id, Name, Description FROM Opportunity WHERE Description LIKE 'SalesLore demo:%'",
};
for (const [file, q] of Object.entries(queries)) {
  try {
    const out = execFileSync('sf', ['data', 'query', '--query', q, '--target-org', 'saleslore', '--json'], { encoding: 'utf8' });
    fs.writeFileSync(dir + file, out);
    console.log(`exported ${file}: ${JSON.parse(out).result.totalSize} records`);
  } catch (err) {
    console.error(`Export failed for ${file}. Is the sf CLI installed and are you logged in (sf org login web --alias saleslore)?\n${err.message}`);
    process.exit(1);
  }
}
console.log('Next: npm run sf:sync && npm run db:setup');
