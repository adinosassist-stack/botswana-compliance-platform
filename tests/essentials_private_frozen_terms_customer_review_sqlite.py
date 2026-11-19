"""Source-only OFFLINE SQLite proof of atomic quote+full-terms freeze and
session-bound review offer. Executes actual exported JavaScript SQL with
synthetic values. No D1, IdP, customer, Finance or production connection.
"""
import hashlib,json,sqlite3,subprocess,time
from datetime import datetime,timezone
from pathlib import Path

JS=("import {ESSENTIALS_PRIVATE_FREEZE_QUOTE_WITH_TERMS_SQL as a,"
 "ESSENTIALS_PRIVATE_BIND_IMMUTABLE_TERMS_SQL as b,"
 "ESSENTIALS_PRIVATE_ASSERT_FROZEN_TERMS_SQL as c,"
 "ESSENTIALS_PRIVATE_READ_CUSTOMER_FROZEN_TERMS_SQL as d,"
 "ESSENTIALS_PRIVATE_INSERT_CUSTOMER_REVIEW_OFFER_SQL as e,"
 "ESSENTIALS_PRIVATE_READ_CUSTOMER_REVIEW_OFFER_SQL as f}"
 "from './server/essentials-private-frozen-terms-review-store.mjs';"
 "console.log(JSON.stringify([a,b,c,d,e,f]))")
FREEZE,TERMS,ASSERT,READ,INSERT_OFFER,READ_OFFER=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",JS],text=True))
assert [x.count("?") for x in [FREEZE,TERMS,ASSERT,READ,INSERT_OFFER,READ_OFFER]]==[10,10,5,3,12,7]
schemas=[
 "essentials_private_customer_only_baseline_STAGING_CANDIDATE.sql",
 "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
 "essentials_private_verified_customer_sessions_STAGING_CANDIDATE.sql",
 "essentials_private_frozen_terms_customer_review_STAGING_CANDIDATE.sql",
]
AT=int(time.time()*1000)
stamp=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
S="a"*64
QBYTES=b"Q-101 immutable quoted service and BWP100.00"
TBYTES=b"Complete immutable customer terms: refunds, cancellation, timeframe"
QH=hashlib.sha256(QBYTES).hexdigest()
TH=hashlib.sha256(TBYTES).hexdigest()
HMAC="b"*64
def setup():
 db=sqlite3.connect(":memory:",isolation_level=None)
 db.execute("PRAGMA foreign_keys=ON")
 for schema in schemas:
  db.executescript(Path("cloudflare/migrations",schema).read_text())
 return db

def counts(db):
 return (
  db.execute("SELECT COUNT(*) FROM essentials_private_frozen_quotes").fetchone()[0],
  db.execute("SELECT COUNT(*) FROM essentials_private_frozen_quote_terms").fetchone()[0],
  db.execute("SELECT COUNT(*) FROM essentials_private_frozen_quote_terms_audit").fetchone()[0]
 )
def freeze(db,*,customer="customerA",terms_hash=TH,skip_terms=False,
           reference="Q-101",quotation="quoteA"):
 db.execute("BEGIN")
 try:
  db.execute(FREEZE,("tenantA",quotation,customer,reference,2,10000,
    QH,QBYTES,"actorA",stamp))
  if not skip_terms:
   db.execute(TERMS,(terms_hash,TBYTES,"tenantA",quotation,customer,
    reference,2,10000,QH,stamp))
  db.execute(ASSERT,("tenantA",quotation,QH,TH,stamp))
  db.commit()
  return True
 except sqlite3.Error:
  db.rollback()
  return False

def read(db,customer="customerA",quotation="quoteA"):
 return db.execute(READ,("tenantA",customer,quotation)).fetchone()

def must_fail(fn,reason):
 try:fn()
 except sqlite3.Error:return
 raise AssertionError(reason)

# Bad terms, omitted terms, and duplicate quote must never commit a bare
# frozen quotation, even when an INSERT SELECT quietly wrote ZERO rows.
for reason,opts in [
 ("omitted terms",{"skip_terms":True}),
 ("wrong digest",{"terms_hash":"f"*64})
]:
 d=setup()
 assert not freeze(d,**opts),reason
 assert counts(d)==(0,0,0),(reason,counts(d))
bare=setup()
bare.execute(FREEZE,("tenantA","quoteA","customerA","Q-101",2,10000,
  QH,QBYTES,"actorA",stamp))
assert read(bare) is None,"bare quote without reviewed contract unexpectedly visible"

d=setup()
assert freeze(d) and counts(d)==(1,1,1)
row=read(d)
assert row and row[0:3]==("tenantA","quoteA","customerA")
assert row[6]==QH and row[7]==QBYTES
assert row[8]==TH and row[9]==TBYTES
assert read(d,customer="other") is None
assert not freeze(d),"duplicate/modified frozen terms accepted"
assert counts(d)==(1,1,1)
must_fail(lambda:d.execute("""UPDATE essentials_private_frozen_quote_terms
 SET immutable_terms_bytes=x'AA'"""),"mutated full contract terms")
must_fail(lambda:d.execute("DELETE FROM essentials_private_frozen_quote_terms"),
 "deleted original contractual terms")
must_fail(lambda:d.execute("""UPDATE essentials_private_frozen_quote_terms_audit
 SET terms_sha256=?""",("f"*64,)),"changed freeze assertion")
must_fail(lambda:d.execute("DELETE FROM essentials_private_frozen_quote_terms_audit"),
 "deleted freeze audit")

def seed_customer_session(db):
 db.execute("""INSERT INTO essentials_private_customer_identity_links
  (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,
   consent_subject_id,provisioned_by_actor_user_id,proof_reference_sha256,
   proof_verified_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?)""",
  ("linkA","https://idp.example.test",HMAC,"tenantA","customerA",
   "consentA","actorA","c"*64,AT-10000,AT+240000))
 db.execute("""INSERT INTO essentials_private_customer_consent_invitations
  (invitation_id,tenant_id,customer_id,quotation_id,nonce_sha256,
   issued_at_ms,expires_at_ms,state,consumed_at_ms)
  VALUES (?,?,?,?,?,?,?,'consumed',?)""",
  ("inviteA","tenantA","customerA","quoteA","d"*64,AT-2000,AT+240000,
   AT-1000))
 db.execute("""INSERT INTO essentials_private_customer_consent_sessions
  (session_key_sha256,csrf_sha256,invitation_id,tenant_id,customer_id,
   quotation_id,customer_identity_link_id,consent_subject_id,
   identity_subject_hmac_sha256,nonce_sha256,issued_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
  (S,"e"*64,"inviteA","tenantA","customerA","quoteA",
   "linkA","consentA",HMAC,"d"*64,AT-1000,AT+120000))

def offer(db,*,session=S,tenant="tenantA",customer="customerA",
          quotation="quoteA",terms_hash=TH,quote_hash=QH,
          version=2,total=10000,presentation="offerA",
          expires_at=AT+60000):
 return db.execute(INSERT_OFFER,(presentation,AT-1000,expires_at,
  session,tenant,customer,quotation,expires_at,
  quote_hash,terms_hash,version,total)).rowcount

def get_offer(db,*,presentation="offerA",session=S,tenant="tenantA",
              customer="customerA",quotation="quoteA"):
 return db.execute(READ_OFFER,(presentation,session,tenant,customer,
   quotation,AT,AT)).fetchone()

seed_customer_session(d)
assert offer(d)==1
offered=get_offer(d)
assert offered and offered[0:5]==("offerA",S,"tenantA","customerA","quoteA")
assert offered[5]==QH and offered[6]==TH
assert offered[-1]=="offered"
assert get_offer(d,session="f"*64) is None
assert get_offer(d,customer="customerB") is None
assert get_offer(d,presentation="other") is None
must_fail(lambda:offer(d),"replayed presentation ID")
must_fail(lambda:d.execute("""UPDATE essentials_private_customer_quote_review_offers
 SET terms_sha256=?""",("f"*64,)),"mutated offered terms")
must_fail(lambda:d.execute("DELETE FROM essentials_private_customer_quote_review_offers"),
 "deleted review evidence")
assert d.execute("""UPDATE essentials_private_customer_quote_review_offers
 SET state='consumed',used_at_ms=? WHERE presentation_id='offerA'""",(AT,)).rowcount==1
assert get_offer(d) is None
must_fail(lambda:d.execute("""UPDATE essentials_private_customer_quote_review_offers
 SET state='offered',used_at_ms=NULL"""),"replayed a consumed presentation")

for reason,change in [
 ("wrong customer",{"customer":"customerB"}),
 ("wrong tenant",{"tenant":"tenantB"}),
 ("wrong session",{"session":"f"*64}),
 ("wrong quotation",{"quotation":"quoteB"}),
 ("wrong quote digest",{"quote_hash":"f"*64}),
 ("wrong terms digest",{"terms_hash":"f"*64}),
 ("wrong version",{"version":3}),
 ("wrong BWP total",{"total":123})
]:
 db=setup();assert freeze(db)
 seed_customer_session(db)
 assert offer(db,**change)==0,reason
 assert get_offer(db) is None,reason

for reason,table,sql,values in [
 ("customer identity link revoked","links",
  "UPDATE essentials_private_customer_identity_links SET state='revoked',revoked_at_ms=? WHERE link_id='linkA'",(AT,)),
 ("customer session revoked","sessions",
  "UPDATE essentials_private_customer_consent_sessions SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?",(AT,S)),
 ("quotation revoked","quotes",
  "UPDATE essentials_private_frozen_quotes SET state='revoked' WHERE quotation_id='quoteA'",())
]:
 db=setup();assert freeze(db)
 seed_customer_session(db)
 assert offer(db)==1,reason
 db.execute(sql,values)
 assert get_offer(db) is None,reason
 assert offer(db,presentation="offerB")==0,reason

print("PASS: actual D1 candidate SQL atomically freezes quote+FULL immutable terms, denies bare quotes, verifies session-bound review and rejects replay, mismatch and revoked sources")
