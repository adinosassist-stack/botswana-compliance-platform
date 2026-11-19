"""Offline SQLite test of actual exported OIDC one-time state SQL.
Synthetic-only, no Cloudflare D1, customer data or IdP network access.
"""
import json
import sqlite3
import subprocess
import time
from pathlib import Path

script = ("import {ESSENTIALS_PRIVATE_SAVE_OIDC_STATE_SQL as a,"
          "ESSENTIALS_PRIVATE_CONSUME_OIDC_STATE_SQL as b} "
          "from './server/essentials-private-oidc-authorization-state-store.mjs';"
          "console.log(JSON.stringify([a,b]))")
SAVE, CONSUME = json.loads(subprocess.check_output(
    ["node","--input-type=module","-e",script],text=True))
assert SAVE.count("?")==16 and CONSUME.count("?")==5
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("cloudflare/migrations/essentials_private_oidc_state_STAGING_CANDIDATE.sql").read_text())
now=int(time.time()*1000)
def params(state="a"*64,session="b"*64,tenant="tenantA",quote="quoteA",
           start=None,expiry=None):
    return (state,session,tenant,"actorA",quote,"challengeA","customerA",
            "c"*64,bytes(range(12)),b"ciphertext-synthetic-AES-GCM-tag",
            "https://identity.example.test","confidential.client:1",
            "https://private.example.test/callback",
            "https://identity.example.test/token",
            start if start is not None else now-1000,
            expiry if expiry is not None else now+30000)
db.execute(SAVE,params())
record=db.execute(CONSUME,(now,"a"*64,"d"*64,now,now)).fetchone()
assert record is None,"different session consumed authorization state"
assert db.execute("SELECT state FROM essentials_private_oidc_authorization_attempts").fetchone()[0]=="pending"
record=db.execute(CONSUME,(now,"a"*64,"b"*64,now,now)).fetchone()
assert record and record[-1]=="consumed"
assert record[0]=="a"*64 and record[1]=="b"*64
assert isinstance(record[8],bytes) and isinstance(record[9],bytes)
assert db.execute(CONSUME,(now,"a"*64,"b"*64,now,now)).fetchone() is None,"state replay permitted"
def fails(do,reason):
    try: do()
    except sqlite3.Error: return
    raise AssertionError(reason)
fails(lambda:db.execute("UPDATE essentials_private_oidc_authorization_attempts SET state='pending'"),"reinstated consumed state")
fails(lambda:db.execute("DELETE FROM essentials_private_oidc_authorization_attempts"),"deleted immutable state")
fails(lambda:db.execute(SAVE,params()),"reused state hash")
db.execute(SAVE,params(state="d"*64,session="e"*64,quote="quoteB",expiry=now-1))
assert db.execute(CONSUME,(now,"d"*64,"e"*64,now,now)).fetchone() is None,"expired state consumed"
fails(lambda:db.execute(SAVE,params(state="f"*64,session="b"*64)),"parallel pending state on same session and quotation")
fails(lambda:db.execute(SAVE,params(state="invalid",session="f"*64,quote="quoteC")),"invalid state hash written")
db.execute(SAVE,params(state="e"*64,session="f"*64,quote="quoteC"))
fails(lambda:db.execute("UPDATE essentials_private_oidc_authorization_attempts SET verifier_ciphertext=x'00' WHERE state_sha256=?",("e"*64,)),"modified encrypted PKCE")
db.execute("UPDATE essentials_private_oidc_authorization_attempts SET state='revoked' WHERE state_sha256=?",("e"*64,))
assert db.execute(CONSUME,(now,"e"*64,"f"*64,now,now)).fetchone() is None,"revoked state consumed"
fails(lambda:db.execute("UPDATE essentials_private_oidc_authorization_attempts SET state='pending' WHERE state_sha256=?",("e"*64,)),"revived revoked state")
print("PASS: actual OIDC state SQL consumes only exact session+unexpired state once; denies duplicate, cross-session, expiry, mutation and revocation")
