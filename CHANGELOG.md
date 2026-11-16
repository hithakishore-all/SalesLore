# Changelog

## 1.0.0 (2026-11-16)

First release.

- Context graph in Postgres (`graph.nodes`, `graph.edges`) and the governed view `app.v_saleslore_context`
- Agent flow: Discover, Research, Compose, Validate (bounded retries), owner-only idempotent Approve
- Rules: consent before capture, stop on do-not-contact, stale and unknown labels, conflict detection, privacy filter, pattern-step approval and scope
- Web console with Overview, Seller DNA, Account Memory, Knowledge Graph, Transfers, Companion (Slack view) and Evidence Ledger
- Slack bot (Bolt, Socket Mode) with `/saleslore` commands, mentions and an Approve button
- Offline mode from a snapshot built from the real SQL; live mode on Postgres
- Optional Salesforce Developer Edition seed and ID sync
- End-to-end smoke test and unit tests; CI
