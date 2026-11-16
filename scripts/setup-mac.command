#!/bin/bash
# SalesLore one-click setup for macOS. Double-click this file in Finder.
# It finds your Postgres, creates the "saleslore" database, writes .env, loads all
# the fictional demo data, checks it, and starts SalesLore in live mode.
# The only thing it asks you for is your Postgres password. It never stores that password.
cd "$(dirname "$0")/.." || exit 1
say() { printf "\n\033[1;32m==> %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31mStopped: %s\033[0m\n" "$1"; printf "Press Enter to close this window."; read -r _; exit 1; }

say "SalesLore setup ($(pwd))"

# 1. Node.js 22+
command -v node >/dev/null || fail "Node.js is not installed. Install it from https://nodejs.org (or: brew install node), then double-click this file again."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $(node -v) is too old. Install Node.js 22 or newer from https://nodejs.org, then try again."
echo "Node.js $(node -v)"

# 2. Find Postgres tools (official installer, Postgres.app or Homebrew)
PGBIN=""
for d in /Library/PostgreSQL/*/bin /Applications/Postgres.app/Contents/Versions/latest/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin; do
  [ -x "$d/psql" ] && PGBIN="$d"
done
[ -z "$PGBIN" ] && command -v psql >/dev/null && PGBIN="$(dirname "$(command -v psql)")"
[ -n "$PGBIN" ] || fail "Could not find Postgres (psql). Install Postgres, then try again."
export PATH="$PGBIN:$PATH"
echo "Postgres tools: $PGBIN ($(psql --version))"

# Make psql/createdb available in future Terminal windows too (only if missing)
if ! grep -qs "$PGBIN" "$HOME/.zshrc"; then
  echo "export PATH=\"$PGBIN:\$PATH\"" >> "$HOME/.zshrc"
  echo "Added Postgres to your PATH in ~/.zshrc"
fi

# 3. Admin login
if [[ "$PGBIN" == *Postgres.app* ]]; then
  PGUSER_ADMIN="$USER"; PGPASSWORD=""
else
  PGUSER_ADMIN="postgres"
  printf "\nType your Postgres password for user \"postgres\" (the one you chose when installing PostgreSQL).\nTyping is hidden. Press Enter when done: "
  read -rs PGPASSWORD; echo
fi
export PGPASSWORD PGHOST=localhost PGPORT=5432 PGUSER="$PGUSER_ADMIN"
psql -d postgres -tAc "select 1" >/dev/null 2>/tmp/saleslore-psql.err || {
  cat /tmp/saleslore-psql.err
  fail "Could not log in to Postgres. If it says 'password authentication failed', the password was wrong. If it says 'connection refused', start Postgres (open pgAdmin, or restart your Mac) and try again."
}
echo "Logged in to Postgres as $PGUSER_ADMIN"

# 4. Database
if [ "$(psql -d postgres -tAc "select 1 from pg_database where datname = 'saleslore'")" = "1" ]; then
  echo "Database saleslore already exists"
else
  createdb saleslore || fail "Could not create the saleslore database."
  echo "Created database saleslore"
fi

# 5. .env with a fresh app password (admin password is NOT saved)
APP_PW=$(openssl rand -hex 24)
if [ -f .env ]; then cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"; echo "Backed up your existing .env"; fi
cp .env.example .env
node -e '
  const fs = require("fs"); let s = fs.readFileSync(".env", "utf8");
  const pw = process.argv[1], admin = process.argv[2];
  s = s.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgresql://saleslore_app:${pw}@localhost:5432/saleslore`)
       .replace(/^DATABASE_ADMIN_URL=.*$/m, `DATABASE_ADMIN_URL=postgresql://${encodeURIComponent(admin)}@localhost:5432/saleslore`)
       .replace(/^SALESLORE_DB_PASSWORD=.*$/m, `SALESLORE_DB_PASSWORD=${pw}`);
  fs.writeFileSync(".env", s, { mode: 0o600 });
' "$APP_PW" "$PGUSER_ADMIN" || fail "Could not write .env"
echo "Wrote .env (app login only; your Postgres password is not saved)"

# 6. Libraries
if [ ! -d node_modules/@slack/bolt ]; then say "Installing libraries (npm ci)"; npm ci || fail "npm ci failed. Check your internet connection and try again."; fi

# 7. Load all data (admin URL with password passed for this run only)
say "Loading SalesLore data into Postgres"
ADMIN_URL=$(node -e 'const [u,p]=process.argv.slice(1); console.log(`postgresql://${encodeURIComponent(u)}${p?":"+encodeURIComponent(p):""}@localhost:5432/saleslore`)' "$PGUSER_ADMIN" "$PGPASSWORD")
DATABASE_ADMIN_URL="$ADMIN_URL" npm run -s db:setup || fail "Loading data failed (see the message above)."

# 8. Check
say "Checking the data"
psql -d saleslore -c "select (select count(*) from raw.accounts) as accounts, (select count(*) from raw.contacts) as contacts, (select count(*) from raw.evidence) as evidence, (select count(*) from graph.nodes) as graph_nodes, (select count(*) from graph.edges) as graph_edges;"
unset PGPASSWORD ADMIN_URL

# 9. Start
say "Starting SalesLore (live Postgres). Leave this window open; press Ctrl+C to stop."
( sleep 3; open "http://127.0.0.1:3000" ) &
npm start
