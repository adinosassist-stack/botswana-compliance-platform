"""Offline qualification of the exact private-staging identity-bound trigger and
real JS consent INSERT SQL. No Cloudflare access or real user data."""
import hashlib
import json
import sqlite3
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

source = "import {ESSENTIALS_PRIVATE_COMMIT_CONSENT_SQL as s} from './server/essentials-private-one-time-consent-store.mjs'; console.log(JSON.stringify(s))"
INSERT = json.loads(subprocess.check_output(
    ["node", "--input-type=module", "-e", source], text=True
))
assert INSERT.count("?") == 15
MIGRATIONS = [
    "essentials_private_consent_authority_STAGING_CANDIDATE.sql",
    "essentials_private_one_time_consent_STAGING_CANDIDATE.sql",
    "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
    "essentials_private_identity_bound_capture_STAGING_CANDIDATE.sql",
]
NOW = int(time.time() * 1000)
STAMP = datetime.fromtimestamp(NOW / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
ISSUER = "https://identity.example.test"
TAG = "a" * 64
QUOTE_BYTES = b"synthetic immutable quote for tenantA"
QUOTE_HASH = hashlib.sha256(QUOTE_BYTES).hexdigest()
NONCE_HASH = "b" * 64

def digest(data):
    return hashlib.sha256(data).hexdigest()

def prepare(*, link_state="active", link_expires=None, proof_at=None):
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for name in MIGRATIONS:
        db.executescript(Path("cloudflare/migrations", name).read_text())
    db.execute("""INSERT INTO essentials_private_frozen_quotes
      (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
       total_minor,quotation_sha256,immutable_quotation_bytes,
       frozen_by_actor_user_id,frozen_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)""",
      ("tenantA","quoteA","customerA","Q-101",2,10000,QUOTE_HASH,
       QUOTE_BYTES,"actorA",STAMP))
    db.execute("""INSERT INTO essentials_private_one_time_challenges
      (challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,
       quotation_reference,acceptance_version,total_minor,quotation_sha256,
       nonce_sha256,issued_at_ms,expires_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
      ("challengeA","tenantA","quoteA","customerA","actorA","Q-101",2,
       10000,QUOTE_HASH,NONCE_HASH,NOW-20000,NOW+120000))
    db.execute("""INSERT INTO essentials_private_customer_identity_links
      (link_id,issuer,subject_hmac_sha256,tenant_id,customer_id,
       consent_subject_id,provisioned_by_actor_user_id,proof_reference_sha256,
       proof_verified_at_ms,expires_at_ms,state,revoked_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
      ("linkA",ISSUER,TAG,"tenantA","customerA","customerAuthA",
       "actorA","c"*64,proof_at if proof_at is not None else NOW-100000,
       link_expires if link_expires is not None else NOW+120000,
       link_state,NOW-1 if link_state=="revoked" else None))
    return db

def evidence(**overrides):
    body = {
      "method":"oidc-rs256-explicit-accept-v1", "decision":"accept",
      "challengeId":"challengeA", "tenantId":"tenantA", "quotationId":"quoteA",
      "customerId":"customerA", "actorUserId":"actorA",
      "quotationReference":"Q-101", "acceptanceVersion":2, "totalMinor":10000,
      "quotationSha256":QUOTE_HASH, "challengeNonceSha256":NONCE_HASH,
      "consentSubjectId":"customerAuthA", "customerIdentityLinkId":"linkA",
      "identityIssuer":ISSUER, "identitySubjectHmacSha256":TAG,
      "identitySubjectSha256":"d"*64, "acceptedAt":STAMP,
      "reauthenticatedAt":STAMP,
    }
    body.update(overrides)
    return json.dumps(body, separators=(",", ":")).encode()

def capture(db, **overrides):
    content = overrides.pop("raw", None)
    if content is None:
        content = evidence(**overrides)
    params = (
      "challengeA","tenantA","quoteA","customerA","actorA","Q-101",2,
      10000,QUOTE_HASH,NONCE_HASH,digest(content),content,
      "customerAuthA",STAMP,NOW
    )
    db.execute(INSERT, params)

def status(db):
    return (
      db.execute("SELECT COUNT(*) FROM essentials_private_capture_attestations").fetchone()[0],
      db.execute("SELECT COUNT(*) FROM essentials_private_verified_consents").fetchone()[0],
      db.execute("SELECT state FROM essentials_private_one_time_challenges WHERE challenge_id='challengeA'").fetchone()[0],
    )

successful = prepare()
capture(successful)
assert status(successful) == (1, 1, "consumed")
try:
    capture(successful)
except sqlite3.Error:
    pass
else:
    raise AssertionError("replayed identity-linked consent was accepted")
assert status(successful) == (1, 1, "consumed")

cases = [
 ("wrong immutable customer identity link", {}, {"customerIdentityLinkId":"linkOther"}),
 ("HMAC binding mismatch", {}, {"identitySubjectHmacSha256":"0"*64}),
 ("wrong signed IdP issuer", {}, {"identityIssuer":"https://attacker.test"}),
 ("wrong consent subject ID in immutable evidence", {}, {"consentSubjectId":"different"}),
 ("link expired at commit", {"link_expires":NOW-1}, {}),
 ("revoked customer link at commit", {"link_state":"revoked"}, {}),
 ("ownership proof dated after consent", {"proof_at":NOW+1}, {}),
 ("invalid JSON", {}, {"raw":b"not valid JSON"}),
 ("missing link key", {}, {"customerIdentityLinkId":None}),
]
for reason, options, modification in cases:
    d = prepare(**options)
    try:
        capture(d, **modification)
    except sqlite3.Error:
        pass
    else:
        raise AssertionError(reason)
    assert status(d) == (0, 0, "pending"), (reason, status(d))

late_revocation = prepare()
late_revocation.execute("""UPDATE essentials_private_customer_identity_links
   SET state='revoked',revoked_at_ms=? WHERE link_id='linkA'""", (NOW,))
try:
    capture(late_revocation)
except sqlite3.Error:
    pass
else:
    raise AssertionError("revoked link was reused in capture race")
assert status(late_revocation) == (0, 0, "pending")

print("PASS: identity-bound atomic consent rejects revoked/expired/mismatched IdP links, invalid evidence and replay without partial consent or challenge consumption")
