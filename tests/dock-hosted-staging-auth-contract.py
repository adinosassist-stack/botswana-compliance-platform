"""Exercise actual workspace and research SQL against synthetic-only offline D1 candidate."""
import sqlite3
import re
import pathlib
import hashlib
import hmac

root = pathlib.Path(__file__).resolve().parents[1]
schema = (root / "cloudflare/schema/dock-hosted-staging-auth-candidate.sql").read_text()
workspace = (root / "cloudflare/src/worker.js").read_text()
research = (root / "cloudflare/src/general-ai-staging-entry.js").read_text()
w = re.search(r'"(SELECT s\.user_id,s\.tenant_id,m\.role,s\.role session_role,[^"]+LIMIT 1)"', workspace)
r = re.search(r'`(SELECT s\.user_id,s\.tenant_id,s\.csrf_token,m\.role,u\.email[\s\S]+?LIMIT 1)`', research)
assert w and r, "authentication SQL drift"
state = re.search(r'"(SELECT version,state_json FROM app_state WHERE tenant_id=\?)"', workspace)
assert state, "workspace state SQL drift"
db = sqlite3.connect(":memory:")
db.row_factory = sqlite3.Row
db.executescript(schema)
secret = b"offline-synthetic-test-only"
def digest(token):
    return hmac.new(secret, token.encode(), hashlib.sha256).hexdigest()
def fixture(suffix):
    tenant, user = "dock-fixture-tenant-"+suffix, "dock-fixture-user-"+suffix
    token, csrf = digest("session-"+suffix), digest("csrf-"+suffix)
    db.execute("INSERT INTO tenants VALUES(?,?)",(tenant,"Synthetic "+suffix))
    db.execute("INSERT INTO users(id,email,display_name) VALUES(?,?,?)",(user,suffix+"@dock.invalid","Synthetic "+suffix))
    db.execute("INSERT INTO memberships VALUES(?,?,?,?)",(tenant,user,"owner","active"))
    db.execute("INSERT INTO sessions(token_hash,public_id,user_id,tenant_id,role,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,?,?,0,datetime('now','+10 minutes'))",(token,"offline-"+suffix,user,tenant,"owner",csrf))
    db.execute("INSERT INTO app_state(tenant_id,version,state_json) VALUES(?,1,?)",(tenant,'{"synthetic":"'+suffix+'"}'))
    return tenant,user,token,csrf
a,b=fixture("a"),fixture("b")
def verify(f):
    for query in (w.group(1),r.group(1)):
        row=db.execute(query,(f[2],)).fetchone()
        assert row and row["tenant_id"]==f[0] and row["user_id"]==f[1] and row["csrf_token"]==f[3]
def reject(token):
    assert all(db.execute(q,(token,)).fetchone() is None for q in (w.group(1),r.group(1)))
verify(a);verify(b);reject(digest("unknown"))
assert db.execute(state.group(1),(a[0],)).fetchone()["state_json"]=='{"synthetic":"a"}'
assert db.execute(state.group(1),(b[0],)).fetchone()["state_json"]=='{"synthetic":"b"}'
db.execute("UPDATE memberships SET status='inactive' WHERE user_id=?",(a[1],));reject(a[2]);verify(b)
db.execute("UPDATE memberships SET status='active' WHERE user_id=?",(a[1],));verify(a)
db.execute("UPDATE users SET session_generation=1 WHERE id=?",(a[1],));reject(a[2]);verify(b)
db.execute("UPDATE users SET session_generation=0 WHERE id=?",(a[1],))
db.execute("UPDATE sessions SET created_at=datetime('now','-10 minutes'),expires_at=datetime('now','-1 minute') WHERE token_hash=?",(a[2],));reject(a[2]);verify(b)
def disallowed(sql, params=()):
    try:
        db.execute(sql,params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("unexpectedly accepted invalid fixture")
disallowed("INSERT INTO users(id,email,display_name) VALUES(?,?,?)",("dock-fixture-user-real","real@example.com","No"))
disallowed("INSERT INTO tenants VALUES(?,?)",("real-tenant","No"))
disallowed("UPDATE sessions SET tenant_id=? WHERE token_hash=?",(a[0],b[2]))
disallowed("UPDATE sessions SET expires_at=datetime(created_at,'+16 minutes') WHERE token_hash=?",(b[2],))
assert not db.execute("PRAGMA foreign_key_check").fetchall()
print("PASS: shared workspace/research SQL, tenant scope, expiry, revocation, synthetic constraints and state read")
