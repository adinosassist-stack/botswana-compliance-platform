"""OFFLINE ONLY: use real source D1 guarded SQL against fresh in-memory SQLite.

No Cloudflare credentials, no remote calls, no customer invoices, no worker/deploy.
"""
import hashlib
import json
import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
raw = (root / "tests/fixtures/essentials_invoice_prewrite_synthetic_v1.json").read_bytes()
plan = json.loads(raw)
f = plan["fixture"]
assert plan["kind"] == "thebe-essentials-invoice-prewrite-synthetic-v1"
assert plan["mode"] == "offline-only-unapproved-remote-execution"
assert plan["readyForRemoteWrite"] is False
assert plan["requiresNewOwnerApproval"] is True
assert plan["requiresNewIndependentThusicoApproval"] is True
assert plan["environment"] == "essentials-invoice-staging-protected"
assert plan["isolatedD1Id"] == "f6d35915-851a-4771-9e07-589572dc4d05"
assert plan["forbiddenProductionD1Id"] == "8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"
assert plan["isolatedD1Id"] != plan["forbiddenProductionD1Id"]
assert plan["protectedMainAtPreparation"] == "a29a735317a34aad251724a67b4100342ec08bff"
assert f["tenantId"] != f["otherTenantId"] and f["customerId"] != f["otherCustomerId"]
assert type(f["totalMinor"]) is int and f["totalMinor"] > 0
assert f["acceptanceVersion"] == 1

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for relative in (
    "tests/fixtures/essentials_d1_synthetic_dependencies_STAGING_ONLY.sql",
    "cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql",
    "cloudflare/migrations/essentials_accepted_quotation_snapshots_STAGING_CANDIDATE.sql",
):
    db.executescript((root / relative).read_text())

source = (root / "server/essentials-accepted-quotation-guard.mjs").read_text()
match = re.search(
    r"export const ACCEPTED_QUOTATION_GUARDED_DRAFT_INSERT_SQL\s*=\s*\x60([\s\S]*?)\x60\.trim\(\)",
    source,
)
assert match, "actual guarded insert SQL must remain extractable from checked-out source"
guarded_sql = match.group(1).strip()
assert "FROM essentials_accepted_quotation_snapshots" in guarded_sql
assert "a.state='accepted'" in guarded_sql
assert guarded_sql.count("?") == 20, "SQL placeholder changes require fixture review"

db.execute(
    """INSERT INTO essentials_accepted_quotation_snapshots
    (tenant_id,quotation_id,customer_id,quotation_reference,
     acceptance_version,total_minor,accepted_by_user_id,accepted_at)
    VALUES (?,?,?,?,?,?,?,?)""",
    (
        f["tenantId"], f["quotationId"], f["customerId"], f["quotationReference"],
        f["acceptanceVersion"], f["totalMinor"], f["actorId"], f["acceptedAt"],
    ),
)
draft = {
    "tenantId": f["tenantId"],
    "customerId": f["customerId"],
    "sourceQuotationReference": f["quotationReference"],
    "invoiceReference": f["invoiceNumber"],
    "totalMinor": f["totalMinor"],
    "currency": "BWP",
    "status": "draft",
}

def params(draft_data=None, suffix="", **overrides):
    payload = json.dumps(draft if draft_data is None else draft_data, separators=(",", ":"))
    args = [
        f["draftId"] + suffix, f["idempotencyKey"] + suffix,
        f["invoiceNumber"], payload, f["actorId"],
        f["tenantId"], f["quotationId"], f["customerId"],
        f["quotationReference"], f["acceptanceVersion"], f["totalMinor"],
        payload, payload, payload, payload, payload, payload, payload,
        f["invoiceNumber"], payload,
    ]
    for k, v in overrides.items():
        args[{"tenant":5, "quotation":6, "customer":7,
              "reference":8, "version":9, "total":10}[k]] = v
    assert len(args) == 20
    return args

def count():
    return db.execute("SELECT count(*) FROM essentials_invoice_drafts").fetchone()[0]

def denied(label, draft_data=None, **overrides):
    before = count()
    cursor = db.execute(
        guarded_sql,
        params(draft_data, suffix="-neg-" + label, **overrides),
    )
    assert cursor.rowcount == 0, label + " unexpectedly inserted a draft"
    assert count() == before, label + " left a partial write"

for label, overrides in (
    ("cross-tenant", {"tenant":f["otherTenantId"]}),
    ("cross-customer", {"customer":f["otherCustomerId"]}),
    ("wrong-quote", {"quotation":"wrong-synthetic-quote"}),
    ("wrong-ref", {"reference":"wrong-synthetic-reference"}),
    ("stale-version", {"version":f["acceptanceVersion"] + 1}),
    ("wrong-amount", {"total":f["totalMinor"] - 1}),
):
    denied(label, **overrides)
for label, changes in (
    ("currency", {"currency":"USD"}),
    ("payload-tenant", {"tenantId":f["otherTenantId"]}),
    ("payload-customer", {"customerId":f["otherCustomerId"]}),
    ("payload-source-ref", {"sourceQuotationReference":"Q-FOREIGN"}),
    ("payload-total", {"totalMinor":f["totalMinor"] - 1}),
    ("issued-status", {"status":"issued"}),
    ("invoice-reference", {"invoiceReference":"INV-FOREIGN"}),
):
    denied(label, draft_data={**draft, **changes})

assert count() == 0
assert db.execute(guarded_sql, params()).rowcount == 1
assert count() == 1
try:
    db.execute(guarded_sql, params())
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("same invoice source/idempotency must not duplicate")
assert count() == 1

js = (root / "server/essentials-guarded-idempotent-replay.mjs").read_text()
lookup = re.search(r"db\.prepare\(\x60([\s\S]*?)\x60\)\.bind", js)
assert lookup, "replay SQL must be extracted from the actual source file"
replay_sql = lookup.group(1).strip()
assert replay_sql.count("?") == 7
replay_params = (
    f["tenantId"], f["idempotencyKey"], f["quotationId"],
    f["customerId"], f["acceptanceVersion"],
    f["quotationReference"], f["totalMinor"],
)
assert len(db.execute(replay_sql, replay_params).fetchall()) == 1

db.execute(
    "UPDATE essentials_accepted_quotation_snapshots SET state='revoked' WHERE tenant_id=? AND quotation_id=?",
    (f["tenantId"], f["quotationId"]),
)
assert db.execute(replay_sql, replay_params).fetchall() == []
denied("revoked")
for destructive in (
    "UPDATE essentials_accepted_quotation_snapshots SET state='accepted'",
    "DELETE FROM essentials_accepted_quotation_snapshots",
):
    try:
        db.execute(destructive)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("revoked acceptance must be irreversible")

assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
db.close()
print("PASS: real guarded D1 SQL, 13 negative cases, duplicate, replay, revocation,"
      " immutability; local SQLite only; fixture_sha256=" + hashlib.sha256(raw).hexdigest())
