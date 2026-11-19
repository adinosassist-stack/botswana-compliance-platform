"""IN MEMORY ONLY: exercise exact JavaScript SQL for external customer
invitation issuance, OIDC start and one-time callback with full immutable
quotation/terms and current identity link. No Cloudflare, real IdP or users.
"""
import hashlib,json,sqlite3,subprocess,time
from datetime import datetime,timezone
from pathlib import Path

js=("import {ESSENTIALS_PRIVATE_ISSUE_CUSTOMER_INVITE_SQL as a,"
 "ESSENTIALS_PRIVATE_SAVE_CUSTOMER_INVITE_LAUNCH_SQL as b,"
 "ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_INVITE_ISSUE_SQL as c,"
 "ESSENTIALS_PRIVATE_READ_CUSTOMER_INVITE_LAUNCH_SQL as d,"
 "ESSENTIALS_PRIVATE_START_CUSTOMER_INVITE_SQL as e,"
 "ESSENTIALS_PRIVATE_SAVE_CUSTOMER_OIDC_ATTEMPT_SQL as f,"
 "ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_OIDC_START_SQL as g,"
 "ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_OIDC_ATTEMPT_SQL as h}"
 "from './server/essentials-private-customer-invitation-oidc-journey.mjs';"
 "console.log(JSON.stringify([a,b,c,d,e,f,g,h]))")
ISSUE,LAUNCH,ISSUE_AUDIT,READ,START,SAVE,START_AUDIT,CONSUME=json.loads(
 subprocess.check_output(["node","--input-type=module","-e",js],text=True))
assert [x.count("?") for x in [
 ISSUE,LAUNCH,ISSUE_AUDIT,READ,START,SAVE,START_AUDIT,CONSUME
]]==[7,7,2,2,4,10,3,5]
schemas=[
 "essentials_private_customer_only_baseline_STAGING_CANDIDATE.sql",
 "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
 "essentials_private_verified_customer_sessions_STAGING_CANDIDATE.sql",
 "essentials_private_frozen_terms_customer_review_STAGING_CANDIDATE.sql",
 "essentials_private_customer_invite_oidc_STAGING_CANDIDATE.sql",
]
AT=int(time.time()*1000)
STAMP=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
QB=b"Synthetic accepted quotation, BWP 100"
TB=b"Full contractual terms refund, cancellation, delivery, owner signed"
QH=hashlib.sha256(QB).hexdigest()
TH=hashlib.sha256(TB).hexdigest()
TICKET="a"*64;NONCE="b"*64;STATE="c"*64;COOKIE="d"*64
IV1=bytes(range(12));IV2=bytes(range(12,24))
CIPHER=b"synthetic-AESGCM-nonce-ciphertext-and-tag"
VERIFIER=b"synthetic-AESGCM-verifier-ciphertext-and-tag"

def make(*,link_revoked=False,quote_revoked=False):
 db=sqlite3.connect(":memory:",isolation_level=None)
 db.execute("PRAGMA foreign_keys=ON")
 for path in schemas:
  db.executescript(Path("cloudflare/migrations",path).read_text())
 db.execute("""INSERT INTO essentials_private_frozen_quotes(
 tenant_id,quotation_id,customer_id,quotation_reference,
 acceptance_version,total_minor,quotation_sha256,immutable_quotation_bytes,
 frozen_by_actor_user_id,frozen_at) VALUES(?,?,?,?,?,?,?,?,?,?)""",
 ("tenantA","quoteA","customerA","Q-101",2,10000,QH,QB,"actorA",STAMP))
 db.execute("""INSERT INTO essentials_private_frozen_quote_terms(
 tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,terms_sha256,immutable_terms_bytes,frozen_at)
 VALUES(?,?,?,?,?,?,?,?,?,?)""",
 ("tenantA","quoteA","customerA","Q-101",2,10000,QH,TH,TB,STAMP))
 db.execute("""INSERT INTO essentials_private_frozen_quote_terms_audit(
 tenant_id,quotation_id,quotation_sha256,terms_sha256,frozen_at)
 VALUES(?,?,?,?,?)""",("tenantA","quoteA",QH,TH,STAMP))
 db.execute("""INSERT INTO essentials_private_customer_identity_links(
 link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,consent_subject_id,
 provisioned_by_actor_user_id,proof_reference_sha256,
 proof_verified_at_ms,expires_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?)""",
 ("linkA","https://idp.private.test","f"*64,"tenantA",
  "customerA","subjectA","actorA","e"*64,AT-10000,AT+240000))
 if link_revoked:
  db.execute("""UPDATE essentials_private_customer_identity_links
  SET state='revoked',revoked_at_ms=?""",(AT,))
 if quote_revoked:
  db.execute("UPDATE essentials_private_frozen_quotes SET state='revoked'")
 return db

def counts(db):
 return [db.execute("SELECT count(*) FROM "+table).fetchone()[0]
  for table in [
   "essentials_private_customer_consent_invitations",
   "essentials_private_customer_invitation_launches",
   "essentials_private_customer_invite_issue_audit",
   "essentials_private_customer_oidc_logins",
   "essentials_private_customer_oidc_start_audit"]]
def issue(db,*,customer="customerA",link="linkA",
          invitation="inviteA",expires=AT+120000,
          nonce_hash=NONCE,ticket_hash=TICKET):
 db.execute("BEGIN")
 try:
  a=db.execute(ISSUE,(invitation,"tenantA",customer,"quoteA",
   nonce_hash,AT-1000,expires)).rowcount
  b=db.execute(LAUNCH,(invitation,link,ticket_hash,IV1,
   CIPHER,AT-1000,expires)).rowcount
  c=db.execute(ISSUE_AUDIT,(invitation,AT-1000)).rowcount
  db.commit()
  return True,(a,b,c)
 except sqlite3.Error:
  db.rollback()
  return False,None

def start(db,*,ticket=TICKET,invitation="inviteA",
          skip_attempt=False,attempt="attemptA"):
 db.execute("BEGIN")
 try:
  a=db.execute(START,(AT,invitation,ticket,AT+60000)).rowcount
  b=0
  if not skip_attempt:
   b=db.execute(SAVE,(attempt,STATE,COOKIE,IV2,VERIFIER,
    AT,AT+60000,invitation,AT,AT+60000)).rowcount
  c=db.execute(START_AUDIT,(invitation,attempt,AT)).rowcount
  db.commit()
  return True,(a,b,c)
 except sqlite3.Error:
  db.rollback()
  return False,None

def consume(db,*,state=STATE,cookie=COOKIE,when=AT):
 return db.execute(CONSUME,(when,state,cookie,when,when)).fetchone()

good=make()
assert issue(good)==(True,(1,1,1))
assert counts(good)==[1,1,1,0,0]
row=good.execute(READ,("inviteA","issued")).fetchone()
assert row and row[0]=="inviteA" and row[2]==TICKET
assert row[3]==IV1 and row[4]==CIPHER and row[11]==NONCE
assert start(good)==(True,(1,1,1))
assert counts(good)==[1,1,1,1,1]
assert good.execute(READ,("inviteA","issued")).fetchone() is None
assert not start(good)[0],"restarted consumed invitation"
assert counts(good)==[1,1,1,1,1]
r=consume(good)
assert r and r[0]=="attemptA" and r[1]=="inviteA"
assert r[2]==STATE and r[3]==COOKIE and r[-1]=="consumed"
assert consume(good) is None,"replayed callback"
assert consume(good,state="0"*64) is None
assert consume(good,cookie="0"*64) is None
assert counts(good)==[1,1,1,1,1]

for reason,options,change in [
 ("revoked account link",{"link_revoked":True},{}),
 ("revoked accepted quote",{"quote_revoked":True},{}),
 ("wrong customer",{},{"customer":"customerB"}),
 ("wrong identity link",{},{"link":"other"}),
 ("expired invitation",{},{"expires":AT-1})
]:
 db=make(**options)
 assert not issue(db,**change)[0],reason
 assert counts(db)==[0,0,0,0,0],reason

for reason,change in [
 ("wrong hashed ticket",{"ticket":"0"*64}),
 ("wrong invitation",{"invitation":"other"}),
 ("missing OIDC attempt",{"skip_attempt":True})
]:
 db=make();assert issue(db)[0]
 assert not start(db,**change)[0],reason
 assert counts(db)==[1,1,1,0,0],(reason,counts(db))
 assert db.execute(READ,("inviteA","issued")).fetchone() is not None

db=make();assert issue(db)[0]
db.execute("""UPDATE essentials_private_customer_identity_links
 SET state='revoked',revoked_at_ms=?""",(AT,))
assert not start(db)[0]
assert counts(db)==[1,1,1,0,0]

def must_fail(fn,reason):
 try:fn()
 except sqlite3.Error:return
 raise AssertionError(reason)
must_fail(lambda:good.execute("""UPDATE essentials_private_customer_invitation_launches
 SET ticket_sha256=?""",("0"*64,)),"mutated invite proof")
must_fail(lambda:good.execute("DELETE FROM essentials_private_customer_oidc_logins"),
 "deleted OIDC replay tombstone")
must_fail(lambda:good.execute("""UPDATE essentials_private_customer_oidc_logins
 SET state='pending',consumed_at_ms=NULL"""),"replayed consumed OIDC state")
must_fail(lambda:good.execute("DELETE FROM essentials_private_customer_oidc_start_audit"),
 "deleted OIDC start audit")

print("PASS: actual customer invitation + PKCE SQL creates atomic invite, one-use proof, one-time state/cookie callback and audit; invalid and absent writes rollback")
