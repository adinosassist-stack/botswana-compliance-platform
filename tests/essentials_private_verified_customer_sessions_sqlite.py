"""OFFLINE ONLY: execute actual JS verified customer session SQL against
source-only SQLite schemas. No real IdP, customers, Cloudflare or deployment.
"""
import hashlib,json,sqlite3,subprocess,time
from datetime import datetime,timezone
from pathlib import Path
js=("import {ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_INVITE_SQL as a,"
 "ESSENTIALS_PRIVATE_CREATE_CUSTOMER_SESSION_SQL as b,"
 "ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_SESSION_SQL as c,"
 "ESSENTIALS_PRIVATE_READ_CUSTOMER_SESSION_SQL as d,"
 "ESSENTIALS_PRIVATE_REVOKE_CUSTOMER_SESSION_SQL as e}"
 "from './server/essentials-private-verified-customer-session.mjs';"
 "console.log(JSON.stringify([a,b,c,d,e]))")
INVITE,SESSION,ASSERT,READ,REVOKE=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",js],text=True))
assert [x.count("?") for x in [INVITE,SESSION,ASSERT,READ,REVOKE]]==[7,22,6,3,5]
NOW=int(time.time()*1000)
STAMP=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
S="a"*64;CSRF="b"*64;TAG="c"*64;NONCE_HASH="d"*64
ISSUER="https://identity.private.example.test"
QBYTES=b"synthetic frozen external customer quote"
QHASH=hashlib.sha256(QBYTES).hexdigest()
SRC=[
 "essentials_private_customer_only_baseline_STAGING_CANDIDATE.sql",
 "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
 "essentials_private_verified_customer_sessions_STAGING_CANDIDATE.sql",
]
def setup(*,link_revoked=False,quote_revoked=False,invitation_revoked=False,
          invite_expired=False,link_expired=False):
 db=sqlite3.connect(":memory:",isolation_level=None)
 db.execute("PRAGMA foreign_keys=ON")
 for schema in SRC:
  db.executescript(Path("cloudflare/migrations",schema).read_text())
 db.execute("""INSERT INTO essentials_private_frozen_quotes
 (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,immutable_quotation_bytes,
 frozen_by_actor_user_id,frozen_at)
 VALUES (?,?,?,?,?,?,?,?,?,?)""",
 ("tenantA","quoteA","customerA","Q-101",2,10000,
  QHASH,QBYTES,"actorA",STAMP))
 db.execute("""INSERT INTO essentials_private_customer_identity_links
 (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,
  consent_subject_id,provisioned_by_actor_user_id,proof_reference_sha256,
  proof_verified_at_ms,expires_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?)""",
 ("linkA",ISSUER,TAG,"tenantA","customerA","consentA","actorA",
  "e"*64,NOW-30000,NOW-1 if link_expired else NOW+240000))
 db.execute("""INSERT INTO essentials_private_customer_consent_invitations
 (invitation_id,tenant_id,customer_id,quotation_id,nonce_sha256,
 issued_at_ms,expires_at_ms)
 VALUES (?,?,?,?,?,?,?)""",
 ("inviteA","tenantA","customerA","quoteA",NONCE_HASH,
  NOW-1000,NOW-1 if invite_expired else NOW+180000))
 if link_revoked:
  db.execute("""UPDATE essentials_private_customer_identity_links
   SET state='revoked',revoked_at_ms=? WHERE link_id='linkA'""",(NOW,))
 if invitation_revoked:
  db.execute("""UPDATE essentials_private_customer_consent_invitations
   SET state='revoked',revoked_at_ms=? WHERE invitation_id='inviteA'""",(NOW,))
 if quote_revoked:
  db.execute("""UPDATE essentials_private_frozen_quotes
   SET state='revoked' WHERE quotation_id='quoteA'""")
 return db
def counts(db):
 return (
  db.execute("""SELECT COUNT(*) FROM essentials_private_customer_consent_invitations
   WHERE state='consumed'""").fetchone()[0],
  db.execute("SELECT COUNT(*) FROM essentials_private_customer_consent_sessions").fetchone()[0],
  db.execute("SELECT COUNT(*) FROM essentials_private_customer_session_issuance_audit").fetchone()[0]
 )
def mint(db,*,tenant="tenantA",customer="customerA",quote="quoteA",
         nonce=NONCE_HASH,tag=TAG,link="linkA",subject="consentA",
         session=S,skip_insert=False,expiry=None):
 until=expiry or NOW+120000
 db.execute("BEGIN")
 try:
  a=db.execute(INVITE,(NOW,"inviteA",tenant,customer,quote,nonce,until)).rowcount
  b=0
  if not skip_insert:
   b=db.execute(SESSION,(session,CSRF,"inviteA",tenant,customer,quote,
    tag,nonce,NOW,until,"inviteA",tenant,customer,quote,nonce,NOW,
    until,until,ISSUER,tag,link,subject)).rowcount
  c=db.execute(ASSERT,("inviteA",session,tenant,customer,quote,NOW)).rowcount
  db.commit()
  return True,(a,b,c)
 except sqlite3.Error:
  db.rollback()
  return False,None
def read(db,session=S,now=NOW):
 return db.execute(READ,(session,ISSUER,now)).fetchone()
def must_fail(fn,reason):
 try:fn()
 except sqlite3.Error:return
 raise AssertionError(reason)

good=setup()
ok,result=mint(good)
assert ok and result==(1,1,1),(ok,result)
assert counts(good)==(1,1,1)
row=read(good)
assert row and row[0]==S and row[1]==CSRF
assert row[2:7]==("tenantA","customerA","quoteA","inviteA","linkA")
assert row[-1]=="active"
assert read(good,session="f"*64) is None
assert read(good,now=NOW+121000) is None
assert not mint(good)[0],"replayed an invitation"
assert counts(good)==(1,1,1)
must_fail(lambda:good.execute("""DELETE FROM essentials_private_customer_consent_invitations"""),
 "deleted consumed invite")
must_fail(lambda:good.execute("""UPDATE essentials_private_customer_consent_sessions
  SET customer_id='other'"""),"tampered current customer session")
must_fail(lambda:good.execute("""DELETE FROM essentials_private_customer_session_issuance_audit"""),
 "deleted session assertion")

# A fake successful invitation UPDATE or zero-row session INSERT MUST
# fail the third assertion, rolling back to PENDING invitation.
cases=[
 ("revoked customer link",{"link_revoked":True},{}),
 ("expired customer link",{"link_expired":True},{}),
 ("revoked frozen quote",{"quote_revoked":True},{}),
 ("revoked invitation",{"invitation_revoked":True},{}),
 ("expired invitation",{"invite_expired":True},{}),
 ("wrong tenant",{},{"tenant":"tenantB"}),
 ("wrong customer",{},{"customer":"customerB"}),
 ("wrong quotation",{},{"quote":"quoteB"}),
 ("wrong nonce",{},{"nonce":"f"*64}),
 ("wrong HMAC subject",{},{"tag":"a"*64}),
 ("wrong link",{},{"link":"badLink"}),
 ("wrong consent subject",{},{"subject":"notConsent"}),
 ("missing session INSERT",{},{"skip_insert":True}),
 ("expiry longer than invitation",{},{"expiry":NOW+250000}),
]
for name,options,patch in cases:
 db=setup(**options)
 assert not mint(db,**patch)[0],name
 assert counts(db)==(0,0,0),(name,counts(db))
 assert db.execute("""SELECT state FROM
  essentials_private_customer_consent_invitations""").fetchone()[0] in ("pending","revoked")

# After issuance, independent link/quote revocation must invalidate reads.
for name,sql,params in [
 ("customer link revoked","UPDATE essentials_private_customer_identity_links "
  "SET state='revoked',revoked_at_ms=? WHERE link_id='linkA'",(NOW,)),
 ("frozen quote revoked","UPDATE essentials_private_frozen_quotes "
  "SET state='revoked' WHERE quotation_id='quoteA'",())
]:
 db=setup();assert mint(db)[0]
 db.execute(sql,params)
 assert read(db) is None,name
 assert counts(db)==(1,1,1)
db=setup();assert mint(db)[0]
assert db.execute(REVOKE,(NOW,S,"tenantB","customerA","quoteA")).fetchone() is None
assert read(db) is not None
assert db.execute(REVOKE,(NOW,S,"tenantA","customerA","quoteA")).fetchone()==(S,)
assert read(db) is None
must_fail(lambda:db.execute("""UPDATE essentials_private_customer_consent_sessions
 SET state='active',revoked_at_ms=NULL"""),"resurrected customer session")

print("PASS: real D1 candidate SQL issues signed-IdP customer session only with live invitation+verified link+quote, atomically rolls back missing joins, denies replay and revocation")
