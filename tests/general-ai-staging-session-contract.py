#!/usr/bin/env python3
"""Offline staging auth contract tests; never connects to Cloudflare."""
import sqlite3, hmac, hashlib, secrets
from pathlib import Path
schema=Path("cloudflare/schema/general-ai-staging-auth.sql").read_text()
db=sqlite3.connect(":memory:")
db.executescript(schema)
secret=secrets.token_bytes(32)
token=secrets.token_urlsafe(32)
digest=hmac.new(secret,token.encode(),hashlib.sha256).hexdigest()
db.execute("INSERT INTO users(id,email,session_generation) VALUES('u1','test@example.invalid',0)")
db.execute("INSERT INTO memberships(user_id,tenant_id,role,status) VALUES('u1','t1','owner','active')")
db.execute("INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,?,?)",(digest,'u1','t1','csrf',0,'2099-01-01 00:00:00'))
sql="""SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id
JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active'
WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1"""
def allowed(hash_):return db.execute(sql,(hash_,)).fetchone() is not None
assert allowed(digest)
assert not allowed("incorrect-token-hash")
db.execute("UPDATE memberships SET status='inactive'")
assert not allowed(digest)
db.execute("UPDATE memberships SET status='active'")
db.execute("UPDATE users SET session_generation=1")
assert not allowed(digest)
db.execute("UPDATE users SET session_generation=0")
db.execute("UPDATE sessions SET expires_at='2000-01-01 00:00:00'")
assert not allowed(digest)
print("PASS: session validity, wrong token, inactive tenant, revoked generation, expiry")
