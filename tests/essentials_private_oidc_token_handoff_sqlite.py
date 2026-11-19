"""Execute exact JS OIDC handoff SQL on synthetic in-memory SQLite.
No Cloudflare access, live IdP, customer data or production operations.
"""
import hashlib
import json
import sqlite3
import subprocess
import time
from datetime import datetime,timezone
from pathlib import Path

source=("import {ESSENTIALS_PRIVATE_SAVE_OIDC_HANDOFF_SQL as a,"
        "ESSENTIALS_PRIVATE_CONSUME_OIDC_HANDOFF_SQL as b}"
        "from './server/essentials-private-oidc-server-handoff.mjs';"
        "console.log(JSON.stringify([a,b]))")
SAVE, CONSUME=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",source],text=True))
assert SAVE.count("?")==13 and CONSUME.count("?")==9
BASE=[
 "essentials_private_consent_authority_STAGING_CANDIDATE.sql",
 "essentials_private_one_time_consent_STAGING_CANDIDATE.sql",
 "essentials_private_consent_actor_sessions_STAGING_CANDIDATE.sql",
 "essentials_private_session_quotation_challenges_STAGING_CANDIDATE.sql",
 "essentials_private_oidc_token_handoff_STAGING_CANDIDATE.sql",
]
NOW=int(time.time()*1000)
STAMP=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
SH="a"*64;H="b"*64;N="c"*64
QUOTE_BYTES=b"synthetic frozen customer quotation"
QH=hashlib.sha256(QUOTE_BYTES).hexdigest()
IV=bytes(range(12))
ENCRYPTED=b"synthetic-encrypted-identity-token-data-and-tag"
def make(*,revoke_session=False,revoke_quote=False,revoke_challenge=False):
 db=sqlite3.connect(":memory:")
 db.execute("PRAGMA foreign_keys=ON")
 for name in BASE:db.executescript(Path("cloudflare/migrations",name).read_text())
 db.execute("""INSERT INTO essentials_private_frozen_quotes
  (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
  total_minor,quotation_sha256,immutable_quotation_bytes,frozen_by_actor_user_id,frozen_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)""",
  ("tenantA","quoteA","customerA","Q-101",2,10000,QH,
    QUOTE_BYTES,"actorA",STAMP))
 db.execute("""INSERT INTO essentials_private_consent_actor_sessions
  (session_key_sha256,csrf_sha256,tenant_id,actor_user_id,grant_id,
  issued_at_ms,grant_expires_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?)""",
  (SH,"d"*64,"tenantA","actorA","grantA",NOW-5000,NOW+240000,NOW+120000))
 db.execute("""INSERT INTO essentials_private_one_time_challenges
  (challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,
  quotation_reference,acceptance_version,total_minor,quotation_sha256,
  nonce_sha256,issued_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
  ("challengeA","tenantA","quoteA","customerA","actorA",
   "Q-101",2,10000,QH,N,NOW-4000,NOW+180000))
 db.execute("""INSERT INTO essentials_private_session_quotation_challenges
  (challenge_id,session_key_sha256,tenant_id,actor_user_id,quotation_id,
   customer_id,nonce_sha256,nonce_iv,nonce_ciphertext,issued_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
  ("challengeA",SH,"tenantA","actorA","quoteA","customerA",N,
   bytes(range(12)),b"synthetic-encrypted-oidc-nonce-and-tag",
   NOW-4000,NOW+120000))
 if revoke_session:
  db.execute("""UPDATE essentials_private_consent_actor_sessions
    SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?""",(NOW,SH))
 if revoke_quote:
  db.execute("""UPDATE essentials_private_frozen_quotes SET state='revoked'
   WHERE tenant_id='tenantA' AND quotation_id='quoteA'""")
 if revoke_challenge:
  db.execute("""UPDATE essentials_private_one_time_challenges SET state='revoked'
   WHERE challenge_id='challengeA'""")
 db.commit()
 return db

def save(db,*,handoff=H,session=SH,tenant="tenantA",actor="actorA",
         quote="quoteA",challenge="challengeA",customer="customerA",
         iv=IV,until=None):
 expiry=until if until is not None else NOW+60000
 return db.execute(SAVE,(handoff,iv,ENCRYPTED,NOW-1000,expiry,
         session,tenant,actor,quote,challenge,customer,expiry,NOW)).rowcount
def consume(db,*,handoff=H,session=SH,tenant="tenantA",actor="actorA",
            quote="quoteA",challenge="challengeA",at=NOW):
 return db.execute(CONSUME,(at,handoff,session,tenant,actor,quote,
                             challenge,at,at)).fetchone()
def fail(call,reason):
 try:call()
 except sqlite3.Error:return
 raise AssertionError(reason)

good=make()
assert save(good)==1
row=consume(good)
assert row and row[0]==H and row[1]==SH and row[6]=="customerA"
assert row[7]==IV and row[8]==ENCRYPTED and row[-1]=="consumed"
assert consume(good) is None,"replayed ID token"
assert good.execute("""SELECT COUNT(*) FROM essentials_private_oidc_token_handoffs
 WHERE state='consumed'""").fetchone()[0]==1
fail(lambda:save(good),"reinserted one-use handoff")
fail(lambda:good.execute("""UPDATE essentials_private_oidc_token_handoffs
 SET state='pending',consumed_at_ms=NULL"""),"restored consumed handoff")
fail(lambda:good.execute("""DELETE FROM essentials_private_oidc_token_handoffs"""),
     "deleted encrypted handoff without retention policy")

for reason,kw in [
 ("wrong session",{"session":"f"*64}),
 ("wrong tenant",{"tenant":"tenantB"}),
 ("wrong actor",{"actor":"actorB"}),
 ("wrong quote",{"quote":"quoteB"}),
 ("wrong challenge",{"challenge":"challengeB"}),
 ("wrong customer",{"customer":"customerB"}),
 ("expiry outside binding",{"until":NOW+121000}),
]:
 d=make();assert save(d,**kw)==0,reason
 assert d.execute("SELECT COUNT(*) FROM essentials_private_oidc_token_handoffs").fetchone()[0]==0
for reason,kw in [
 ("revoked session",{"revoke_session":True}),
 ("revoked quote",{"revoke_quote":True}),
 ("revoked challenge",{"revoke_challenge":True})
]:
 d=make(**kw);assert save(d)==0,reason
for reason,statement,parameters in [
 ("session revoked","UPDATE essentials_private_consent_actor_sessions "
  "SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?",(NOW,SH)),
 ("quote revoked","UPDATE essentials_private_frozen_quotes "
  "SET state='revoked' WHERE quotation_id='quoteA'",()),
 ("challenge revoked","UPDATE essentials_private_one_time_challenges "
  "SET state='revoked' WHERE challenge_id='challengeA'",())
]:
 d=make();assert save(d)==1
 d.execute(statement,parameters)
 assert consume(d) is None,reason
 assert d.execute("""SELECT state FROM essentials_private_oidc_token_handoffs""").fetchone()[0]=="pending"

for args in [
 {"tenant":"tenantB"},{"actor":"actorB"},{"quote":"quoteB"},
 {"challenge":"challengeB"},{"session":"e"*64},{"handoff":"e"*64}
]:
 d=make();assert save(d)==1
 assert consume(d,**args) is None,args
 assert consume(d) is not None,args
print("PASS: exact encrypted ID-token handoff SQL permits one-time exact session+quote consumption; denies revocation, cross-tenant, replay and tampering; retains blocked audit")
