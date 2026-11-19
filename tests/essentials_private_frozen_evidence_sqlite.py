"""Offline-only real SQLite qualification of frozen quotation/consent read.
All data synthetic. Never uses Cloudflare, production or user data.
"""
import hashlib
import re
import sqlite3
from pathlib import Path

source=Path("server/essentials-private-frozen-evidence-reader.mjs").read_text()
match=re.search(r"export const ESSENTIALS_PRIVATE_FROZEN_EVIDENCE_SQL=\x60([\s\S]*?)\x60\.trim\(\)",source)
assert match,"must test actual JS query"
sql=match.group(1).strip()
assert sql.count("?")==3
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("cloudflare/migrations/essentials_private_consent_authority_STAGING_CANDIDATE.sql").read_text())
qbytes=b"frozen synthetic quote document"
cbytes=b"customer authenticated consent evidence"
hq=hashlib.sha256(qbytes).hexdigest()
hc=hashlib.sha256(cbytes).hexdigest()
tenant="tenantA"; actor="actorA"
def qinsert(q, customer="customerA", reference="Q-100", amount=10000):
 db.execute("""INSERT INTO essentials_private_frozen_quotes
 (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,immutable_quotation_bytes,frozen_by_actor_user_id,frozen_at)
 VALUES (?,?,?,?,?,?,?,?,?,?)""",
 (tenant,q,customer,reference,2,amount,hq,qbytes,actor,"2026-11-19T09:00:00Z"))
def cinsert(q, customer="customerA", reference="Q-100",amount=10000,subject="verified-customer-subject-a"):
 db.execute("""INSERT INTO essentials_private_verified_consents
 (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,consent_sha256,immutable_consent_bytes,
 consent_subject_id,actor_user_id,accepted_at)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
 (tenant,q,customer,reference,2,amount,hq,hc,cbytes,subject,actor,
 "2026-11-19T09:00:00Z"))
def read(q,who=actor,company=tenant):
 db.row_factory=sqlite3.Row
 x=db.execute(sql,(company,q,who)).fetchone()
 return dict(x) if x else None
qinsert("quoteA");cinsert("quoteA")
row=read("quoteA")
assert row and row["quotation_sha256"]==hq and row["consent_sha256"]==hc
assert hashlib.sha256(row["quotation_bytes"]).hexdigest()==hq
assert hashlib.sha256(row["consent_bytes"]).hexdigest()==hc
assert read("quoteA","other") is None
assert read("quoteA",actor,"tenantB") is None
assert read("wrong") is None
db.execute("UPDATE essentials_private_frozen_quotes SET state='revoked' WHERE quotation_id='quoteA'")
assert read("quoteA") is None
qinsert("quoteB");cinsert("quoteB")
db.execute("UPDATE essentials_private_verified_consents SET state='revoked' WHERE quotation_id='quoteB'")
assert read("quoteB") is None
qinsert("quoteC",amount=10000);cinsert("quoteC",amount=10001)
assert read("quoteC") is None
qinsert("quoteD",customer="customerA");cinsert("quoteD",customer="customerB")
assert read("quoteD") is None
qinsert("quoteE");cinsert("quoteE",reference="Q-OTHER")
assert read("quoteE") is None
qinsert("quoteF");cinsert("quoteF",subject="")
assert read("quoteF") is None
print("PASS: real joined D1 source query rejects revoked, cross-tenant, wrong actor, missing subject and money/customer/reference mismatch")
