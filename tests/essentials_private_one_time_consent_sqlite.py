"""Synthetic, offline SQLite test of the ACTUAL JS D1 SQL and trigger.
Never connects to Cloudflare, customer data, or any deployed database.
"""
import hashlib
import json
import sqlite3
import subprocess
import time
from pathlib import Path
from datetime import datetime, timezone

module = "./server/essentials-private-one-time-consent-store.mjs"
names = [
 "ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL",
 "ESSENTIALS_PRIVATE_LOAD_CHALLENGE_SQL",
 "ESSENTIALS_PRIVATE_COMMIT_CONSENT_SQL",
]
statement = "import * as m from " + json.dumps(module) + "; console.log(JSON.stringify([" + ",".join("m."+n for n in names) + "]))"
sql_begin, sql_load, sql_commit = json.loads(subprocess.check_output(
    ["node", "--input-type=module", "-e", statement], text=True
))
assert sql_begin.count("?") == 7
assert sql_load.count("?") == 4
assert sql_commit.count("?") == 15
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("cloudflare/migrations/essentials_private_consent_authority_STAGING_CANDIDATE.sql").read_text())
db.executescript(Path("cloudflare/migrations/essentials_private_one_time_consent_STAGING_CANDIDATE.sql").read_text())
NOW = int(time.time() * 1000)
AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def digest(data):
    return hashlib.sha256(data).hexdigest()
QBYTES = b"synthetic immutable customer quotation BWP100.00"
HASH = digest(QBYTES)
def quote(q, state="accepted"):
    db.execute("""INSERT INTO essentials_private_frozen_quotes
     (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
     total_minor,quotation_sha256,immutable_quotation_bytes,
     frozen_by_actor_user_id,frozen_at,state)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
     ("tenantA",q,"customerA","Q-101",2,10000,HASH,QBYTES,
      "actorA",AT,state))
def begin(q, ch, nonce=None, issued=None, expires=None):
    nonce=nonce or ("nonce"+ch)
    nh=digest(nonce.encode())
    result=db.execute(sql_begin,(ch,"actorA",nh,issued or NOW-20000,
                          expires or NOW+120000,"tenantA",q))
    if result.rowcount != 1:
        raise sqlite3.IntegrityError("zero_row_guarded_challenge_insert")
    return nh
def captured(q,ch,nh, overrides=None):
    blob=(b'{"method":"oidc-rs256-explicit-accept-v1","decision":"accept",'
          b'"synthetic":true}')
    values=[ch,"tenantA",q,"customerA","actorA","Q-101",2,
            10000,HASH,nh,digest(blob),blob,"customerAuthA",AT,NOW]
    for index,value in (overrides or {}).items():
        values[index]=value
    db.execute(sql_commit,values)
def scalar(sql,params=()):
    return db.execute(sql,params).fetchone()[0]
def reject_attempt(fn, msg):
    before=scalar("SELECT COUNT(*) FROM essentials_private_capture_attestations")
    before_consent=scalar("SELECT COUNT(*) FROM essentials_private_verified_consents")
    try:
        fn()
    except sqlite3.Error:
        pass
    else:
        raise AssertionError(msg)
    assert scalar("SELECT COUNT(*) FROM essentials_private_capture_attestations")==before
    assert scalar("SELECT COUNT(*) FROM essentials_private_verified_consents")==before_consent

quote("quoteA")
nh=begin("quoteA","challengeA")
read=db.execute(sql_load,("challengeA","tenantA","quoteA","actorA")).fetchone()
assert read and read[0]=="challengeA"
assert db.execute(sql_load,("challengeA","tenantB","quoteA","actorA")).fetchone() is None
assert db.execute(sql_load,("challengeA","tenantA","quoteA","actorB")).fetchone() is None
captured("quoteA","challengeA",nh)
assert scalar("SELECT state FROM essentials_private_one_time_challenges WHERE challenge_id='challengeA'")=="consumed"
assert scalar("SELECT COUNT(*) FROM essentials_private_verified_consents")==1
assert scalar("SELECT COUNT(*) FROM essentials_private_capture_attestations")==1
assert db.execute(sql_load,("challengeA","tenantA","quoteA","actorA")).fetchone() is None
reject_attempt(lambda: captured("quoteA","challengeA",nh),"replay allowed")
try:
    db.execute("UPDATE essentials_private_one_time_challenges SET state='pending' WHERE challenge_id='challengeA'")
except sqlite3.Error: pass
else: raise AssertionError("consumed challenge resurrected")
for idx,mod in enumerate([
    {4:"actorB"}, {3:"customerB"}, {7:10001},
    {8:"f"*64}, {9:"a"*64}, {5:"wrong-reference"}, {6:3},
]):
    q="wrong"+str(idx)
    ch="denied"+str(idx)
    quote(q)
    good=begin(q,ch)
    reject_attempt(lambda q=q,ch=ch,good=good,mod=mod: captured(q,ch,good,mod),
                   "mismatched joined evidence accepted")
    assert scalar("SELECT state FROM essentials_private_one_time_challenges WHERE challenge_id=?",(ch,))=="pending"

quote("revoked")
rev=begin("revoked","revokedC")
db.execute("UPDATE essentials_private_frozen_quotes SET state='revoked' WHERE quotation_id='revoked'")
reject_attempt(lambda: captured("revoked","revokedC",rev),"revoked source accepted")
quote("expired")
exp=begin("expired","expiredC",issued=NOW-250000,expires=NOW-1000)
reject_attempt(lambda: captured("expired","expiredC",exp),"expired challenge accepted")

quote("conflict")
con=begin("conflict","conflictC")
blob=b"pre-existing synthetic consent"
db.execute("""INSERT INTO essentials_private_verified_consents
 (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
 total_minor,quotation_sha256,consent_sha256,immutable_consent_bytes,
 consent_subject_id,actor_user_id,accepted_at)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
 ("tenantA","conflict","customerA","Q-101",2,10000,HASH,
 digest(blob),blob,"customerAuthA","actorA",AT))
reject_attempt(lambda: captured("conflict","conflictC",con),
               "failed downstream consent write partially consumed challenge")
assert scalar("SELECT state FROM essentials_private_one_time_challenges WHERE challenge_id='conflictC'")=="pending"

quote("parallel")
p=begin("parallel","parallelC")
reject_attempt(lambda: begin("parallel","parallelC2"),
               "second simultaneous pending challenge allowed")
captured("parallel","parallelC",p)
reject_attempt(lambda: begin("parallel","parallelC3"),
               "challenge created after an accepted consent")

print("PASS: actual JS SQL + SQLite trigger atomically consumes one-time challenges, preserves immutable evidence, and rejects replay, altered sources, expiry, duplicate consent and cross-tenant data")
