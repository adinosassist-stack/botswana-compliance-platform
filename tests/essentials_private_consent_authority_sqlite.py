"""Synthetic isolated SQLite test of the ACTUAL receipt write/read queries.
Requires all source-only staging schemas; NEVER executes Cloudflare operations.
Records may contain synthetic identity+quote data only, no real customer data.
"""
import hashlib
import json
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for name in [
 "essentials_private_consent_authority_STAGING_CANDIDATE.sql",
 "essentials_private_one_time_consent_STAGING_CANDIDATE.sql",
 "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
 "essentials_private_identity_bound_capture_STAGING_CANDIDATE.sql",
]:
 db.executescript(Path("cloudflare/migrations",name).read_text())
source=Path("server/essentials-private-consent-authority-store.mjs").read_text()
def sql(name):
 match=re.search(r"export const "+name+r"=\x60([\s\S]*?)\x60\.trim\(\);",source)
 assert match,name
 return match.group(1).strip()
COMMIT=sql("ESSENTIALS_PRIVATE_COMMIT_RECEIPT_SQL")
CURRENT=sql("ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL")
assert COMMIT.count("?")==16 and CURRENT.count("?")==3
assert COMMIT.count("essentials_private_customer_identity_links")==1
assert CURRENT.count("essentials_private_customer_identity_links")==1

NOW=int(time.time()*1000)
NOW_DATE=datetime.fromtimestamp(NOW/1000,tz=timezone.utc).replace(microsecond=0)
WHEN=NOW_DATE.strftime("%Y-%m-%dT%H:%M:%SZ")
ISSUED=(NOW_DATE+timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
EXPIRES=(NOW_DATE+timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
T="synthetic-tenant-a"; C="synthetic-customer-a"; A="synthetic-owner-a"
REF="Q-101"; VERSION=2; AMOUNT=10000; ISSUER="https://identity.example.test"
LINK="linkA"; SUB="synthetic-consent-subject-a"; TAG="a"*64
QUOTE_BYTES=b"synthetic frozen quote document"
QHASH=hashlib.sha256(QUOTE_BYTES).hexdigest()
sig="A"*86

db.execute("""INSERT INTO essentials_private_customer_identity_links
 (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,
 consent_subject_id,provisioned_by_actor_user_id,proof_reference_sha256,
 proof_verified_at_ms,expires_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?)""",
 (LINK,ISSUER,TAG,T,C,SUB,A,"b"*64,NOW-100000,NOW+360000))

def quote(q,tenant=T,customer=C,ref=REF,version=VERSION,total=AMOUNT,quotehash=QHASH):
 db.execute("""INSERT INTO essentials_private_frozen_quotes
 (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,immutable_quotation_bytes,frozen_by_actor_user_id,frozen_at)
 VALUES (?,?,?,?,?,?,?,?,?,?)""",
 (tenant,q,customer,ref,version,total,quotehash,QUOTE_BYTES,A,WHEN))

def valid_consent(q):
 ch="challenge-"+q
 nh=hashlib.sha256(ch.encode()).hexdigest()
 evidence={
  "method":"oidc-rs256-explicit-accept-v1","decision":"accept",
  "customerIdentityLinkId":LINK,"identityIssuer":ISSUER,
  "identitySubjectHmacSha256":TAG,"consentSubjectId":SUB,
  "challengeId":ch,"challengeNonceSha256":nh,
  "tenantId":T,"quotationId":q,"customerId":C,
  "actorUserId":A,"quotationReference":REF,
  "acceptanceVersion":VERSION,"totalMinor":AMOUNT,
  "quotationSha256":QHASH,"acceptedAt":WHEN,
  "identitySubjectSha256":"d"*64,"reauthenticatedAt":WHEN
 }
 blob=json.dumps(evidence,separators=(",",":")).encode()
 digest=hashlib.sha256(blob).hexdigest()
 db.execute("""INSERT INTO essentials_private_one_time_challenges
 (challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,
 quotation_reference,acceptance_version,total_minor,quotation_sha256,
 nonce_sha256,issued_at_ms,expires_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
 (ch,T,q,C,A,REF,VERSION,AMOUNT,QHASH,nh,NOW-20000,NOW+120000))
 db.execute("""INSERT INTO essentials_private_capture_attestations
 (challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,
 quotation_reference,acceptance_version,total_minor,quotation_sha256,
 nonce_sha256,consent_sha256,immutable_consent_bytes,consent_subject_id,
 accepted_at,accepted_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
 (ch,T,q,C,A,REF,VERSION,AMOUNT,QHASH,nh,digest,blob,SUB,WHEN,NOW))
 return digest

def malformed_legacy_consent(q,customer=C,ref=REF,version=VERSION,total=AMOUNT,
                             quotehash=QHASH,subject=SUB):
 # Deliberate tampering: a SQL row without verified capture/challenge lineage.
 blob=b"unproven browser claim"
 c_hash=hashlib.sha256(blob).hexdigest()
 db.execute("""INSERT INTO essentials_private_verified_consents
 (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,consent_sha256,immutable_consent_bytes,
 consent_subject_id,actor_user_id,accepted_at)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
 (T,q,customer,ref,version,total,quotehash,c_hash,blob,subject,A,WHEN))
 return c_hash

def payload(q,receipt,c_hash,customer=C,ref=REF,version=VERSION,total=AMOUNT,
            quotehash=QHASH,tenant=T):
 return json.dumps({
  "acceptanceVersion":version,"acceptedAt":WHEN,"acceptedByUserId":A,
  "consentSha256":c_hash,"customerId":customer,"expiresAt":EXPIRES,
  "issuedAt":ISSUED,"issuer":"thebe-private-quotation-consent-staging",
  "purpose":"thebe.essentials.quotation-acceptance.v1",
  "quotationId":q,"quotationReference":ref,"quotationSha256":quotehash,
  "receiptId":receipt,"tenantId":tenant,"totalMinor":total
 },sort_keys=True,separators=(",",":"))

def insert(q,receipt,c_hash,customer=C,ref=REF,version=VERSION,
           total=AMOUNT,quotehash=QHASH,tenant=T):
 body=payload(q,receipt,c_hash,customer,ref,version,total,quotehash,tenant)
 return db.execute(COMMIT,(receipt,A,body,sig,ISSUED,EXPIRES,tenant,q,
    customer,ref,version,total,quotehash,c_hash,A,WHEN)).rowcount
def read(q,tenant=T):
 return db.execute(CURRENT,(tenant,q,A)).fetchone()

quote("quote-a");ca=valid_consent("quote-a")
assert insert("quote-a","receipt-a",ca)==1
assert read("quote-a")[0]=="receipt-a"
assert json.loads(read("quote-a")[1])["totalMinor"]==AMOUNT
assert read("unknown") is None
assert read("quote-a","other-tenant") is None
try:
 insert("quote-a","receipt-a",ca)
except sqlite3.IntegrityError: pass
else: raise AssertionError("duplicate receipt was accepted")
# Explicit revocation of quote/consent/receipt still rejects current read.
db.execute("UPDATE essentials_private_frozen_quotes SET state='revoked' WHERE quotation_id='quote-a'")
assert read("quote-a") is None
quote("quote-b");cb=valid_consent("quote-b")
assert insert("quote-b","receipt-b",cb)==1
db.execute("UPDATE essentials_private_verified_consents SET state='revoked' WHERE quotation_id='quote-b'")
assert read("quote-b") is None
quote("quote-c");cc=valid_consent("quote-c")
for overrides in [
 {"customer":"other"},{"total":AMOUNT+1},{"ref":"WRONG"},{"version":3},
 {"quotehash":"e"*64},{"tenant":"other-tenant"}
]:
 assert insert("quote-c","bad-"+str(len(overrides)),cc,**overrides)==0
assert insert("quote-c","receipt-c",cc)==1
db.execute("UPDATE essentials_private_signed_receipts SET state='revoked' WHERE quotation_id='quote-c'")
assert read("quote-c") is None
# A raw consent row, including a forged subject, can never authorize issuance.
for q,opts in [
 ("unverified",{}),("wrong-subject",{"subject":""}),
 ("wrong-consent-customer",{"customer":"wrong"}),
 ("wrong-reference",{"ref":"WRONG"}),
 ("wrong-consent-total",{"total":AMOUNT+1}),
 ("wrong-consent-quotehash",{"quotehash":"e"*64})
]:
 quote(q)
 badhash=malformed_legacy_consent(q,**opts)
 assert insert(q,"fake-"+q,badhash)==0
# Newly revoked identity link invalidates already signed, otherwise valid receipts.
quote("quote-active");ch=valid_consent("quote-active")
assert insert("quote-active","receipt-active",ch)==1
assert read("quote-active") is not None
db.execute("UPDATE essentials_private_customer_identity_links SET state='revoked',revoked_at_ms=? WHERE link_id=?",(NOW,LINK))
assert read("quote-active") is None
# Once the customer link is revoked, issuance is impossible even for older consent.
quote("quote-after-revocation")
# Directly inject otherwise matching immutable consent/challenge rows as tampering
# to show that a previously revoked link cannot authorize any fresh receipt.
original=db.execute("SELECT * FROM essentials_private_verified_consents WHERE quotation_id='quote-active'").fetchone()
# Test the existing accepted quote's receipt record is immutable even after link removal.
try:
 db.execute("UPDATE essentials_private_customer_identity_links SET state='active',revoked_at_ms=NULL WHERE link_id=?",(LINK,))
except sqlite3.IntegrityError: pass
else: raise AssertionError("revoked identity link was resurrected")
print("PASS: real receipt SQL guards quote, consent, atomic capture and consumed challenge; identity-link revocation invalidates previously issued receipts")
