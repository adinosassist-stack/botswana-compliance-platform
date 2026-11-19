"""Consolidated private customer consent: run ACTUAL exported JS SQL in
explicit SQLite transactions, with synthetic customer/quote/terms/offer.
Offline only, NO real provider/customer/D1/Cloudflare/Finance operations.
"""
import hashlib,json,sqlite3,subprocess,time
from datetime import datetime,timezone
from pathlib import Path

js=("import {ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_REVIEW_SQL as a,"
 "ESSENTIALS_PRIVATE_INSERT_CUSTOMER_ACCEPTANCE_SQL as b,"
 "ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_ACCEPTANCE_SQL as c,"
 "ESSENTIALS_PRIVATE_READ_CUSTOMER_ACCEPTANCE_SQL as d}"
 "from './server/essentials-private-consolidated-customer-consent.mjs';"
 "console.log(JSON.stringify([a,b,c,d]))")
CONSUME,INSERT,ASSERT,READ=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",js],text=True))
assert [s.count("?") for s in [CONSUME,INSERT,ASSERT,READ]]==[12,23,6,2]
schemas=[
 "essentials_private_consent_authority_STAGING_CANDIDATE.sql",
 "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
 "essentials_private_verified_customer_sessions_STAGING_CANDIDATE.sql",
 "essentials_private_frozen_terms_customer_review_STAGING_CANDIDATE.sql",
 "essentials_private_customer_final_consent_STAGING_CANDIDATE.sql",
]
AT=int(time.time()*1000)
STAMP=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
SH="a"*64;CSRF="b"*64;SUB="c"*64;QBYTES=b"Q-101 frozen synthetic quote BWP100"
TBYTES=b"Complete accepted contract terms refunds, cancellations, delivery"
QH=hashlib.sha256(QBYTES).hexdigest();TH=hashlib.sha256(TBYTES).hexdigest()
PROOF="d"*64;CONSENT_HASH="e"*64;SIG="f"*64
PAYLOAD=b'{"schema":"synthetic-server-signed-customer-consent","decision":"accept"}'
def setup(*,quote_revoked=False,link_revoked=False,session_revoked=False,
          offer_revoked=False,link_expired=False,session_expired=False,
          offer_expired=False):
 db=sqlite3.connect(":memory:",isolation_level=None)
 db.execute("PRAGMA foreign_keys=ON")
 for name in schemas:
  db.executescript(Path("cloudflare/migrations",name).read_text())
 db.execute("""INSERT INTO essentials_private_frozen_quotes
  (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
  total_minor,quotation_sha256,immutable_quotation_bytes,
  frozen_by_actor_user_id,frozen_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)""",
  ("tenantA","quoteA","customerA","Q-101",2,10000,QH,QBYTES,"actorA",STAMP))
 db.execute("""INSERT INTO essentials_private_frozen_quote_terms
  (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
  total_minor,quotation_sha256,terms_sha256,immutable_terms_bytes,frozen_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)""",
  ("tenantA","quoteA","customerA","Q-101",2,10000,QH,TH,TBYTES,STAMP))
 db.execute("""INSERT INTO essentials_private_frozen_quote_terms_audit
  (tenant_id,quotation_id,quotation_sha256,terms_sha256,frozen_at)
  VALUES(?,?,?,?,?)""",("tenantA","quoteA",QH,TH,STAMP))
 db.execute("""INSERT INTO essentials_private_customer_identity_links
  (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,consent_subject_id,
  provisioned_by_actor_user_id,proof_reference_sha256,
  proof_verified_at_ms,expires_at_ms)
  VALUES(?,?,?,?,?,?,?,?,?,?)""",
  ("linkA","https://idp.example.test",SUB,"tenantA","customerA","consentA",
  "actorA","1"*64,AT-10000,AT-1 if link_expired else AT+240000))
 db.execute("""INSERT INTO essentials_private_customer_consent_invitations
 (invitation_id,tenant_id,customer_id,quotation_id,nonce_sha256,
 issued_at_ms,expires_at_ms,state,consumed_at_ms)
 VALUES (?,?,?,?,?,?,?,'consumed',?)""",
 ("inviteA","tenantA","customerA","quoteA","2"*64,AT-2000,
  AT+240000,AT-1000))
 db.execute("""INSERT INTO essentials_private_customer_consent_sessions
 (session_key_sha256,csrf_sha256,invitation_id,tenant_id,customer_id,quotation_id,
 customer_identity_link_id,consent_subject_id,identity_subject_hmac_sha256,
 nonce_sha256,issued_at_ms,expires_at_ms)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
 (SH,CSRF,"inviteA","tenantA","customerA","quoteA","linkA",
  "consentA",SUB,"2"*64,AT-1000,AT-1 if session_expired else AT+120000))
 db.execute("""INSERT INTO essentials_private_customer_quote_review_offers
 (presentation_id,session_key_sha256,customer_identity_link_id,tenant_id,
 customer_id,quotation_id,quotation_sha256,terms_sha256,
 acceptance_version,total_minor,issued_at_ms,expires_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
 ("offerA",SH,"linkA","tenantA","customerA","quoteA",
 QH,TH,2,10000,AT-1000,AT-1 if offer_expired else AT+60000))
 if quote_revoked:
  db.execute("UPDATE essentials_private_frozen_quotes SET state='revoked'")
 if link_revoked:
  db.execute("""UPDATE essentials_private_customer_identity_links
   SET state='revoked',revoked_at_ms=?""",(AT,))
 if session_revoked:
  db.execute("""UPDATE essentials_private_customer_consent_sessions
   SET state='revoked',revoked_at_ms=?""",(AT,))
 if offer_revoked:
  db.execute("""UPDATE essentials_private_customer_quote_review_offers
   SET state='revoked',used_at_ms=?""",(AT,))
 return db

def count(db):
 return (
 db.execute("""SELECT COUNT(*) FROM essentials_private_customer_quote_review_offers
 WHERE state='consumed'""").fetchone()[0],
 db.execute("SELECT COUNT(*) FROM essentials_private_customer_verified_acceptances").fetchone()[0],
 db.execute("SELECT COUNT(*) FROM essentials_private_customer_acceptance_audit").fetchone()[0]
 )
def execute(db,*,presentation="offerA",session=SH,tenant="tenantA",
            customer="customerA",quotation="quoteA",quote_hash=QH,terms_hash=TH,
            version=2,total=10000,issuer="https://idp.example.test",
            subject="consentA",subject_hash=SUB,skip_insert=False):
 db.execute("BEGIN")
 try:
  x=db.execute(CONSUME,(AT,presentation,session,tenant,customer,quotation,
   quote_hash,terms_hash,version,total,AT,AT)).rowcount
  y=0
  if not skip_insert:
   y=db.execute(INSERT,(PROOF,CONSENT_HASH,PAYLOAD,SIG,AT,
    presentation,session,tenant,customer,quotation,
    "linkA",quote_hash,terms_hash,version,total,AT,AT,AT,
    subject,subject_hash,AT,issuer,AT)).rowcount
  z=db.execute(ASSERT,(tenant,quotation,presentation,session,CONSENT_HASH,AT)).rowcount
  db.commit()
  return True,(x,y,z)
 except sqlite3.Error:
  db.rollback()
  return False,None
def must_fail(f,message):
 try:f()
 except sqlite3.Error:return
 raise AssertionError(message)

good=setup()
ok,changed=execute(good)
assert ok and changed==(1,1,1),changed
assert count(good)==(1,1,1)
row=good.execute(READ,("tenantA","quoteA")).fetchone()
assert row and row[0:4]==("tenantA","quoteA","customerA","offerA")
assert row[9]==QH and row[10]==TH and row[13]==PROOF
assert row[14]==CONSENT_HASH and row[15]==PAYLOAD and row[16]==SIG
assert row[18]=="accepted"
assert not execute(good)[0],"replayed an already consumed offer"
assert count(good)==(1,1,1)
must_fail(lambda:good.execute("DELETE FROM essentials_private_customer_verified_acceptances"),
 "deleted historical customer evidence")
must_fail(lambda:good.execute("""UPDATE essentials_private_customer_verified_acceptances
 SET terms_sha256=?""",("0"*64,)),"altered full terms")
must_fail(lambda:good.execute("DELETE FROM essentials_private_customer_acceptance_audit"),
 "deleted immutable acceptance assertion")
must_fail(lambda:good.execute("""UPDATE essentials_private_customer_quote_review_offers
 SET state='offered',used_at_ms=NULL"""),"resurrected reviewed offer")
# Historical consent remains as evidence even if account is later revoked;
# future new consents must fail against current session/account authority.
good.execute("""UPDATE essentials_private_customer_identity_links
 SET state='revoked',revoked_at_ms=?""",(AT,))
assert good.execute(READ,("tenantA","quoteA")).fetchone() is not None

for reason,opts in [
 ("revoked current quotation",{"quote_revoked":True}),
 ("revoked identity link",{"link_revoked":True}),
 ("expired identity link",{"link_expired":True}),
 ("revoked customer session",{"session_revoked":True}),
 ("expired customer session",{"session_expired":True}),
 ("revoked offer",{"offer_revoked":True}),
 ("expired offer",{"offer_expired":True})
]:
 db=setup(**opts)
 assert not execute(db)[0],reason
 assert count(db)==(0,0,0),(reason,count(db))
for reason,changes in [
 ("wrong presentation",{"presentation":"offerB"}),
 ("wrong customer cookie",{"session":"3"*64}),
 ("cross-tenant",{"tenant":"tenantB"}),
 ("cross-customer",{"customer":"customerB"}),
 ("cross-quotation",{"quotation":"quoteB"}),
 ("wrong quote hash",{"quote_hash":"4"*64}),
 ("altered contract terms",{"terms_hash":"5"*64}),
 ("wrong amount",{"total":11000}),
 ("wrong contract version",{"version":3}),
 ("wrong IdP issuer",{"issuer":"https://fake.example.test"}),
 ("wrong verified customer subject",{"subject":"other"}),
 ("wrong verified identity HMAC",{"subject_hash":"6"*64}),
 ("omitted acceptance INSERT",{"skip_insert":True})
]:
 db=setup();assert not execute(db,**changes)[0],reason
 assert count(db)==(0,0,0),(reason,count(db))
 assert db.execute("""SELECT state FROM
 essentials_private_customer_quote_review_offers""").fetchone()[0]=="offered"
print("PASS: actual consolidated JS SQL: verified outside-customer consent, review consumption and immutable audit commit together; replay, missing inserts, changed terms, wrong tenant/actor/session/issuer, revoked sources all rollback")
