"""Offline-only candidate qualification: never connects to Cloudflare."""
import json
import re
import sqlite3
from pathlib import Path

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("tests/fixtures/essentials_d1_synthetic_dependencies_STAGING_ONLY.sql").read_text())
db.executescript(Path("cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql").read_text())
db.executescript(Path("cloudflare/migrations/essentials_accepted_quotation_snapshots_STAGING_CANDIDATE.sql").read_text())
js = Path("server/essentials-accepted-quotation-guard.mjs").read_text()
match = re.search(r"ACCEPTED_QUOTATION_GUARDED_DRAFT_INSERT_SQL = `([\s\S]*?)`\.trim", js)
assert match, "guarded SQL must be sourced from actual JS module"
sql = match.group(1).strip()
assert sql.count("?") == 17

db.execute("""INSERT INTO essentials_accepted_quotation_snapshots
(tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,total_minor,accepted_by_user_id,accepted_at)
VALUES ('synthetic-tenant-a','quote-a','synthetic-customer-a','Q-100',2,10000,'synthetic-owner-a','2026-11-18T10:00:00Z')""")
db.execute("""INSERT INTO essentials_accepted_quotation_snapshots
(tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,total_minor,accepted_by_user_id,accepted_at)
VALUES ('synthetic-tenant-b','quote-b','synthetic-customer-b','Q-200',3,20000,'synthetic-owner-a','2026-11-18T10:00:00Z')""")

def insert(identifier, *, tenant="synthetic-tenant-a", source="quote-a",
           customer="synthetic-customer-a", ref="Q-100", version=2, total=10000):
    payload=json.dumps({"tenantId":tenant,"customerId":customer,"sourceQuotationReference":ref,
                        "invoiceReference":"ED_"+identifier, "totalMinor":total,"status":"draft"})
    return db.execute(sql,(identifier,"key_"+identifier,"ED_"+identifier,payload,"synthetic-owner-a",
                           tenant,source,customer,ref,version,total,
                           payload,payload,payload,payload,payload,payload)).rowcount

assert insert("valid") == 1
assert insert("wrongtenant",tenant="synthetic-tenant-b") == 0
assert insert("wrongcustomer",customer="synthetic-customer-b") == 0
assert insert("wrongversion",version=1) == 0
assert insert("wrongtotal",total=9000) == 0
assert insert("wrongref",ref="Q-999") == 0
assert insert("missingsource",source="quote-missing") == 0
assert db.execute("SELECT COUNT(*) FROM essentials_invoice_drafts").fetchone()[0] == 1

db.execute("""UPDATE essentials_accepted_quotation_snapshots
 SET state='revoked' WHERE tenant_id='synthetic-tenant-a' AND quotation_id='quote-a'""")
assert insert("revoked") == 0
for stmt in [
 "UPDATE essentials_accepted_quotation_snapshots SET state='accepted' WHERE quotation_id='quote-a'",
 "UPDATE essentials_accepted_quotation_snapshots SET total_minor=1 WHERE quotation_id='quote-a'",
 "DELETE FROM essentials_accepted_quotation_snapshots WHERE quotation_id='quote-a'",
]:
    try:
        db.execute(stmt)
    except sqlite3.IntegrityError:
        continue
    raise AssertionError("Acceptance snapshot mutation bypassed guard: "+stmt)

# The acceptance table itself does not permit an inactive or cross-tenant customer.
try:
    db.execute("""INSERT INTO essentials_accepted_quotation_snapshots
    (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,total_minor,accepted_by_user_id,accepted_at)
    VALUES('synthetic-tenant-a','quote-invalid','synthetic-customer-b','Q-X',1,1,'synthetic-owner-a','2026-11-18')""")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Cross-tenant accepted quotation was inserted")

assert db.execute("SELECT COUNT(*) FROM essentials_invoice_drafts").fetchone()[0] == 1
print("PASS: guarded INSERT validates acceptance atomically; stale, revoked, cross-tenant and tampering rejected")
