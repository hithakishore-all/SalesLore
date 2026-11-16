# Set up Salesforce (optional)

Salesforce is the system of record in the full design. The app runs without it: `06_sync_sample.sql` gives every account a stand-in Salesforce ID. Follow this guide to seed a real, free Developer Edition org and sync its record IDs into Postgres. Allow about 15 minutes.

## 1. Get a Developer Edition org

Sign up at [developer.salesforce.com/signup](https://developer.salesforce.com/signup). Use an email you can receive; the username must look like an email but does not need to exist (for example `you.saleslore@example.com`).

**Turn on state and country picklists** (the seed uses `BillingStateCode` and `BillingCountryCode`): Setup > search **State and Country/Territory Picklists** > **Enable Picklists for Address Fields**. Newer orgs have this on already.

## 2. Install the Salesforce CLI and log in

Install from [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli) (on a Mac: `brew install sf`). Then:
```bash
sf org login web --alias saleslore
```
A browser window opens. You sign in yourself; SalesLore never sees your password.

## 3. Seed the org

```bash
npm run sf:seed
```
This runs `salesforce/seed.apex` with anonymous Apex: 10 accounts, 11 contacts and 10 opportunities, all fictional, all tagged `SalesLore demo:` in Description. It deletes its own records first, so it is safe to re-run. Anonymous Apex also avoids field-level security errors you can hit with the import wizard.

## 4. Export and sync the IDs into Postgres

```bash
npm run sf:export     # writes salesforce/exports/*.json (git-ignored)
npm run sf:sync       # writes db/sql/06_sync.sql (git-ignored)
npm run db:setup      # applies it; uses 06_sync.sql instead of the sample
```
Check:
```bash
psql saleslore -c "select account_id, sf_account_id from raw.accounts;"
```
Real IDs start with `001`. Stand-in IDs start with `001DEMO`.

## Regenerating the seed

The Apex file is generated. To change the data, edit `data/generate_data.py`, then:
```bash
npm run generate:data && npm run build:fixtures && npm run sf:seed
```
