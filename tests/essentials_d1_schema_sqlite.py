import sqlite3
from pathlib import Path

sql = Path("cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql").read_text()
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript("""
CREATE TABLE tenants(id TEXT PRIMARY KEY);
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE finance_customers(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,status TEXT NOT NULL);
INSERT INTO tenants VALUES ('tenant-a'),('tenant-b');
INSERT INTO users VALUES ('owner-1');
INSERT INTO finance_customers VALUES ('customer-a','tenant-a','active'),('customer-b','tenant-b','active');
""")
db.executescript(sql)
def insert(identifier,tenant,customer,source,key,number):
 db.execute("""INSERT INTO essentials_invoice_drafts
 (id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,draft_payload_json,created_by_user_id)
 VALUES (?,?,?,?,?,?,?,?)""",(identifier,tenant,customer,source,key,number,'{"status":"draft"}','owner-1'))
insert("1","tenant-a","customer-a","quote-1","request-1","INV-1")
for case in [
 ("2","tenant-a","customer-a","quote-2","request-1","INV-2"), # same idempotency key
 ("3","tenant-a","customer-a","quote-3","request-3","INV-1"), # same invoice number
 ("4","tenant-a","customer-a","quote-1","request-4","INV-4"), # same source
 ("5","tenant-a","customer-b","quote-5","request-5","INV-5"), # cross-tenant customer
]:
 try:
  insert(*case)
 except sqlite3.IntegrityError:
  continue
 raise AssertionError(f"Unsafe insertion succeeded: {case}")
insert("6","tenant-b","customer-b","quote-1","request-1","INV-1")
assert db.execute("SELECT COUNT(*) FROM essentials_invoice_drafts").fetchone()[0] == 2
print("PASS: schema loads; unique idempotency/reference/source, customer tenant guard, and tenant separation verified")
