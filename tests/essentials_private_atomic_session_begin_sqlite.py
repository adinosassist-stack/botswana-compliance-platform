"""Execute the actual source JS SQL as one SQLite transaction and prove
that an ABORTing final assertion rolls back BOTH prior statements.
SYNTHETIC IN MEMORY ONLY. No Cloudflare D1 or customer data.
"""
import hashlib
import json
import sqlite3
import subprocess
import time
from datetime import datetime,timezone
from pathlib import Path

src=("import {ESSENTIALS_PRIVATE_ATOMIC_BEGIN_READ_QUOTE_SQL as q,"
     "ESSENTIALS_PRIVATE_ASSERT_ATOMIC_BEGIN_SQL as a} "
     "from './server/essentials-private-atomic-session-challenge-begin.mjs';"
     "import {ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL as c}"
     "from './server/essentials-private-one-time-consent-store.mjs';"
     "import {ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL as b}"
     "from './server/essentials-private-session-quotation-challenge-binding.mjs';"
     "console.log(JSON.stringify([q,c,b,a]))")
READ,CHALLENGE,BIND,ASSERT=json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",src],text=True))
assert [q.count("?") for q in [READ,CHALLENGE,BIND,ASSERT]]==[4,7,8,9]
schemas=[
 "essentials_private_consent_authority_STAGING_CANDIDATE.sql",
 "essentials_private_one_time_consent_STAGING_CANDIDATE.sql",
 "essentials_private_consent_actor_sessions_STAGING_CANDIDATE.sql",
 "essentials_private_session_quotation_challenges_STAGING_CANDIDATE.sql",
 "essentials_private_atomic_session_begin_STAGING_CANDIDATE.sql",
]
AT=int(time.time()*1000)
S="a"*64
QUOTE_BYTES=b"synthetic accepted frozen quotation"
QHASH=hashlib.sha256(QUOTE_BYTES).hexdigest()
STAMP=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
N_HASH="e"*64
ISSUED=AT-1000
PARENT_EXP=AT+298000
BOUND_EXP=AT+119000
IV=bytes(range(12))
CIPHER=b"synthetic-AES-GCM-nonce-ciphertext-and-tag"

def setup(*,quote_revoked=False,session_revoked=False,session_expired=False,
          second_quote=False):
 db=sqlite3.connect(":memory:")
 db.execute("PRAGMA foreign_keys=ON")
 for path in schemas:
  db.executescript(Path("cloudflare/migrations",path).read_text())
 for q in (["quoteA","quoteB"] if second_quote else ["quoteA"]):
  db.execute("""INSERT INTO essentials_private_frozen_quotes
   (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
   total_minor,quotation_sha256,immutable_quotation_bytes,frozen_by_actor_user_id,
   frozen_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
   ("tenantA",q,"customerA","Q-101",2,10000,QHASH,
    QUOTE_BYTES,"actorA",STAMP))
 db.execute("""INSERT INTO essentials_private_consent_actor_sessions
  (session_key_sha256,csrf_sha256,tenant_id,actor_user_id,grant_id,
   issued_at_ms,grant_expires_at_ms,expires_at_ms) VALUES (?,?,?,?,?,?,?,?)""",
  (S,"b"*64,"tenantA","actorA","grantA",AT-1000,AT+400000,
   AT-1 if session_expired else BOUND_EXP))
 if session_revoked:
  db.execute("""UPDATE essentials_private_consent_actor_sessions
   SET state='revoked',revoked_at_ms=? WHERE session_key_sha256=?""",(AT,S))
 if quote_revoked:
  db.execute("""UPDATE essentials_private_frozen_quotes
   SET state='revoked' WHERE quotation_id='quoteA'""")
 db.commit()
 return db

def batch(db,*,quote="quoteA",session=S,
          challenge_id="challengeA",nonce_hash=N_HASH,
          expiry=BOUND_EXP,iv=IV,skip_binding=False,binding_nonce_hash=None):
 db.execute("BEGIN")
 try:
  c=db.execute(CHALLENGE,(challenge_id,"actorA",nonce_hash,ISSUED,
                          PARENT_EXP,"tenantA",quote)).rowcount
  b=0
  if not skip_binding:
   b=db.execute(BIND,(iv,CIPHER,challenge_id,session,quote,
                     binding_nonce_hash or nonce_hash,ISSUED,expiry)).rowcount
  a=db.execute(ASSERT,(challenge_id,session,"tenantA","actorA",
    quote,"customerA",nonce_hash,ISSUED,expiry)).rowcount
  db.commit()
  return True,(c,b,a)
 except sqlite3.Error:
  db.rollback()
  return False,None

def counts(db,challenge_id="challengeA"):
 return tuple(db.execute(f"SELECT COUNT(*) FROM {table} WHERE challenge_id=?",
                         (challenge_id,)).fetchone()[0] for table in [
  "essentials_private_one_time_challenges",
  "essentials_private_session_quotation_challenges",
  "essentials_private_atomic_session_begins"])

good=setup()
assert good.execute(READ,("tenantA","quoteA","tenantA","quoteA")).fetchone()
ok,changes=batch(good)
assert ok and changes==(1,1,1),("successful transaction",changes)
assert counts(good)==(1,1,1)
assert not batch(good)[0],"replayed challenge was allowed"
assert counts(good)==(1,1,1)

for reason,options,patch in [
 ("missing accepted quote",{"quote_revoked":True},{}),
 ("revoked actor session",{"session_revoked":True},{}),
 ("expired actor session",{"session_expired":True},{"expiry":AT-1}),
 ("wrong session",{},{"session":"f"*64}),
 ("wrong quote",{},{"quote":"quoteB"}),
 ("wrong binding nonce",{},{"binding_nonce_hash":"d"*64}),
 ("wrong effective binding expiry",{},{"expiry":AT+70000}),
 ("binding omitted entirely",{},{"skip_binding":True})
]:
 d=setup(**options)
 success,_=batch(d,**patch)
 assert not success,reason
 assert counts(d)==(0,0,0),(reason,counts(d))

# A second quote may be started for the same actor, but AES-GCM IV reuse
# is rejected across encrypted bindings, rolling back its fresh challenge.
unique=setup(second_quote=True)
assert batch(unique)[0]
ok,_=batch(unique,quote="quoteB",challenge_id="challengeB",
           nonce_hash="f"*64,iv=IV)
assert not ok,"reused AES-GCM IV inserted a second challenge"
assert counts(unique,"challengeB")== (0,0,0)
assert counts(unique)==(1,1,1)

# A fresh IV and fresh challenge may begin a different accepted quotation.
ok,changed=batch(unique,quote="quoteB",challenge_id="challengeB",
                 nonce_hash="f"*64,iv=bytes(range(12,24)))
assert ok and changed==(1,1,1),changed
assert counts(unique,"challengeB")== (1,1,1)

# Direct unaudited assertion cannot forge the existence of a completed
# atomic begin; audit rows are both append-only and delete-proof.
fake=setup()
try:
 fake.execute(ASSERT,("challengeA",S,"tenantA","actorA","quoteA",
                      "customerA",N_HASH,ISSUED,BOUND_EXP))
except sqlite3.Error:
 pass
else:raise AssertionError("fake atomic begin audit inserted")
assert counts(fake)==(0,0,0)
for query in [
 "UPDATE essentials_private_atomic_session_begins SET customer_id='other'",
 "DELETE FROM essentials_private_atomic_session_begins"
]:
 try: good.execute(query)
 except sqlite3.Error:pass
 else:raise AssertionError("immutable atomic begin ledger modified")

print("PASS: three real JS D1 SQL statements in one SQLite transaction; zero-row stage, wrong actor/session, revoked source, omitted binding, duplicate IV and replay all roll back with NO pending orphan challenge")
