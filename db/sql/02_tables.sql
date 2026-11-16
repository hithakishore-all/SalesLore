-- 02_tables.sql: raw tables, graph tables and app runtime tables.
CREATE TABLE IF NOT EXISTS raw.stage_order (
  stage       text PRIMARY KEY,
  stage_order int  NOT NULL
);

CREATE TABLE IF NOT EXISTS raw.sellers (
  seller_id      text PRIMARY KEY,
  name           text NOT NULL,
  role           text NOT NULL,
  email          text NOT NULL,
  consent_status text NOT NULL CHECK (consent_status IN ('granted', 'revoked', 'pending', 'not_required')),
  consent_date   date,
  last_day       date
);

CREATE TABLE IF NOT EXISTS raw.transfers (
  transfer_id text PRIMARY KEY,
  from_seller text NOT NULL REFERENCES raw.sellers,
  to_seller   text NOT NULL REFERENCES raw.sellers,
  owner       text NOT NULL REFERENCES raw.sellers,
  started_on  date NOT NULL,
  status      text NOT NULL
);

CREATE TABLE IF NOT EXISTS raw.accounts (
  account_id           text PRIMARY KEY,
  sf_account_id        text,
  name                 text NOT NULL,
  segment              text NOT NULL CHECK (segment IN ('Enterprise', 'Mid-market', 'SMB')),
  industry             text,
  state_code           text,
  owner                text NOT NULL REFERENCES raw.sellers,
  do_not_contact_until date,
  proves               text
);

CREATE TABLE IF NOT EXISTS raw.opportunities (
  opportunity_id    text PRIMARY KEY,
  sf_opportunity_id text,
  account_id        text NOT NULL REFERENCES raw.accounts,
  name              text NOT NULL,
  stage             text NOT NULL REFERENCES raw.stage_order,
  amount            numeric(14, 2) NOT NULL,
  close_date        date,
  budget_status     text NOT NULL CHECK (budget_status IN ('confirmed', 'requested', 'unknown'))
);

CREATE TABLE IF NOT EXISTS raw.evidence (
  evidence_id   text PRIMARY KEY,
  account_id    text REFERENCES raw.accounts,
  source_system text NOT NULL CHECK (source_system IN ('call', 'email', 'salesforce', 'pattern')),
  source_date   date NOT NULL,
  speaker       text,
  text          text NOT NULL,
  is_personal   boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS raw.contacts (
  contact_id   text PRIMARY KEY,
  account_id   text NOT NULL REFERENCES raw.accounts,
  name         text NOT NULL,
  title        text,
  email        text,
  relationship text NOT NULL CHECK (relationship IN ('decides_for', 'champion_of', 'influences', 'blocks')),
  note         text,
  evidence_id  text REFERENCES raw.evidence,
  last_touch   date,
  email_status text NOT NULL DEFAULT 'ok' CHECK (email_status IN ('ok', 'bounced'))
);

CREATE TABLE IF NOT EXISTS raw.facts (
  fact_id     text PRIMARY KEY,
  account_id  text NOT NULL REFERENCES raw.accounts,
  fact_type   text NOT NULL CHECK (fact_type IN ('commitment', 'risk', 'fact')),
  fact_key    text,
  text        text NOT NULL,
  evidence_id text REFERENCES raw.evidence,
  due_date    date
);

-- Draft claims from the seller's own notes. evidence_id may be NULL: the validator rejects those.
CREATE TABLE IF NOT EXISTS raw.seller_notes (
  note_id     text PRIMARY KEY,
  account_id  text NOT NULL REFERENCES raw.accounts,
  text        text NOT NULL,
  evidence_id text REFERENCES raw.evidence
);

CREATE TABLE IF NOT EXISTS raw.pattern_steps (
  step_id         text PRIMARY KEY,
  seller_id       text NOT NULL REFERENCES raw.sellers,
  text            text NOT NULL,
  segments        text[] NOT NULL,
  min_stage_order int NOT NULL DEFAULT 0,
  evidence_id     text REFERENCES raw.evidence,
  status          text NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected')),
  note            text
);

CREATE TABLE IF NOT EXISTS raw.tasks (
  task_id         text PRIMARY KEY,
  account_id      text NOT NULL REFERENCES raw.accounts,
  text            text NOT NULL,
  evidence_id     text REFERENCES raw.evidence,
  pattern_step_id text REFERENCES raw.pattern_steps,
  is_outreach     boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 1
);

-- The context graph.
CREATE TABLE IF NOT EXISTS graph.nodes (
  node_id     text PRIMARY KEY,
  account_id  text,
  node_type   text NOT NULL CHECK (node_type IN ('account', 'seller', 'opportunity', 'person', 'commitment', 'risk', 'fact', 'pattern_step', 'evidence', 'unknown')),
  label       text NOT NULL,
  detail      text,
  evidence_id text,
  source_date date,
  is_stale    boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS graph.edges (
  edge_id     text PRIMARY KEY,
  account_id  text,
  from_node   text NOT NULL REFERENCES graph.nodes ON DELETE CASCADE,
  to_node     text NOT NULL REFERENCES graph.nodes ON DELETE CASCADE,
  rel         text NOT NULL,
  evidence_id text,
  source_date date
);
CREATE INDEX IF NOT EXISTS edges_account_idx ON graph.edges (account_id);
CREATE INDEX IF NOT EXISTS nodes_account_idx ON graph.nodes (account_id);

-- Runtime: agent runs, approvals and the audit log.
CREATE TABLE IF NOT EXISTS app.runs (
  run_id     text PRIMARY KEY,
  account_id text NOT NULL REFERENCES raw.accounts,
  status     text NOT NULL CHECK (status IN ('validated', 'escalated', 'failed')),
  attempts   int  NOT NULL,
  brief      jsonb NOT NULL,
  log        jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_account_idx ON app.runs (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.approvals (
  run_id      text PRIMARY KEY REFERENCES app.runs,
  account_id  text NOT NULL REFERENCES raw.accounts,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.audit_log (
  event_id        bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  actor           text NOT NULL,
  action          text NOT NULL,
  account_id      text,
  detail          text,
  idempotency_key text UNIQUE
);
