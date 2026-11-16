-- 05_views.sql: the governed views. Agents and the app read ONLY these.
-- v_saleslore_context is the one view the agents reason over. Every row has a
-- source, a date and an evidence ID, or is an explicit unknown, flag or draft note
-- (draft notes may lack evidence on purpose: the Validate agent rejects them).
CREATE OR REPLACE VIEW app.v_accounts AS
SELECT a.account_id, a.sf_account_id, a.name, a.segment, a.industry, o.stage, so.stage_order, o.amount, o.close_date,
       o.budget_status, a.do_not_contact_until,
       (a.do_not_contact_until IS NOT NULL AND a.do_not_contact_until > app.today()) AS do_not_contact,
       a.proves, s.name AS owner_name, t.transfer_id, fs.name AS from_seller, ts.name AS to_seller, os.name AS transfer_owner
FROM raw.accounts a
JOIN raw.opportunities o ON o.account_id = a.account_id
JOIN raw.stage_order so ON so.stage = o.stage
JOIN raw.sellers s ON s.seller_id = a.owner
LEFT JOIN raw.transfers t ON t.from_seller = a.owner
LEFT JOIN raw.sellers fs ON fs.seller_id = t.from_seller
LEFT JOIN raw.sellers ts ON ts.seller_id = t.to_seller
LEFT JOIN raw.sellers os ON os.seller_id = t.owner;

CREATE OR REPLACE VIEW app.v_evidence AS
SELECT evidence_id, account_id, source_system, source_date, speaker, text
FROM raw.evidence WHERE is_personal = false;

CREATE OR REPLACE VIEW app.v_pattern_steps AS
SELECT p.step_id, s.name AS seller_name, p.text, p.segments, p.min_stage_order, p.evidence_id, p.status, p.note,
       s.consent_status
FROM raw.pattern_steps p JOIN raw.sellers s ON s.seller_id = p.seller_id;

CREATE OR REPLACE VIEW app.v_saleslore_context AS
WITH cfg AS (SELECT app.today() AS today, app.setting_int('stale_after_days', 90) AS stale_days)
-- People
SELECT c.account_id, 'person'::text AS item_type, c.contact_id AS item_key, c.name AS label,
       c.title || '. ' || c.note AS detail, c.relationship, NULL::text AS fact_key,
       c.evidence_id, e.source_system, e.source_date, e.speaker, e.text AS quote,
       ((c.last_touch < cfg.today - cfg.stale_days) OR c.email_status = 'bounced') AS is_stale,
       NULL::text AS pattern_step_id, NULL::text AS pattern_status, NULL::boolean AS pattern_applies,
       NULL::boolean AS is_outreach, 0 AS sort_order, NULL::date AS due_date
FROM raw.contacts c CROSS JOIN cfg JOIN raw.evidence e ON e.evidence_id = c.evidence_id
WHERE e.is_personal = false
UNION ALL
-- Commitments, risks and facts
SELECT f.account_id, f.fact_type, f.fact_id, f.text, NULL, NULL, f.fact_key,
       f.evidence_id, e.source_system, e.source_date, e.speaker, e.text,
       (e.source_date < cfg.today - cfg.stale_days), NULL, NULL, NULL, NULL, 0, f.due_date
FROM raw.facts f CROSS JOIN cfg JOIN raw.evidence e ON e.evidence_id = f.evidence_id
WHERE e.is_personal = false
UNION ALL
-- Draft claims from the seller's notes (evidence may be missing)
SELECT n.account_id, 'note', n.note_id, n.text, NULL, NULL, NULL,
       n.evidence_id, e.source_system, e.source_date, e.speaker, e.text,
       false, NULL, NULL, NULL, NULL, 0, NULL
FROM raw.seller_notes n LEFT JOIN raw.evidence e ON e.evidence_id = n.evidence_id
WHERE COALESCE(e.is_personal, false) = false
UNION ALL
-- The seller's open tasks, with the pattern step behind each
SELECT t.account_id, 'task', t.task_id, t.text, NULL, NULL, NULL,
       t.evidence_id, e.source_system, e.source_date, e.speaker, e.text,
       false, t.pattern_step_id, p.status,
       CASE WHEN p.step_id IS NULL THEN NULL ELSE (a.segment = ANY (p.segments) AND so.stage_order >= p.min_stage_order) END,
       t.is_outreach, t.sort_order, NULL
FROM raw.tasks t
JOIN raw.accounts a ON a.account_id = t.account_id
JOIN raw.opportunities o ON o.account_id = t.account_id
JOIN raw.stage_order so ON so.stage = o.stage
LEFT JOIN raw.pattern_steps p ON p.step_id = t.pattern_step_id
LEFT JOIN raw.evidence e ON e.evidence_id = t.evidence_id
UNION ALL
-- Explicit unknowns
SELECT n.account_id, 'unknown', n.node_id, n.label, 'No evidence found', NULL, NULL,
       NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, 0, NULL
FROM graph.nodes n WHERE n.node_type = 'unknown'
UNION ALL
-- Do-not-contact flags
SELECT a.account_id, 'stop', 'dnc:' || a.account_id, 'Do not contact until ' || to_char(a.do_not_contact_until, 'Mon FMDD, YYYY'),
       NULL, NULL, NULL, e.evidence_id, e.source_system, e.source_date, e.speaker, e.text,
       false, NULL, NULL, NULL, NULL, 0, a.do_not_contact_until
FROM raw.accounts a CROSS JOIN cfg
LEFT JOIN LATERAL (SELECT * FROM raw.evidence x WHERE x.account_id = a.account_id AND x.source_system = 'salesforce' AND x.text LIKE 'true, until%' LIMIT 1) e ON true
WHERE a.do_not_contact_until > cfg.today
UNION ALL
-- How many personal facts the privacy filter removed (count only, never the content)
SELECT e.account_id, 'privacy_excluded', 'privacy:' || e.account_id, count(*)::text, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, 0, NULL
FROM raw.evidence e WHERE e.is_personal AND e.account_id IS NOT NULL
GROUP BY e.account_id;

CREATE OR REPLACE VIEW app.v_graph_nodes AS SELECT * FROM graph.nodes;
CREATE OR REPLACE VIEW app.v_graph_edges AS SELECT * FROM graph.edges;

CREATE OR REPLACE VIEW app.v_sellers AS
SELECT seller_id, name, role, consent_status, consent_date, last_day FROM raw.sellers;

CREATE OR REPLACE VIEW app.v_transfers AS
SELECT t.transfer_id, t.status, t.started_on,
       t.from_seller AS from_id, fs.name AS from_name,
       t.to_seller AS to_id, ts.name AS to_name,
       t.owner AS owner_id, os.name AS owner_name
FROM raw.transfers t
JOIN raw.sellers fs ON fs.seller_id = t.from_seller
JOIN raw.sellers ts ON ts.seller_id = t.to_seller
JOIN raw.sellers os ON os.seller_id = t.owner;
