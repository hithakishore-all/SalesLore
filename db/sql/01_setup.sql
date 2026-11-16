-- 01_setup.sql: schemas and the config table.
-- raw   = data as it arrives from Salesforce, call and email systems (or the generator)
-- graph = the context graph built from raw (nodes and edges)
-- app   = the governed views agents read, plus runs, approvals and the audit log
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS graph;
CREATE SCHEMA IF NOT EXISTS app;

-- Settings the app and views read. demo_today pins "today" so the demo never drifts.
CREATE TABLE IF NOT EXISTS app.config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Today as SalesLore sees it: the pinned demo date if set, otherwise the real date.
CREATE OR REPLACE FUNCTION app.today() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT value::date FROM app.config WHERE key = 'demo_today'), current_date)
$$;

CREATE OR REPLACE FUNCTION app.setting_int(k text, fallback int) RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT value::int FROM app.config WHERE key = k), fallback)
$$;
