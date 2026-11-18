import sqlite3
from pathlib import Path

sql = Path("cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql").read_text()
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("tests/fixtures/essentials_d1_synthetic_dependencies_STAGING_ONLY.sql").read_text())
db.executescript(sql)
def insert(identifier,tenant,customer,source,key,number):
 db.execute("""INSERT INTO essentials_invoice_drafts
 (id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,draft_payload_json,created_by_user_id)
 VALUES (?,?,?,?,?,?,?,?)""",(identifier,tenant,customer,source,key,number,'{"status":"draft"}','owner-1'))
insert("1","synthetic-tenant-a","synthetic-customer-a","quote-1","request-1","INV-1")
for case in [
 ("2","synthetic-tenant-a","synthetic-customer-a","quote-2","request-1","INV-2"), # same idempotency key
 ("3","synthetic-tenant-a","synthetic-customer-a","quote-3","request-3","INV-1"), # same invoice number
 ("4","synthetic-tenant-a","synthetic-customer-a","quote-1","request-4","INV-4"), # same source
 ("5","synthetic-tenant-a","synthetic-customer-b","quote-5","request-5","INV-5"), # cross-tenant customer
]:
 try:
  insert(*case)
 except sqlite3.IntegrityError:
  continue
 raise AssertionError(f"Unsafe insertion succeeded: {case}")
insert("6","synthetic-tenant-b","synthetic-customer-b","quote-1","request-1","INV-1")
assert db.execute("SELECT COUNT(*) FROM essentials_invoice_drafts").fetchone()[0] == 2
print("PASS: schema loads; unique idempotency/reference/source, customer tenant guard, and tenant separation verified")
