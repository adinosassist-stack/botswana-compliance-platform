"""Offline-only actual JS session SQL contract against SQLite in memory.
No customer data, Cloudflare, real identity service or cookie deployment.
"""
import json
import sqlite3
import subprocess
import time
from pathlib import Path

statement = (
 "import {ESSENTIALS_PRIVATE_CREATE_SESSION_SQL as a,"
 "ESSENTIALS_PRIVATE_READ_SESSION_SQL as b,"
 "ESSENTIALS_PRIVATE_REVOKE_SESSION_SQL as c} "
 "from './server/essentials-private-consent-actor-session-store.mjs';"
 "console.log(JSON.stringify([a,b,c]))"
)
SAVE, READ, REVOKE = json.loads(subprocess.check_output(
 ["node","--input-type=module","-e",statement],text=True
))
assert [x.count("?") for x in [SAVE,READ,REVOKE]]==[8,4,4]
assert "grant_expires_at_ms" in READ and "state='active'" in READ
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("cloudflare/migrations/essentials_private_consent_actor_sessions_STAGING_CANDIDATE.sql").read_text())
now=int(time.time()*1000)
H="a"*64
CSRF="b"*64

def create(sh=H,csrf=CSRF,grant="grantA",tenant="tenantA",
           actor="actorA",issued=None,grant_expires=None,expires=None):
 start=issued if issued is not None else now-1000
 gexp=grant_expires if grant_expires is not None else now+300000
 exp=expires if expires is not None else now+120000
 return db.execute(SAVE,(sh,csrf,tenant,actor,grant,start,gexp,exp)).rowcount

def read(sh=H,at=now):
 return db.execute(READ,(sh,at,at,at)).fetchone()

def revoke(sh=H,tenant="tenantA",actor="actorA",at=now):
 return db.execute(REVOKE,(at,sh,tenant,actor)).fetchone()

def fail(operation,description):
 try:operation()
 except sqlite3.Error:return
 raise AssertionError(description)

assert create()==1
row=read()
assert row and row[0]==H and row[1]==CSRF
assert row[2]=="tenantA" and row[3]=="actorA" and row[4]=="grantA"
assert row[8]=="active"
assert read("f"*64) is None
assert read(at=now+500000) is None
fail(lambda:create(sh="c"*64,csrf="d"*64),"reused authenticated grant id")
fail(lambda:create(sh="e"*64,csrf=CSRF,grant="grantOther"),"reused CSRF fingerprint")
fail(lambda:create(sh=H,csrf="e"*64,grant="grantOther"),"reused session fingerprint")
assert revoke(tenant="tenantOther") is None
assert read() is not None
assert revoke(actor="actorOther") is None
assert read() is not None
assert revoke() == (H,)
assert read() is None
assert revoke() is None
fail(lambda: db.execute("UPDATE essentials_private_consent_actor_sessions SET state='active',revoked_at_ms=NULL"),
     "resurrected revoked session")
fail(lambda: db.execute("DELETE FROM essentials_private_consent_actor_sessions"),
     "deleted audit record")
fail(lambda: db.execute("UPDATE essentials_private_consent_actor_sessions SET grant_id='stolen'"),
     "changed grant record after revocation")

assert create(sh="c"*64,csrf="d"*64,grant="grantB",
              issued=now-150000,grant_expires=now+100000,expires=now-1)==1
assert read("c"*64) is None
assert create(sh="e"*64,csrf="f"*64,grant="grantC",
              issued=now+200000,grant_expires=now+500000,expires=now+300000)==1
assert read("e"*64) is None,"future issued session unexpectedly active"
assert create(sh="1"*64,csrf="2"*64,grant="grantD",
              issued=now-1000,grant_expires=now+120000,expires=now+60000)==1
assert read("1"*64) is not None
assert read("1"*64,at=now+80000) is None,"caller clock expired session"
fail(lambda:create(sh="garbage",csrf="3"*64,grant="grantE"),"invalid session digest")
fail(lambda:create(sh="4"*64,csrf="3"*64,grant="grantE",
                   issued=now-1000,grant_expires=now+120000,expires=now+1000000),
     "extended session beyond independent grant/maximum TTL")
print("PASS: actual actor-session SQL enforces grant and CSRF uniqueness, dual-clock expiry, tenant/actor revocation and irreversible audit states")
