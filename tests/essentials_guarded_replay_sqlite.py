"""SQLite integration qualification of actual private replay SELECT (no Cloudflare writes)."""
import json
import re
import sqlite3
from pathlib import Path

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for path in [
    "tests/fixtures/essentials_d1_synthetic_dependencies_STAGING_ONLY.sql",
    "cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql",
    "cloudflare/migrations/essentials_accepted_quotation_snapshots_STAGING_CANDIDATE.sql",
]:
    db.executescript(Path(path).read_text())

js = Path("server/essentials-guarded-idempotent-replay.mjs").read_text()
query = re.search(r"db\.prepare\(`([\s\S]*?)`\)\.bind", js)
assert query, "replay lookup must use actual D1 SQL"
sql = query.group(1).strip()
assert "JOIN essentials_accepted_quotation_snapshots" in sql
assert sql.count("?") == 7

db.execute("""INSERT INTO essentials_accepted_quotation_snapshots
(tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,total_minor,accepted_by_user_id,accepted_at)
VALUES ('synthetic-tenant-a','quote-a','synthetic-customer-a','Q-100',2,10000,'synthetic-owner-a','2026-11-19T10:00:00Z')""")
draft = {
    "tenantId": "synthetic-tenant-a", "customerId": "synthetic-customer-a",
    "sourceQuotationReference": "Q-100", "invoiceReference": "ED-100",
    "totalMinor": 10000, "currency": "BWP", "status": "draft",
}
db.execute("""INSERT INTO essentials_invoice_drafts
(id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,draft_payload_json,created_by_user_id)
VALUES (?,?,?,?,?,?,?,?)""",
("draft-a", "synthetic-tenant-a", "synthetic-customer-a", "quote-a",
 "idem-a", "ED-100", json.dumps(draft), "synthetic-owner-a"))

def eligible(tenant="synthetic-tenant-a", key="idem-a", source="quote-a",
             customer="synthetic-customer-a", version=2, reference="Q-100", total=10000):
    return db.execute(sql, (tenant, key, source, customer, version, reference, total)).fetchall()

assert len(eligible()) == 1, "valid acceptance must permit matching replay"
for name, kwargs in [
    ("different_tenant", {"tenant": "synthetic-tenant-b"}),
    ("different_key", {"key": "wrong"}),
    ("different_source", {"source": "wrong"}),
    ("different_customer", {"customer": "synthetic-customer-b"}),
    ("stale_version", {"version": 1}),
    ("wrong_reference", {"reference": "Q-200"}),
    ("wrong_total", {"total": 9999}),
]:
    assert not eligible(**kwargs), name

db.execute("""UPDATE essentials_accepted_quotation_snapshots
 SET state='revoked' WHERE tenant_id='synthetic-tenant-a' AND quotation_id='quote-a'""")
assert not eligible(), "existing draft must not replay after revocation"
assert db.execute("SELECT COUNT(*) FROM essentials_invoice_drafts").fetchone()[0] == 1
print("PASS: actual replay SQL requires live accepted snapshot/version/tenant/customer/reference/total; revoked denies")
