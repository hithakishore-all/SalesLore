# Set up Postgres (free)

Postgres holds the raw data, the context graph, the governed views, runs, approvals and the audit log. It is free and runs on your laptop. Allow about 10 minutes.

> **Mac shortcut:** if Postgres is already installed (official installer, Postgres.app or Homebrew), double-click `scripts/setup-mac.command` in Finder. It finds Postgres, creates the database, writes `.env`, loads all data, checks the counts and starts SalesLore. It asks only for your Postgres password and never saves it. If macOS warns about the file, right-click it and choose **Open**.

## 1. Install Postgres

**Mac (easiest): Postgres.app**

1. Download it from [postgresapp.com](https://postgresapp.com) and drag it to Applications.
2. Open it and click **Initialize**. You now have a server on `localhost:5432` with a superuser named after your Mac username and no password.
3. Add its command-line tools to your PATH (one time), then open a new Terminal window:
   ```bash
   sudo mkdir -p /etc/paths.d && echo /Applications/Postgres.app/Contents/Versions/latest/bin | sudo tee /etc/paths.d/postgresapp
   ```

**Mac with Homebrew:** `brew install postgresql@17` (or the current version Homebrew lists), then `brew services start postgresql@17`.

**Windows or Linux:** install from [postgresql.org/download](https://www.postgresql.org/download/) and note the admin user and password you choose.

Check it works:
```bash
psql -c "select version();"
```

## 2. Create the database and your .env

```bash
createdb saleslore
cp .env.example .env
```

Open `.env` in a text editor and set the admin connection. With Postgres.app, no password is needed:
```
DATABASE_ADMIN_URL=postgresql://localhost:5432/saleslore
```
On other installs use `postgresql://ADMIN_USER:ADMIN_PASSWORD@localhost:5432/saleslore`.

## 3. Create the app user's password

The app logs in as a least-privilege user called `saleslore_app`. Make a random password and copy it to your clipboard (Mac):
```bash
openssl rand -base64 24 | tr -d '/+=' | pbcopy
```
In `.env`, paste it (Cmd+V) in two places:
```
SALESLORE_DB_PASSWORD=<paste>
DATABASE_URL=postgresql://saleslore_app:<paste>@localhost:5432/saleslore
```
Do not share or commit this file. It is already in `.gitignore`.

## 4. Build everything

```bash
npm ci
npm run db:setup
```
You should see each SQL file run, then `Done. 10 accounts ready in the governed views.` It is safe to run again: it rebuilds the seed data and graph.

What it runs, in order:

| File | Creates |
| --- | --- |
| `01_setup.sql` | Schemas `raw`, `graph`, `app`; `app.config`; `app.today()` |
| `02_tables.sql` | Raw tables, graph tables, runs, approvals, audit log |
| `03_seed.sql` | The fictional dataset (clears raw tables first) |
| `04_graph.sql` | `graph.rebuild()` and the context graph |
| `05_views.sql` | The governed views the app reads |
| `06_sync.sql` or `06_sync_sample.sql` | Salesforce IDs (real or stand-in) |
| `07_app_role.sql` | The `saleslore_app` login and its grants |

## 5. Start in live mode

```bash
npm start
```
Open http://127.0.0.1:3000. The sidebar shows **Data: live Postgres**.

## Check it from psql (optional)

```bash
psql saleslore -c "select account_id, item_type, label, evidence_id from app.v_saleslore_context where account_id = 'halcyon';"
psql saleslore -c "select from_node, rel, to_node, evidence_id from graph.edges where account_id = 'halcyon';"
```

## Reset

Runs, approvals and audit events stay between restarts. To start clean:
```bash
psql saleslore -c "truncate app.approvals, app.runs, app.audit_log;"
```
