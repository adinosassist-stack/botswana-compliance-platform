"""Source-only synthetic SQLite contract for private customer identity link SQL.
Never executes a Cloudflare D1 query, configures identity providers or uses real data.
"""
import json
import sqlite3
import subprocess
import time
from pathlib import Path

command = ("import {ESSENTIALS_PRIVATE_CUSTOMER_IDENTITY_LINK_SQL as s} "
           "from './server/essentials-private-customer-identity-link.mjs';"
           "console.log(JSON.stringify(s))")
sql = json.loads(subprocess.check_output(
    ["node","--input-type=module","-e",command],text=True))
assert sql.count("?")==5
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("cloudflare/migrations/essentials_private_customer_identity_links_STAGING_CANDIDATE.sql").read_text())
tag="a"*64
proof="b"*64
now=int(time.time()*1000)
row=("linkA","https://identity.example.test",tag,"tenantA","customerA",
     "customerAuthA","actorA",proof,now-5000,now+60000,"active",None)
db.execute("""INSERT INTO essentials_private_customer_identity_links
 (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,
 consent_subject_id,provisioned_by_actor_user_id,proof_reference_sha256,
 proof_verified_at_ms,expires_at_ms,state,revoked_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",row)
def lookup(issuer="https://identity.example.test",subject_tag=tag,
           tenant="tenantA",customer="customerA",now_ms=now):
    return db.execute(sql,(issuer,subject_tag,tenant,customer,now_ms)).fetchone()
assert lookup() and lookup()[0]=="linkA"
assert lookup(tenant="tenantB") is None
assert lookup(customer="customerB") is None
assert lookup(subject_tag="c"*64) is None
assert lookup(issuer="https://other.test") is None
assert lookup(now_ms=now+80000) is None

def must_fail(action,description):
    try: action()
    except sqlite3.Error: return
    raise AssertionError(description)
must_fail(lambda: db.execute("""INSERT INTO essentials_private_customer_identity_links
  (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,consent_subject_id,
   provisioned_by_actor_user_id,proof_reference_sha256,proof_verified_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?)""",("linkB","https://identity.example.test",tag,
   "tenantB","customerB","customerAuthB","actorB",proof,now-5000,now+50000)),
   "rebound same external subject to second tenant")
must_fail(lambda: db.execute("""INSERT INTO essentials_private_customer_identity_links
  (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,consent_subject_id,
   provisioned_by_actor_user_id,proof_reference_sha256,proof_verified_at_ms,expires_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?)""",("linkC","https://identity.example.test","c"*64,
   "tenantA","customerA","customerAuthC","actorB",proof,now-5000,now+50000)),
   "changed account subject without revocation")
must_fail(lambda: db.execute("DELETE FROM essentials_private_customer_identity_links"),
          "deleted immutable link")
must_fail(lambda: db.execute("UPDATE essentials_private_customer_identity_links SET customer_id='customerB'"),
          "modified immutable customer")
db.execute("UPDATE essentials_private_customer_identity_links SET state='revoked',revoked_at_ms=?",(now,))
assert lookup() is None
must_fail(lambda: db.execute("UPDATE essentials_private_customer_identity_links SET state='active',revoked_at_ms=NULL"),
          "reinstated revoked link")
must_fail(lambda: db.execute("UPDATE essentials_private_customer_identity_links SET revoked_at_ms=?",(now+1,)),
          "modified revoked tombstone")
print("PASS private identity link SQL: tenant/customer/issuer/subject isolation; expiry; immutable irreversible revocation; unique ownership; no delete")
