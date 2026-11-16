# Troubleshooting

## Startup

| Symptom | Cause | Fix |
| --- | --- | --- |
| `SalesLore cannot start yet: DATABASE_URL is not set` | Live mode without a database | `npm run offline`, or follow [SETUP_POSTGRES.md](SETUP_POSTGRES.md) |
| `Cannot reach Postgres: connect ECONNREFUSED` | Postgres is not running | Open Postgres.app (or `brew services start postgresql@17`) |
| `password authentication failed for user "saleslore_app"` | Password in `DATABASE_URL` differs from the role's | Make `SALESLORE_DB_PASSWORD` and the password in `DATABASE_URL` match, then `npm run db:setup` |
| `Port 3000 is already in use` | Another app uses the port | Set `PORT=3001` in `.env` |
| `Offline snapshot not found` | `fixtures/` missing | `npm run build:fixtures` |
| `npm ci` warns "Unsupported engine", or `npm test` finds no tests | Node.js older than 22 | Install Node.js 22 or newer (`node -v`) |
| `MODEL="..." is not supported` | Typo in `.env` | Use `scripted` or `anthropic` |

## Postgres

| Symptom | Cause | Fix |
| --- | --- | --- |
| `createdb: command not found` | Postgres tools not on PATH | Step 1.3 in [SETUP_POSTGRES.md](SETUP_POSTGRES.md), then open a new Terminal |
| `database "saleslore" does not exist` | Database not created | `createdb saleslore` |
| `DATABASE_ADMIN_URL is not set` | `.env` missing the admin URL | Add `DATABASE_ADMIN_URL=postgresql://localhost:5432/saleslore` |
| `permission denied for schema raw` | Expected: the app user cannot read raw tables | Query the `app.v_*` views instead |
| Readiness looks wrong after editing data | Graph not rebuilt | `npm run db:setup` (it runs `graph.rebuild()`) |

## Slack

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Slack bot off: SLACK_BOT_TOKEN ... not set` | Tokens missing | [SETUP_SLACK.md](SETUP_SLACK.md) step 4 |
| `SLACK_BOT_TOKEN should start with xoxb-` | Pasted the wrong token | Use the Bot User OAuth Token from OAuth & Permissions |
| `Slack failed to start: invalid_auth` | Token revoked or from another app | Reinstall the app and copy fresh tokens |
| `/saleslore failed with the error "dispatch_failed"` | App not running, or Socket Mode off | Start SalesLore; check Socket Mode is on in the app settings |
| Command not found in Slack | App not installed after creating it | Install App > Install to Workspace |
| "Your Slack user is not mapped" on `run` | No entry in `SALESLORE_SLACK_USER_MAP` | Add `YOURID=dana` and restart |
| Approve says only the owner can approve | Your Slack user maps to `leo` or nothing | Map your member ID to `dana` |

## Salesforce

| Symptom | Cause | Fix |
| --- | --- | --- |
| `FIELD_INTEGRITY_EXCEPTION ... BillingStateCode` | State and country picklists off | Turn them on (SETUP_SALESFORCE.md step 1) |
| `No authorization information found for saleslore` | Not logged in with that alias | `sf org login web --alias saleslore` |
| `Export failed` | sf CLI missing | Install the Salesforce CLI |
| IDs still start with `001DEMO` | Sync not applied | `npm run sf:sync && npm run db:setup` |

## Web console

| Symptom | Cause | Fix |
| --- | --- | --- |
| "SalesLore cannot reach its API" | Server stopped | Start it again; check the terminal |
| Approve returns "Only the transfer owner..." | Signed in as Leo or Maya | Switch **Signed in as** to Dana Whitfield |
| Runs disappear after restart | Offline mode keeps runs in memory | Use live mode to keep them |
| Fonts look plain | No internet for Google Fonts | Cosmetic only; system fonts are used |
