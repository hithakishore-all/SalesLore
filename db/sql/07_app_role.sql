-- 07_app_role.sql: a least-privilege login for the Node app.
-- It can read the governed views and write only runs, approvals and the audit log.
-- It cannot read the raw schema directly or change any source data.
-- Set its password yourself afterwards (never commit it):
--   psql -d saleslore -c "\password saleslore_app"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saleslore_app') THEN
    CREATE ROLE saleslore_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

REVOKE ALL ON SCHEMA raw, graph FROM saleslore_app;
GRANT USAGE ON SCHEMA app TO saleslore_app;
GRANT SELECT ON app.v_accounts, app.v_evidence, app.v_pattern_steps, app.v_saleslore_context,
               app.v_graph_nodes, app.v_graph_edges, app.v_sellers, app.v_transfers, app.config TO saleslore_app;
GRANT SELECT, INSERT ON app.runs, app.approvals, app.audit_log TO saleslore_app;
GRANT USAGE ON SEQUENCE app.audit_log_event_id_seq TO saleslore_app;
GRANT EXECUTE ON FUNCTION app.today(), app.setting_int(text, int) TO saleslore_app;
