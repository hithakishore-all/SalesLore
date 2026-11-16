#!/usr/bin/env python3
"""Generate every SalesLore seed file from one place.

All companies, people, quotes and numbers are fictional. Emails and sites use
the reserved .example domain.

Outputs (paths relative to the repo root):
  data/seed/seed.json            the canonical dataset (read by tests and docs)
  db/sql/03_seed.sql             Postgres inserts for the raw schema
  db/sql/06_sync_sample.sql      sample Salesforce ID sync with stand-in IDs
  salesforce/seed.apex           anonymous Apex that seeds a Developer Edition org

Run:  python3 data/generate_data.py
Re-running produces byte-identical files.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CONFIG = {
    "demo_today": "2026-11-16",
    "stale_after_days": 90,
    "max_validate_retries": 2,
}

SELLERS = [
    {"seller_id": "maya", "name": "Maya Okafor", "role": "Enterprise AE", "email": "maya.okafor@kestrel.example",
     "consent_status": "granted", "consent_date": "2026-10-28", "last_day": "2026-11-27"},
    {"seller_id": "leo", "name": "Leo Brandt", "role": "Successor AE", "email": "leo.brandt@kestrel.example",
     "consent_status": "not_required", "consent_date": None, "last_day": None},
    {"seller_id": "dana", "name": "Dana Whitfield", "role": "Sales manager", "email": "dana.whitfield@kestrel.example",
     "consent_status": "not_required", "consent_date": None, "last_day": None},
]

TRANSFER = {"transfer_id": "TR-001", "from_seller": "maya", "to_seller": "leo", "owner": "dana",
            "started_on": "2026-11-10", "status": "in_progress"}

# account_id, name, segment, industry, state code, stage, amount, close date, budget status, do-not-contact-until, proves
ACCOUNTS = [
    ("halcyon", "Halcyon Freight", "Enterprise", "Logistics", "IL", "Negotiation", 480000, "2026-12-19", "requested", None,
     "Hero run: real buyer, open promise, pattern step applied"),
    ("brightwater", "Brightwater Health", "Enterprise", "Healthcare", "OR", "Proposal", 210000, "2027-01-29", "requested", None,
     "Validator catches an unsupported claim"),
    ("orchard", "Orchard Lane Retail", "Mid-market", "Retail", "GA", "Evaluation", 96000, "2027-02-26", "unknown", None,
     "Stale data flagged with a re-verify step"),
    ("pinecrest", "Pinecrest Bank", "Enterprise", "Banking", "NC", "Renewal", 350000, "2027-03-31", "confirmed", "2027-01-15",
     "Stops and escalates on a do-not-contact signal"),
    ("lumen", "Lumen Robotics", "Mid-market", "Manufacturing", "MI", "Renewal", 120000, "2026-12-31", "confirmed", None,
     "Clean run, no warnings"),
    ("tidewater", "Tidewater Logistics", "Mid-market", "Logistics", "SC", "Discovery", 75000, None, "unknown", None,
     "Missing data shown as unknown"),
    ("marlow", "Marlow Insurance", "Enterprise", "Insurance", "CT", "Proposal", 260000, "2027-04-30", "requested", None,
     "Conflicting evidence shown side by side"),
    ("sable", "Sable Energy", "Enterprise", "Energy", "TX", "Negotiation", 310000, "2027-01-15", "confirmed", None,
     "Privacy filter drops a personal fact"),
    ("juniper", "Juniper Schools", "SMB", "Education", "CO", "Proposal", 4800, "2026-12-12", "confirmed", None,
     "Pattern step shown only where it applies"),
    ("corvid", "Corvid Analytics", "Mid-market", "Software", "WA", "Negotiation", 88000, "2026-12-22", "requested", None,
     "Rejected pattern steps are never coached"),
]

# evidence_id, account_id, source_system, source_date, speaker, text, is_personal
EVIDENCE = [
    ("EV-CALL-0412", "halcyon", "call", "2026-09-18", "Priya Nair, CFO", "Tom runs the evaluation, but I sign anything over $250K. Show me cost per shipment.", False),
    ("EV-EML-0201", "halcyon", "email", "2026-10-02", "Tom Reyes, VP IT", "I'll champion this internally. Final call is Priya's.", False),
    ("EV-CRM-0057", "halcyon", "salesforce", "2026-11-03", "Opportunity field Security_Review__c", "Open: questionnaire items 7 and 12 pending with Ana Cole.", False),
    ("EV-EML-0193", "halcyon", "email", "2026-10-21", "Maya Okafor to Tom Reyes", "Confirming we'll extend your pilot by 30 days, through Nov 30.", False),
    ("EV-CALL-0365", "brightwater", "call", "2026-10-08", "Dr. Lena Ortiz, Director Clinical Ops", "Our real pain is scheduling handoffs between clinics.", False),
    ("EV-EML-0310", "brightwater", "email", "2026-10-30", "Dr. Lena Ortiz", "I've submitted the budget request to finance. Review usually takes two to three weeks.", False),
    ("EV-CRM-0102", "orchard", "salesforce", "2026-06-29", "Last activity with Marcus Bell", "Demo follow-up sent. No reply logged since.", False),
    ("EV-EML-0118", "orchard", "email", "2026-11-04", "Mail delivery system", "Delivery failed: marcus.bell@orchardlane.example, mailbox not found.", False),
    ("EV-EML-0422", "pinecrest", "email", "2026-11-02", "Grace Whitman, Procurement", "Please pause all vendor outreach until our audit closes on Jan 15.", False),
    ("EV-CRM-0140", "pinecrest", "salesforce", "2026-11-02", "Account field Do_Not_Contact__c", "true, until 2027-01-15", False),
    ("EV-CALL-0388", "lumen", "call", "2026-10-27", "Jae Park, VP Operations", "Usage is up. I'll sign the renewal if the QBR shows the uptime numbers.", False),
    ("EV-EML-0350", "lumen", "email", "2026-10-28", "Maya Okafor to Jae Park", "I'll send the QBR deck by Dec 1.", False),
    ("EV-CRM-0211", "lumen", "salesforce", "2026-11-10", "Usage snapshot", "92% of licensed seats active in the last 30 days.", False),
    ("EV-CRM-0230", "tidewater", "salesforce", "2026-09-15", "Opportunity notes", "Inbound. Wants a routing demo.", False),
    ("EV-EML-0277", "marlow", "email", "2026-09-12", "Karen Liu, Head of Claims Ops", "Budget for this lands in Q1.", False),
    ("EV-CALL-0451", "marlow", "call", "2026-10-15", "Karen Liu", "Realistically we're looking at Q2 funds now.", False),
    ("EV-CALL-0470", "sable", "call", "2026-10-20", "Omar Haddad, VP Grid Ops", "We need this live before the spring maintenance window.", False),
    ("EV-CALL-0471", "sable", "call", "2026-10-20", "Omar Haddad", "Personal remark about family plans (excluded by the privacy filter).", True),
    ("EV-EML-0299", "sable", "email", "2026-11-05", "Sable Energy legal", "Redlines attached on sections 4 and 9.", False),
    ("EV-CALL-0402", "juniper", "call", "2026-10-09", "Ruth Adeyemi, Principal", "It's just me and our office manager using it.", False),
    ("EV-CALL-0433", "corvid", "call", "2026-10-29", "Sam Ito, CFO", "If you can do a two-year term, we can talk price.", False),
    ("EV-PAT-001", None, "pattern", "2026-11-01", "11 enterprise wins, 2024 to 2026", "In 9 of 11 wins the security review closed before the first pricing call.", False),
    ("EV-PAT-002", None, "pattern", "2026-11-01", "38 discovery calls", "Asked who signs by the second meeting in 31 of 38 deals.", False),
    ("EV-PAT-003", None, "pattern", "2026-11-01", "1,204 customer emails", "Median reply time 3.1 business hours.", False),
    ("EV-PAT-004", None, "pattern", "2026-11-01", "11 enterprise wins", "Average of 6 engaged contacts per won enterprise deal.", False),
    ("EV-PAT-005", None, "pattern", "2026-11-01", "212 calls", "Written recap with dated next steps sent within 24 hours after 94% of calls.", False),
    ("EV-PAT-006", None, "pattern", "2026-11-01", "17 discounted deals", "14 of 17 discounts traded for a multi-year term or a case study.", False),
    ("EV-PAT-007", None, "pattern", "2026-11-01", "38 discovery calls", "Talk ratio 38% on discovery calls.", False),
    ("EV-PAT-008", None, "pattern", "2026-11-01", "6 quarter-end deals", "10% discount on 6 deals closed in the last week of a quarter.", False),
]

# contact_id, account_id, name, title, email local part, relationship, note, evidence_id, last_touch, email_status
CONTACTS = [
    ("C-001", "halcyon", "Priya Nair", "CFO", "priya.nair", "decides_for", "Signs anything over $250K; wants cost per shipment", "EV-CALL-0412", "2026-09-18", "ok"),
    ("C-002", "halcyon", "Tom Reyes", "VP IT", "tom.reyes", "champion_of", "Runs the evaluation; not the buyer", "EV-EML-0201", "2026-10-21", "ok"),
    ("C-003", "halcyon", "Ana Cole", "Security lead", "ana.cole", "blocks", "Owns the open security questionnaire", "EV-CRM-0057", "2026-11-03", "ok"),
    ("C-004", "brightwater", "Lena Ortiz", "Director Clinical Ops", "lena.ortiz", "champion_of", "Pain is scheduling handoffs between clinics", "EV-CALL-0365", "2026-10-30", "ok"),
    ("C-005", "orchard", "Marcus Bell", "Head of eCommerce", "marcus.bell", "champion_of", "Last touch 140 days ago; email now bounces", "EV-CRM-0102", "2026-06-29", "bounced"),
    ("C-006", "pinecrest", "Grace Whitman", "Procurement", "grace.whitman", "influences", "Asked to pause all vendor outreach", "EV-EML-0422", "2026-11-02", "ok"),
    ("C-007", "lumen", "Jae Park", "VP Operations", "jae.park", "decides_for", "Will renew if the QBR shows uptime", "EV-CALL-0388", "2026-10-28", "ok"),
    ("C-008", "marlow", "Karen Liu", "Head of Claims Ops", "karen.liu", "decides_for", "Budget owner", "EV-EML-0277", "2026-10-15", "ok"),
    ("C-009", "sable", "Omar Haddad", "VP Grid Ops", "omar.haddad", "decides_for", "Needs go-live before the spring maintenance window", "EV-CALL-0470", "2026-11-05", "ok"),
    ("C-010", "juniper", "Ruth Adeyemi", "Principal", "ruth.adeyemi", "decides_for", "Two users: herself and the office manager", "EV-CALL-0402", "2026-10-09", "ok"),
    ("C-011", "corvid", "Sam Ito", "CFO", "sam.ito", "decides_for", "Open to price talk for a two-year term", "EV-CALL-0433", "2026-10-29", "ok"),
]

# fact_id, account_id, fact_type, fact_key, text, evidence_id, due_date
FACTS = [
    ("F-001", "halcyon", "commitment", None, "30-day pilot extension, through Nov 30", "EV-EML-0193", "2026-11-30"),
    ("F-002", "halcyon", "risk", None, "Security review open: questionnaire items 7 and 12", "EV-CRM-0057", None),
    ("F-003", "brightwater", "fact", "budget_status", "Budget request submitted to finance on Oct 30", "EV-EML-0310", None),
    ("F-004", "brightwater", "risk", None, "Budget not yet approved; finance review takes two to three weeks", "EV-EML-0310", None),
    ("F-005", "orchard", "risk", None, "Champion may have left: email bounced on Nov 4", "EV-EML-0118", None),
    ("F-006", "pinecrest", "risk", None, "Do not contact until Jan 15, 2027 (audit)", "EV-CRM-0140", None),
    ("F-007", "lumen", "commitment", None, "QBR deck with uptime numbers by Dec 1", "EV-EML-0350", "2026-12-01"),
    ("F-008", "lumen", "fact", "usage", "92% of licensed seats active in the last 30 days", "EV-CRM-0211", None),
    ("F-009", "tidewater", "fact", "lead_source", "Inbound lead asking for a routing demo", "EV-CRM-0230", None),
    ("F-010", "marlow", "fact", "budget_timing", "Budget lands in Q1", "EV-EML-0277", None),
    ("F-011", "marlow", "fact", "budget_timing", "Q2 funds now", "EV-CALL-0451", None),
    ("F-012", "sable", "risk", None, "Legal redlines open on sections 4 and 9", "EV-EML-0299", None),
    ("F-013", "sable", "fact", "personal", "Family plans mentioned on the Oct 20 call", "EV-CALL-0471", None),
]

# note_id, account_id, text, evidence_id (None = an unsupported draft claim from the seller's notes)
SELLER_NOTES = [
    ("N-001", "brightwater", "Champion has approved budget", None),
]

# step_id, text, segments, min stage order, evidence, status, note
PATTERN_STEPS = [
    ("PS-01", "Clear the security review before any pricing call", ["Enterprise"], 3, "EV-PAT-001", "approved", None),
    ("PS-02", "Ask who signs by the second meeting", ["Enterprise", "Mid-market", "SMB"], 0, "EV-PAT-002", "approved", None),
    ("PS-03", "Reply to customer emails within 4 business hours", ["Enterprise", "Mid-market", "SMB"], 0, "EV-PAT-003", "approved", "Maya edited this from 2 hours to 4."),
    ("PS-04", "Multi-thread to five or more contacts", ["Enterprise"], 0, "EV-PAT-004", "approved", None),
    ("PS-05", "Send a written recap with dated next steps within 24 hours", ["Enterprise", "Mid-market", "SMB"], 0, "EV-PAT-005", "approved", None),
    ("PS-06", "Trade any discount for a multi-year term or a case study", ["Enterprise", "Mid-market"], 0, "EV-PAT-006", "approved", None),
    ("PS-07", "Let the customer talk: aim for a talk ratio under 40% on discovery", ["Enterprise", "Mid-market", "SMB"], 0, "EV-PAT-007", "approved", None),
    ("PS-08", "Discount 10% in the last week of the quarter", ["Enterprise", "Mid-market", "SMB"], 0, "EV-PAT-008", "rejected", "Maya rejected it: \"It happened, but it isn't a practice I'd teach.\""),
]

# task_id, account_id, text, evidence_id, pattern_step_id, is_outreach, sort
TASKS = [
    ("T-001", "halcyon", "Book 30 minutes with Ana Cole to close questionnaire items 7 and 12", "EV-CRM-0057", "PS-01", True, 1),
    ("T-002", "halcyon", "Confirm the pilot extension in writing to Tom Reyes", "EV-EML-0193", "PS-05", True, 2),
    ("T-003", "halcyon", "Once security clears, hold the pricing call with Priya Nair and lead with cost per shipment", "EV-CALL-0412", "PS-02", True, 3),
    ("T-004", "brightwater", "Ask Lena Ortiz for the finance review date and who presents it", "EV-EML-0310", "PS-02", True, 1),
    ("T-005", "orchard", "Re-verify the champion: check the company site and ask the account admin who now owns eCommerce", "EV-EML-0118", None, False, 1),
    ("T-006", "pinecrest", "Send the renewal quote to Grace Whitman", "EV-EML-0422", None, True, 1),
    ("T-007", "pinecrest", "Schedule the renewal kickoff call", "EV-CRM-0140", None, True, 2),
    ("T-008", "lumen", "Build the QBR deck around uptime and send it by Dec 1", "EV-EML-0350", "PS-05", True, 1),
    ("T-009", "lumen", "Book the renewal call with Jae Park for the week of Dec 7", "EV-CALL-0388", None, True, 2),
    ("T-010", "tidewater", "Run discovery and ask who signs by the second meeting", "EV-PAT-002", "PS-02", True, 1),
    ("T-011", "marlow", "Ask Karen Liu to confirm whether funds land in Q1 or Q2", "EV-CALL-0451", None, True, 1),
    ("T-012", "sable", "Get legal answers on sections 4 and 9 back within the week", "EV-EML-0299", "PS-03", False, 1),
    ("T-013", "juniper", "Send a 2-seat proposal with a short recap of the Oct 9 call", "EV-CALL-0402", "PS-05", True, 1),
    ("T-014", "juniper", "Add four more contacts to the deal", "EV-PAT-004", "PS-04", True, 2),
    ("T-015", "corvid", "Offer pricing tied to a two-year term", "EV-CALL-0433", "PS-06", True, 1),
    ("T-016", "corvid", "Offer a 10% quarter-end discount", "EV-PAT-008", "PS-08", True, 2),
]

STAGE_ORDER = {"Discovery": 0, "Evaluation": 1, "Proposal": 2, "Negotiation": 3, "Renewal": 3}


def sql(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return "ARRAY[" + ", ".join(sql(x) for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"


def apex(v):
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def build_seed():
    return {
        "config": CONFIG,
        "sellers": SELLERS,
        "transfer": TRANSFER,
        "accounts": [dict(zip(["account_id", "name", "segment", "industry", "state_code", "stage", "amount", "close_date",
                               "budget_status", "do_not_contact_until", "proves"], a)) for a in ACCOUNTS],
        "contacts": [dict(zip(["contact_id", "account_id", "name", "title", "email", "relationship", "note", "evidence_id",
                               "last_touch", "email_status"], c[:4] + (c[4] + "@" + c[1] + ".example",) + c[5:])) for c in CONTACTS],
        "evidence": [dict(zip(["evidence_id", "account_id", "source_system", "source_date", "speaker", "text", "is_personal"], e)) for e in EVIDENCE],
        "facts": [dict(zip(["fact_id", "account_id", "fact_type", "fact_key", "text", "evidence_id", "due_date"], f)) for f in FACTS],
        "seller_notes": [dict(zip(["note_id", "account_id", "text", "evidence_id"], n)) for n in SELLER_NOTES],
        "pattern_steps": [dict(zip(["step_id", "text", "segments", "min_stage_order", "evidence_id", "status", "note"], p)) for p in PATTERN_STEPS],
        "tasks": [dict(zip(["task_id", "account_id", "text", "evidence_id", "pattern_step_id", "is_outreach", "sort_order"], t)) for t in TASKS],
        "stage_order": STAGE_ORDER,
    }


def insert(table, rows, cols):
    lines = [f"INSERT INTO {table} ({', '.join(cols)}) VALUES"]
    vals = ["  (" + ", ".join(sql(r[c]) for c in cols) + ")" for r in rows]
    return "\n".join(lines) + "\n" + ",\n".join(vals) + ";\n"


def build_sql(seed):
    out = ["-- 03_seed.sql: generated by data/generate_data.py. Do not edit by hand.",
           "-- All data is fictional. Safe to re-run: it clears the raw tables first.",
           "BEGIN;",
           "TRUNCATE raw.tasks, raw.seller_notes, raw.facts, raw.contacts, raw.evidence, raw.opportunities, raw.accounts,",
           "         raw.pattern_steps, raw.transfers, raw.sellers, raw.stage_order RESTART IDENTITY CASCADE;",
           "DELETE FROM app.config;",
           ""]
    out.append(insert("app.config", [{"key": k, "value": str(v)} for k, v in seed["config"].items()], ["key", "value"]))
    out.append(insert("raw.stage_order", [{"stage": k, "stage_order": v} for k, v in seed["stage_order"].items()], ["stage", "stage_order"]))
    out.append(insert("raw.sellers", seed["sellers"], ["seller_id", "name", "role", "email", "consent_status", "consent_date", "last_day"]))
    out.append(insert("raw.transfers", [seed["transfer"]], ["transfer_id", "from_seller", "to_seller", "owner", "started_on", "status"]))
    acc_cols = ["account_id", "name", "segment", "industry", "state_code", "do_not_contact_until", "proves"]
    out.append(insert("raw.accounts", [dict(a, owner="maya") for a in seed["accounts"]], acc_cols + ["owner"]))
    opps = [{"opportunity_id": "O-" + a["account_id"], "account_id": a["account_id"], "name": a["name"] + " " + a["stage"].lower(),
             "stage": a["stage"], "amount": a["amount"], "close_date": a["close_date"], "budget_status": a["budget_status"]} for a in seed["accounts"]]
    out.append(insert("raw.opportunities", opps, ["opportunity_id", "account_id", "name", "stage", "amount", "close_date", "budget_status"]))
    out.append(insert("raw.evidence", seed["evidence"], ["evidence_id", "account_id", "source_system", "source_date", "speaker", "text", "is_personal"]))
    out.append(insert("raw.contacts", seed["contacts"], ["contact_id", "account_id", "name", "title", "email", "relationship", "note", "evidence_id", "last_touch", "email_status"]))
    out.append(insert("raw.facts", seed["facts"], ["fact_id", "account_id", "fact_type", "fact_key", "text", "evidence_id", "due_date"]))
    out.append(insert("raw.seller_notes", seed["seller_notes"], ["note_id", "account_id", "text", "evidence_id"]))
    out.append(insert("raw.pattern_steps", [dict(p, seller_id="maya") for p in seed["pattern_steps"]],
                      ["step_id", "seller_id", "text", "segments", "min_stage_order", "evidence_id", "status", "note"]))
    out.append(insert("raw.tasks", seed["tasks"], ["task_id", "account_id", "text", "evidence_id", "pattern_step_id", "is_outreach", "sort_order"]))
    out.append("COMMIT;\n")
    return "\n".join(out)


def build_sync_sample(seed):
    out = ["-- 06_sync_sample.sql: generated by data/generate_data.py.",
           "-- Stand-in Salesforce IDs, so the app runs without a Salesforce org.",
           "-- With a real org, run scripts/build-sync-sql.mjs to produce db/sql/06_sync.sql instead.",
           "BEGIN;"]
    for i, a in enumerate(seed["accounts"], 1):
        out.append(f"UPDATE raw.accounts SET sf_account_id = '001DEMO{i:011d}' WHERE account_id = {sql(a['account_id'])};")
    for i, a in enumerate(seed["accounts"], 1):
        out.append(f"UPDATE raw.opportunities SET sf_opportunity_id = '006DEMO{i:011d}' WHERE account_id = {sql(a['account_id'])};")
    out.append("COMMIT;\n")
    return "\n".join(out)


def build_apex(seed):
    lines = ["// seed.apex: generated by data/generate_data.py. Do not edit by hand.",
             "// Seeds fictional SalesLore demo records. Safe to re-run: deletes its own records first.",
             "// Run: sf apex run --file salesforce/seed.apex --target-org saleslore",
             "delete [SELECT Id FROM Opportunity WHERE Description LIKE 'SalesLore demo:%'];",
             "delete [SELECT Id FROM Contact WHERE Description LIKE 'SalesLore demo:%'];",
             "delete [SELECT Id FROM Account WHERE Description LIKE 'SalesLore demo:%'];",
             "Map<String, Account> accts = new Map<String, Account>();"]
    for a in seed["accounts"]:
        lines.append(f"accts.put({apex(a['account_id'])}, new Account(Name = {apex(a['name'])}, Industry = {apex(a['industry'])}, "
                     f"BillingCountryCode = 'US', BillingStateCode = {apex(a['state_code'])}, "
                     f"Website = {apex('https://' + a['account_id'] + '.example')}, Description = {apex('SalesLore demo: ' + a['account_id'])}));")
    lines.append("insert accts.values();")
    lines.append("List<Contact> contacts = new List<Contact>();")
    for c in seed["contacts"]:
        first, last = c["name"].split(" ", 1)
        lines.append(f"contacts.add(new Contact(AccountId = accts.get({apex(c['account_id'])}).Id, FirstName = {apex(first)}, LastName = {apex(last)}, "
                     f"Title = {apex(c['title'])}, Email = {apex(c['email'])}, Description = {apex('SalesLore demo: ' + c['contact_id'])}));")
    lines.append("insert contacts;")
    lines.append("List<Opportunity> opps = new List<Opportunity>();")
    sf_stage = {"Discovery": "Qualification", "Evaluation": "Needs Analysis", "Proposal": "Proposal/Price Quote",
                "Negotiation": "Negotiation/Review", "Renewal": "Negotiation/Review"}
    for a in seed["accounts"]:
        close = a["close_date"] or "2027-06-30"
        y, m, d = close.split("-")
        lines.append(f"opps.add(new Opportunity(AccountId = accts.get({apex(a['account_id'])}).Id, Name = {apex(a['name'] + ' ' + a['stage'].lower())}, "
                     f"StageName = {apex(sf_stage[a['stage']])}, Amount = {a['amount']}, CloseDate = Date.newInstance({int(y)}, {int(m)}, {int(d)}), "
                     f"Description = {apex('SalesLore demo: ' + a['account_id'])}));")
    lines.append("insert opps;")
    lines.append("System.debug('SalesLore demo seeded: ' + accts.size() + ' accounts, ' + contacts.size() + ' contacts, ' + opps.size() + ' opportunities');")
    return "\n".join(lines) + "\n"


def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print("wrote", path)


def main():
    seed = build_seed()
    write("data/seed/seed.json", json.dumps(seed, indent=2, ensure_ascii=False) + "\n")
    write("db/sql/03_seed.sql", build_sql(seed))
    write("db/sql/06_sync_sample.sql", build_sync_sample(seed))
    write("salesforce/seed.apex", build_apex(seed))


if __name__ == "__main__":
    main()
