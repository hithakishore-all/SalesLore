-- 04_graph.sql: build the context graph from the raw tables.
-- Every node and edge that comes from a source carries its evidence ID and date.
-- Personal (non-business) evidence never becomes a node or an edge.
-- Re-run any time with: SELECT graph.rebuild();
CREATE OR REPLACE FUNCTION graph.rebuild() RETURNS TABLE (nodes bigint, edges bigint)
LANGUAGE plpgsql AS $$
DECLARE
  stale_days int := app.setting_int('stale_after_days', 90);
BEGIN
  DELETE FROM graph.edges;
  DELETE FROM graph.nodes;

  -- Sellers (global)
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail)
  SELECT 'seller:' || s.seller_id, NULL, 'seller', s.name, s.role FROM raw.sellers s;

  -- Accounts and their owner
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail)
  SELECT 'acct:' || a.account_id, a.account_id, 'account', a.name, a.segment || ' account' FROM raw.accounts a;
  INSERT INTO graph.edges (edge_id, account_id, from_node, to_node, rel)
  SELECT 'owns:' || a.account_id, a.account_id, 'seller:' || a.owner, 'acct:' || a.account_id, 'owns' FROM raw.accounts a;

  -- Opportunities
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail)
  SELECT 'opp:' || o.opportunity_id, o.account_id, 'opportunity', o.stage || ' deal', '$' || to_char(o.amount, 'FM999,999,999')
  FROM raw.opportunities o;
  INSERT INTO graph.edges (edge_id, account_id, from_node, to_node, rel)
  SELECT 'deal:' || o.opportunity_id, o.account_id, 'acct:' || o.account_id, 'opp:' || o.opportunity_id, 'has_deal' FROM raw.opportunities o;

  -- People. Blockers point at the deal; everyone else at the account.
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail, evidence_id, source_date, is_stale)
  SELECT 'person:' || c.contact_id, c.account_id, 'person', c.name, c.title, c.evidence_id, e.source_date,
         (c.last_touch < app.today() - stale_days) OR c.email_status = 'bounced'
  FROM raw.contacts c LEFT JOIN raw.evidence e ON e.evidence_id = c.evidence_id
  WHERE COALESCE(e.is_personal, false) = false;
  INSERT INTO graph.edges (edge_id, account_id, from_node, to_node, rel, evidence_id, source_date)
  SELECT 'rel:' || c.contact_id, c.account_id, 'person:' || c.contact_id,
         CASE WHEN c.relationship = 'blocks' THEN 'opp:O-' || c.account_id ELSE 'acct:' || c.account_id END,
         c.relationship, c.evidence_id, e.source_date
  FROM raw.contacts c LEFT JOIN raw.evidence e ON e.evidence_id = c.evidence_id
  WHERE COALESCE(e.is_personal, false) = false;

  -- Commitments, risks and facts (personal facts excluded)
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail, evidence_id, source_date)
  SELECT 'fact:' || f.fact_id, f.account_id, f.fact_type, initcap(f.fact_type), f.text, f.evidence_id, e.source_date
  FROM raw.facts f LEFT JOIN raw.evidence e ON e.evidence_id = f.evidence_id
  WHERE COALESCE(e.is_personal, false) = false;
  INSERT INTO graph.edges (edge_id, account_id, from_node, to_node, rel, evidence_id, source_date)
  SELECT 'f:' || f.fact_id, f.account_id,
         CASE f.fact_type WHEN 'commitment' THEN 'seller:' || a.owner WHEN 'risk' THEN 'fact:' || f.fact_id ELSE 'fact:' || f.fact_id END,
         CASE f.fact_type WHEN 'commitment' THEN 'fact:' || f.fact_id WHEN 'risk' THEN 'opp:O-' || f.account_id ELSE 'acct:' || f.account_id END,
         CASE f.fact_type WHEN 'commitment' THEN 'promised' WHEN 'risk' THEN 'blocks' ELSE 'describes' END,
         f.evidence_id, e.source_date
  FROM raw.facts f JOIN raw.accounts a ON a.account_id = f.account_id
  LEFT JOIN raw.evidence e ON e.evidence_id = f.evidence_id
  WHERE COALESCE(e.is_personal, false) = false;

  -- Approved pattern steps, linked to the deals whose tasks use them
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail, evidence_id)
  SELECT 'ps:' || p.step_id, NULL, 'pattern_step', p.step_id, p.text, p.evidence_id FROM raw.pattern_steps p WHERE p.status = 'approved';
  INSERT INTO graph.edges (edge_id, account_id, from_node, to_node, rel, evidence_id)
  SELECT DISTINCT 'applies:' || t.pattern_step_id || ':' || t.account_id, t.account_id, 'ps:' || t.pattern_step_id, 'opp:O-' || t.account_id, 'applies_to', p.evidence_id
  FROM raw.tasks t JOIN raw.pattern_steps p ON p.step_id = t.pattern_step_id
  JOIN raw.accounts a ON a.account_id = t.account_id
  WHERE p.status = 'approved' AND a.segment = ANY (p.segments);

  -- Unknowns become explicit nodes, never guesses
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail)
  SELECT 'unknown:dm:' || a.account_id, a.account_id, 'unknown', 'Decision maker', 'unknown'
  FROM raw.accounts a WHERE NOT EXISTS (SELECT 1 FROM raw.contacts c WHERE c.account_id = a.account_id AND c.relationship = 'decides_for');
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail)
  SELECT 'unknown:budget:' || o.account_id, o.account_id, 'unknown', 'Budget', 'unknown' FROM raw.opportunities o WHERE o.budget_status = 'unknown'
    AND NOT EXISTS (SELECT 1 FROM raw.contacts c WHERE c.account_id = o.account_id AND c.relationship = 'champion_of');
  INSERT INTO graph.nodes (node_id, account_id, node_type, label, detail)
  SELECT 'unknown:timeline:' || o.account_id, o.account_id, 'unknown', 'Timeline', 'unknown' FROM raw.opportunities o WHERE o.close_date IS NULL;
  INSERT INTO graph.edges (edge_id, account_id, from_node, to_node, rel)
  SELECT 'u:' || n.node_id, n.account_id, n.node_id, 'opp:O-' || n.account_id, 'unknown' FROM graph.nodes n WHERE n.node_type = 'unknown';

  RETURN QUERY SELECT (SELECT count(*) FROM graph.nodes), (SELECT count(*) FROM graph.edges);
END;
$$;

SELECT * FROM graph.rebuild();
