"""Isolated offline SQLite tests of actual private receipt commit/read SQL.
Never connects to Cloudflare or production. All identities/bytes are synthetic.
"""
import json
import re
import sqlite3
from pathlib import Path

db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("cloudflare/migrations/essentials_private_consent_authority_STAGING_CANDIDATE.sql").read_text())
source=Path("server/essentials-private-consent-authority-store.mjs").read_text()
def sql(name):
    found=re.search(r"export const "+name+r"=\x60([\s\S]*?)\x60\.trim\(\);",source)
    assert found,name
    return found.group(1).strip()
commit=sql("ESSENTIALS_PRIVATE_COMMIT_RECEIPT_SQL")
current=sql("ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL")
assert commit.count("?")==16 and current.count("?")==3
H_Q="a"*64
H_C="b"*64
T="synthetic-tenant-a"
Q="quote-a"
A="synthetic-owner-a"
C="synthetic-customer-a"
REF="Q-101"
VERSION=2
AMOUNT=10000
WHEN="2026-11-19T09:00:00Z"
ISSUED="2026-11-19T09:05:00Z"
EXPIRES="2026-11-19T09:10:00Z"
sig="A"*86
def quote(q=Q,tenant=T,quotehash=H_Q,customer=C,ref=REF,version=VERSION,total=AMOUNT):
    db.execute("""INSERT INTO essentials_private_frozen_quotes
       (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
       total_minor,quotation_sha256,immutable_quotation_bytes,frozen_by_actor_user_id,frozen_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)""",
       (tenant,q,customer,ref,version,total,quotehash,b"frozen synthetic quote",A,WHEN))
def consent(q=Q,tenant=T,quotehash=H_Q,consenthash=H_C,subject="synthetic-consent-subject-a",
            customer=C,ref=REF,version=VERSION,total=AMOUNT):
    db.execute("""INSERT INTO essentials_private_verified_consents
      (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,total_minor,
       quotation_sha256,consent_sha256,immutable_consent_bytes,consent_subject_id,actor_user_id,accepted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
       (tenant,q,customer,ref,version,total,quotehash,consenthash,
        b"synthetic customer consent bytes",subject,A,WHEN))
def payload(q=Q,tenant=T,receipt="receipt-a",customer=C,ref=REF,version=VERSION,total=AMOUNT,
            quotehash=H_Q,consenthash=H_C):
    return json.dumps({
        "acceptanceVersion":version,"acceptedAt":WHEN,"acceptedByUserId":A,
        "consentSha256":consenthash,"customerId":customer,"expiresAt":EXPIRES,
        "issuedAt":ISSUED,"issuer":"thebe-private-quotation-consent-staging",
        "purpose":"thebe.essentials.quotation-acceptance.v1",
        "quotationId":q,"quotationReference":ref,"quotationSha256":quotehash,
        "receiptId":receipt,"tenantId":tenant,"totalMinor":total
    },separators=(",",":"),sort_keys=True)
def insert(q=Q,tenant=T,receipt="receipt-a",customer=C,ref=REF,version=VERSION,total=AMOUNT,
           quotehash=H_Q,consenthash=H_C,accepted=WHEN):
    p=payload(q,tenant,receipt,customer,ref,version,total,quotehash,consenthash)
    return db.execute(commit,(receipt,A,p,sig,ISSUED,EXPIRES,tenant,q,customer,ref,
                 version,total,quotehash,consenthash,A,accepted)).rowcount
def read(q=Q,tenant=T):
    return db.execute(current,(tenant,q,A)).fetchone()

quote()
consent()
assert insert()==1
r=read()
assert r and r[0]=="receipt-a"
assert json.loads(r[1])["totalMinor"]==AMOUNT
assert not read("wrong")
# Duplicate issue must fail, not overwrite the existing immutable acceptance
try:
    insert()
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate signed receipt unexpectedly persisted")
# Quote revocation denies read even for a cryptographically signed past receipt
db.execute("UPDATE essentials_private_frozen_quotes SET state='revoked' WHERE tenant_id=? AND quotation_id=?",(T,Q))
assert read() is None
for bad in [
    "UPDATE essentials_private_frozen_quotes SET state='accepted' WHERE quotation_id='quote-a'",
    "UPDATE essentials_private_frozen_quotes SET total_minor=9 WHERE quotation_id='quote-a'",
    "DELETE FROM essentials_private_frozen_quotes WHERE quotation_id='quote-a'",
]:
    try:db.execute(bad)
    except sqlite3.IntegrityError:continue
    raise AssertionError("immutable quote permitted: "+bad)
# Separate active accepted quote but revoked consent
quote(q="quote-b")
consent(q="quote-b")
assert insert(q="quote-b",receipt="receipt-b")==1
db.execute("UPDATE essentials_private_verified_consents SET state='revoked' WHERE quotation_id='quote-b'")
assert read(q="quote-b") is None
for bad in [
    "UPDATE essentials_private_verified_consents SET state='accepted' WHERE quotation_id='quote-b'",
    "DELETE FROM essentials_private_verified_consents WHERE quotation_id='quote-b'",
]:
    try:db.execute(bad)
    except sqlite3.IntegrityError:continue
    raise AssertionError("immutable consent permitted: "+bad)
# Separate active quote/consent with no receipt, and mismatched source fields
quote(q="quote-c")
consent(q="quote-c")
assert insert(q="quote-c",receipt="bad-version",version=1)==0
assert insert(q="quote-c",receipt="bad-customer",customer="other")==0
assert insert(q="quote-c",receipt="bad-total",total=1)==0
assert insert(q="quote-c",receipt="bad-ref",ref="WRONG")==0
assert insert(q="quote-c",receipt="bad-quotehash",quotehash="f"*64)==0
assert insert(q="quote-c",receipt="bad-consenthash",consenthash="d"*64)==0
assert insert(q="quote-c",tenant="synthetic-tenant-b",receipt="bad-tenant")==0
# An authority without a verified customer subject must not permit receipt issuance
quote(q="quote-d")
consent(q="quote-d",subject="")
assert insert(q="quote-d",receipt="bad-subject")==0
# A mismatching consent against an otherwise accepted frozen quote cannot authorize
quote(q="quote-e")
consent(q="quote-e",quotehash="c"*64)
assert insert(q="quote-e",receipt="bad-consent-quote")==0
# Explicit receipt revocation also invalidates read, and cannot be undone
quote(q="quote-f")
consent(q="quote-f")
assert insert(q="quote-f",receipt="receipt-f")==1
db.execute("UPDATE essentials_private_signed_receipts SET state='revoked' WHERE quotation_id='quote-f'")
assert read(q="quote-f") is None
for bad in [
    "UPDATE essentials_private_signed_receipts SET state='issued' WHERE quotation_id='quote-f'",
    "DELETE FROM essentials_private_signed_receipts WHERE quotation_id='quote-f'",
]:
    try:db.execute(bad)
    except sqlite3.IntegrityError:continue
    raise AssertionError("immutable receipt permitted: "+bad)
print("PASS: real guarded SQL atomically commits matching active quote/consent and denies revoked, tampered, duplicate and cross-tenant receipts")
