"""Actual JS SQL: token bytes wiped in a single SQLite transaction while
one-time audit tombstones remain. Entirely offline, synthetic data only.
"""
import hashlib
import json
import sqlite3
import subprocess
import time
from datetime import datetime,timezone
from pathlib import Path

source=("import {ESSENTIALS_PRIVATE_SAVE_OIDC_HANDOFF_SQL as a,"
 "ESSENTIALS_PRIVATE_SELECT_OIDC_HANDOFF_SQL as b,"
 "ESSENTIALS_PRIVATE_WIPE_OIDC_HANDOFF_SQL as c,"
 "ESSENTIALS_PRIVATE_ASSERT_OIDC_HANDOFF_ERASURE_SQL as d,"
 "ESSENTIALS_PRIVATE_EXPIRE_OIDC_HANDOFF_SQL as e}"
 "from './server/essentials-private-oidc-server-handoff.mjs';"
 "console.log(JSON.stringify([a,b,c,d,e]))")
SAVE,SELECT,WIPE,ASSERT,EXPIRE=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",source],text=True))
assert [q.count("?") for q in [SAVE,SELECT,WIPE,ASSERT,EXPIRE]]==[13,8,9,7,1]
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
def snapshot(db):
 return db.execute("""SELECT state,token_iv,token_ciphertext,consumed_at_ms,
 expired_at_ms FROM essentials_private_oidc_token_handoffs""").fetchone()
def audit_count(db):
 return db.execute("SELECT COUNT(*) FROM essentials_private_oidc_handoff_erasures").fetchone()[0]
def consume(db,*,handoff=H,session=SH,tenant="tenantA",actor="actorA",
            quote="quoteA",challenge="challengeA",at=NOW,skip_wipe=False):
 db.execute("BEGIN")
 try:
  before=db.execute(SELECT,(handoff,session,tenant,actor,quote,challenge,at,at)).fetchall()
  if not skip_wipe:
   db.execute(WIPE,(at,handoff,session,tenant,actor,quote,challenge,at,at))
  db.execute(ASSERT,(handoff,session,tenant,actor,quote,challenge,at))
  db.commit()
  if len(before)!=1: raise AssertionError("completed without unique selected token")
  return before[0]
 except sqlite3.Error:
  db.rollback()
  return None
def fails(action,reason):
 try:action()
 except sqlite3.Error:return
 raise AssertionError(reason)

good=make()
assert save(good)==1
old=consume(good)
assert old and old[0]==H and old[1]==SH and old[6]=="customerA"
assert old[7]==IV and old[8]==ENCRYPTED and old[-1]=="pending"
assert snapshot(good)==("consumed",None,None,NOW,None)
assert audit_count(good)==1
assert consume(good) is None,"replayed consumed handoff"
assert audit_count(good)==1
fails(lambda:save(good),"reinserted old handoff")
fails(lambda:good.execute("""UPDATE essentials_private_oidc_token_handoffs
 SET state='pending',consumed_at_ms=NULL,token_iv=?,token_ciphertext=?""",
 (IV,ENCRYPTED)),"restored wiped encrypted token")
fails(lambda:good.execute("""DELETE FROM essentials_private_oidc_token_handoffs"""),
 "deleted replay tombstone")
fails(lambda:good.execute("""DELETE FROM essentials_private_oidc_handoff_erasures"""),
 "deleted atomic erasure assertion")

# Invalid SELECT is not an SQL error, but mandatory final assertion raises
# ABORT. A missing WIPE also raises ABORT and the transaction rolls back.
for reason,kwargs in [
 ("wrong session",{"session":"e"*64}),
 ("wrong tenant",{"tenant":"tenantB"}),
 ("wrong actor",{"actor":"actorB"}),
 ("wrong quote",{"quote":"quoteB"}),
 ("wrong challenge",{"challenge":"challengeB"}),
 ("wrong handoff",{"handoff":"e"*64}),
 ("omitted wipe",{"skip_wipe":True}),
]:
 d=make();assert save(d)==1
 assert consume(d,**kwargs) is None,reason
 assert snapshot(d)[0]=="pending" and snapshot(d)[1]==IV,reason
 assert snapshot(d)[2]==ENCRYPTED and audit_count(d)==0,reason
 assert consume(d) is not None,reason

for reason,params in [
 ("session revoked",{"revoke_session":True}),
 ("quote revoked",{"revoke_quote":True}),
 ("challenge revoked",{"revoke_challenge":True})
]:
 d=make(**params);assert save(d)==0,reason

for reason,sql,values in [
 ("session revoked","UPDATE essentials_private_consent_actor_sessions "
  "SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?",(NOW,SH)),
 ("quote revoked","UPDATE essentials_private_frozen_quotes "
  "SET state='revoked' WHERE quotation_id='quoteA'",()),
 ("challenge revoked","UPDATE essentials_private_one_time_challenges "
  "SET state='revoked' WHERE challenge_id='challengeA'",())
]:
 d=make();assert save(d)==1
 d.execute(sql,values);d.commit()
 assert consume(d) is None,reason
 assert snapshot(d)[0]=="pending" and audit_count(d)==0,reason

# A dedicated, independently authorized cleaner performs a one-way wipe of
# EXPIRED unconsumed tokens without issuing an ID token to any caller.
expired=make()
short_expiry=NOW+150
assert save(expired,until=short_expiry)==1
time.sleep(.24)
removed=expired.execute(EXPIRE,(NOW+1000,)).rowcount
assert removed==1,removed
after=snapshot(expired)
assert after[0]=="expired" and after[1] is None and after[2] is None
assert after[3] is None and after[4] is not None
assert expired.execute(EXPIRE,(NOW+1000,)).rowcount==0
assert consume(expired) is None
fails(lambda:expired.execute("""UPDATE essentials_private_oidc_token_handoffs
 SET state='pending',expired_at_ms=NULL"""),"resurrected expired handoff")
assert audit_count(expired)==0

print("PASS: real OIDC handoff SQL SELECT+WIPE+ASSERT atomic rollback and encrypted-token clearing; immutable replay tombstones, denied cross-scope, revoked sources and expiry cleanup")
