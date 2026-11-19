"""Offline SQLite security qualification for actual exported private binding SQL.
Synthetic only. No live D1 connection, real customer, IdP or Cloudflare work.
"""
import hashlib
import json
import sqlite3
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

code=("import {ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL as a,"
      "ESSENTIALS_PRIVATE_READ_SESSION_CHALLENGE_SQL as b,"
      "ESSENTIALS_PRIVATE_REVOKE_SESSION_CHALLENGE_SQL as c} "
      "from './server/essentials-private-session-quotation-challenge-binding.mjs';"
      "console.log(JSON.stringify([a,b,c]))")
BIND,READ,REVOKE=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",code],text=True))
assert [x.count("?") for x in [BIND,READ,REVOKE]]==[8,7,6]
SCHEMAS=[
 "essentials_private_consent_authority_STAGING_CANDIDATE.sql",
 "essentials_private_one_time_consent_STAGING_CANDIDATE.sql",
 "essentials_private_consent_actor_sessions_STAGING_CANDIDATE.sql",
 "essentials_private_session_quotation_challenges_STAGING_CANDIDATE.sql",
]
AT=int(time.time()*1000)
STAMP=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
S="a"*64
NONCE="N"*43
NONCE_SHA=hashlib.sha256(NONCE.encode()).hexdigest()
QBYTES=b"synthetic verified frozen quote BWP 100.00"
QHASH=hashlib.sha256(QBYTES).hexdigest()
IV=bytes(range(12))
CIPHER=b"synthetic-authenticated-AES-GCM-encrypted-nonce"
def setup(*, expired_session=False,revoked_session=False,
           expired_challenge=False,revoked_quote=False,
           revoked_challenge=False):
 db=sqlite3.connect(":memory:")
 db.execute("PRAGMA foreign_keys=ON")
 for name in SCHEMAS:
  db.executescript(Path("cloudflare/migrations",name).read_text())
 db.execute("""INSERT INTO essentials_private_frozen_quotes
  (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
   total_minor,quotation_sha256,immutable_quotation_bytes,
   frozen_by_actor_user_id,frozen_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)""",
  ("tenantA","quoteA","customerA","Q-101",2,10000,QHASH,
   QBYTES,"actorA",STAMP))
 db.execute("""INSERT INTO essentials_private_consent_actor_sessions
  (session_key_sha256,csrf_sha256,tenant_id,actor_user_id,
   grant_id,issued_at_ms,grant_expires_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?)""",
  (S,"b"*64,"tenantA","actorA","grantA",AT-1000,AT+400000,
   AT-1 if expired_session else AT+180000))
 if revoked_session:
  db.execute("""UPDATE essentials_private_consent_actor_sessions
    SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?""",(AT,S))
 db.execute("""INSERT INTO essentials_private_one_time_challenges
   (challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,
   quotation_reference,acceptance_version,total_minor,quotation_sha256,
   nonce_sha256,issued_at_ms,expires_at_ms)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
   ("challengeA","tenantA","quoteA","customerA","actorA","Q-101",2,10000,
    QHASH,NONCE_SHA,AT-1000,AT-1 if expired_challenge else AT+300000))
 if revoked_challenge:
  db.execute("""UPDATE essentials_private_one_time_challenges
    SET state='revoked' WHERE challenge_id='challengeA'""")
 if revoked_quote:
  db.execute("""UPDATE essentials_private_frozen_quotes SET state='revoked'
    WHERE quotation_id='quoteA'""")
 return db
def bind(db,*,session=S,quote="quoteA",nonce_hash=NONCE_SHA,
         expiry=AT+180000,challenge_id="challengeA"):
 return db.execute(BIND,(IV,CIPHER,challenge_id,session,quote,
                         nonce_hash,AT-1000,expiry)).rowcount
def read(db,*,session=S,challenge_id="challengeA",tenant="tenantA",
         actor="actorA",quote="quoteA",at=AT):
 return db.execute(READ,(session,challenge_id,tenant,actor,quote,at,at)).fetchone()
def revoke(db,*,session=S,tenant="tenantA",actor="actorA",
           quote="quoteA",challenge_id="challengeA"):
 return db.execute(REVOKE,(AT,session,tenant,actor,quote,challenge_id)).fetchone()
def must_fail(fn,description):
 try:fn()
 except sqlite3.Error:return
 raise AssertionError(description)
db=setup()
assert bind(db)==1
row=read(db)
assert row and row[0]=="challengeA" and row[1]==S and row[5]=="customerA"
assert row[7]==IV and row[8]==CIPHER
assert row[9]==AT-1000 and row[10]==AT+180000
assert row[-1]=="pending"
for overrides in [
 {"session":"f"*64},{"challenge_id":"other"},{"tenant":"other"},
 {"actor":"other"},{"quote":"other"}
]:
 assert read(db,**overrides) is None,overrides
must_fail(lambda:bind(db),"duplicate challenge binding accepted")
assert revoke(db,tenant="other") is None
assert revoke(db,actor="other") is None
assert revoke(db)==("challengeA",)
assert read(db) is None
assert revoke(db) is None
must_fail(lambda:db.execute("""UPDATE essentials_private_session_quotation_challenges
 SET state='pending',revoked_at_ms=NULL"""),"resurrected revoked binding")
must_fail(lambda:db.execute("""DELETE FROM essentials_private_session_quotation_challenges"""),
 "deleted source audit binding")
must_fail(lambda:db.execute("""UPDATE essentials_private_session_quotation_challenges
 SET nonce_ciphertext=x'00'"""),"tampered encrypted nonce")
for reason,params in [
 ("wrong session",{"session":"f"*64}),
 ("wrong quote",{"quote":"other"}),
 ("wrong nonce",{"nonce_hash":"e"*64}),
 ("wrong expiry",{"expiry":AT+100000}),
 ("wrong challenge",{"challenge_id":"other"})
]:
 d=setup()
 assert bind(d,**params)==0,reason
 assert read(d) is None,reason
for reason,options in [
 ("expired parent session",{"expired_session":True}),
 ("revoked actor session",{"revoked_session":True}),
 ("expired one-time challenge",{"expired_challenge":True}),
 ("revoked frozen quote",{"revoked_quote":True}),
 ("revoked one-time challenge",{"revoked_challenge":True})
]:
 d=setup(**options)
 assert bind(d)==0,reason
 assert read(d) is None,reason
for reason,sql,params in [
 ("actor session revoked","UPDATE essentials_private_consent_actor_sessions "
  "SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?",(AT,S)),
 ("frozen quote revoked","UPDATE essentials_private_frozen_quotes "
  "SET state='revoked' WHERE quotation_id='quoteA'",()),
 ("one-time challenge consumed","UPDATE essentials_private_one_time_challenges "
  "SET state='consumed',consumed_at=? WHERE challenge_id='challengeA'",(STAMP,))
]:
 d=setup()
 assert bind(d)==1,reason
 d.execute(sql,params)
 assert read(d) is None,reason
print("PASS: actual encrypted session-to-quotation D1 SQL binds only fresh active actor/session/quote/challenge and denies replay, wrong actor, revoked/expired sources, and tampering")
