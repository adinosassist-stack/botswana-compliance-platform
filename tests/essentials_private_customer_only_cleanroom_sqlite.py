"""One consolidated OFFLINE Phase-C customer-only migration qualification.

Never connects to Cloudflare, IdP or production. Sources are pinned from the
current Git checkout, and manifests/hash evidence must be reviewed against
the exact independently approved GitHub commit before a separate D1 action.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path("cloudflare/migrations")
PACKAGE = (
    "essentials_private_customer_only_baseline_STAGING_CANDIDATE.sql",
    "essentials_private_customer_identity_links_STAGING_CANDIDATE.sql",
    "essentials_private_verified_customer_sessions_STAGING_CANDIDATE.sql",
    "essentials_private_frozen_terms_customer_review_STAGING_CANDIDATE.sql",
    "essentials_private_customer_final_consent_STAGING_CANDIDATE.sql",
    "essentials_private_customer_invite_oidc_STAGING_CANDIDATE.sql",
)
LEGACY = ROOT / "essentials_private_consent_authority_STAGING_CANDIDATE.sql"
FORBIDDEN_TABLES = {
    "essentials_private_verified_consents",
    "essentials_private_signed_receipts",
}
REQUIRED_TABLES = {
    "essentials_private_frozen_quotes",
    "essentials_private_customer_identity_links",
    "essentials_private_customer_consent_invitations",
    "essentials_private_customer_consent_sessions",
    "essentials_private_customer_session_issuance_audit",
    "essentials_private_frozen_quote_terms",
    "essentials_private_frozen_quote_terms_audit",
    "essentials_private_customer_quote_review_offers",
    "essentials_private_customer_verified_acceptances",
    "essentials_private_customer_acceptance_audit",
    "essentials_private_customer_invitation_launches",
    "essentials_private_customer_invite_issue_audit",
    "essentials_private_customer_oidc_logins",
    "essentials_private_customer_oidc_start_audit",
}
REQUIRED_INDEXES = {
    "essentials_private_customer_session_scope",
    "essentials_private_customer_review_active",
    "essentials_private_customer_oidc_iv_unique",
    "essentials_private_customer_invitation_scope",
}
REQUIRED_TRIGGERS = {
    "essentials_private_frozen_immutable",
    "essentials_private_frozen_no_delete",
    "essentials_private_terms_assert_freeze",
    "essentials_private_customer_session_assert",
    "essentials_private_customer_acceptance_assert",
    "essentials_private_customer_invite_issue_assert",
    "essentials_private_customer_oidc_start_assert",
}

def schema_objects(db: sqlite3.Connection, kind: str) -> set[str]:
    return {
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type=? "
            "AND name NOT LIKE 'sqlite_%'", (kind,)
        )
    }

def fail_sql(operation, what: str) -> None:
    try:
        operation()
    except sqlite3.Error:
        return
    raise AssertionError(f"Unexpected successful SQL mutation: {what}")

def clean_db():
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys=ON")
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    return conn

contents = [(name, (ROOT / name).read_text(encoding="utf-8"))
            for name in PACKAGE]
assert len(contents) == 6
assert all(s.strip() and "CREATE TABLE" in s for _, s in contents)

# Baseline must be byte-identical for its actual DDL to the original frozen
# quotation table and its two immutability triggers (not a weakened copy).
original = LEGACY.read_text(encoding="utf-8")
base = contents[0][1]
anchor = "CREATE TABLE essentials_private_frozen_quotes ("
legacy_tail = "CREATE TABLE essentials_private_verified_consents ("
assert original.count(anchor) == 1 and original.count(legacy_tail) == 1
assert base.count(anchor) == 1 and legacy_tail not in base
assert original.split(anchor, 1)[1].split(legacy_tail, 1)[0].strip() == (
    base.split(anchor, 1)[1].strip()
), "Customer quote DDL drifted from existing frozen-quote authority"

for name, sql in contents:
    assert "DROP TABLE" not in sql.upper(), f"unexpected destructive SQL: {name}"
    assert "ALTER TABLE" not in sql.upper(), f"unreviewed migration rewrite: {name}"
    assert "ATTACH DATABASE" not in sql.upper(), f"external database reference: {name}"
    for forbidden in FORBIDDEN_TABLES:
        assert not re.search(r"\b" + forbidden + r"\b", sql, re.I), (
            f"employee consent table leaked into customer package: {name}"
        )

# A single clean-room transaction, NOT a live D1 migration. The separate
# production apply plan must explicitly prove equivalent atomic semantics.
sql_batch = "\n".join(s for _, s in contents)
db = clean_db()
db.executescript("BEGIN IMMEDIATE;\n" + sql_batch + "\nCOMMIT;\n")

tables = schema_objects(db, "table")
triggers = schema_objects(db, "trigger")
indexes = schema_objects(db, "index")
assert tables == REQUIRED_TABLES, (
    f"unexpected tables, missing={sorted(REQUIRED_TABLES-tables)} "
    f"extra={sorted(tables-REQUIRED_TABLES)}"
)
assert len(triggers) == 33, f"Unexpected trigger count: {len(triggers)}"
assert REQUIRED_TRIGGERS <= triggers, sorted(REQUIRED_TRIGGERS-triggers)
assert REQUIRED_INDEXES <= indexes, sorted(REQUIRED_INDEXES-indexes)
assert not (tables & FORBIDDEN_TABLES)

for tbl in REQUIRED_TABLES:
    for _, _, parent, _, _, _, _, _ in db.execute(f"PRAGMA foreign_key_list({tbl})"):
        assert parent in tables, f"{tbl}: missing FK target {parent}"

# Verify expected customer-only lineage and recipient of composite FK.
accept_fk = db.execute(
    "PRAGMA foreign_key_list(essentials_private_customer_verified_acceptances)"
).fetchall()
assert {row[2] for row in accept_fk} >= {
    "essentials_private_customer_quote_review_offers",
    "essentials_private_frozen_quote_terms",
    "essentials_private_customer_consent_sessions",
    "essentials_private_customer_identity_links",
}
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert db.execute(
    "SELECT count(*) FROM essentials_private_frozen_quotes"
).fetchone()[0] == 0, "No real or synthetic customer data in install result"

# Prove unfinished legacy/employee attribution cannot be written by a future
# customer-only application. The ONLY allowed staff issuer field is provenance
# of WHO FROZE the initial quotation, not who signed customer acceptance.
accept_cols = {
    row[1] for row in db.execute(
        "PRAGMA table_info(essentials_private_customer_verified_acceptances)"
    )
}
assert "actor_user_id" not in accept_cols
assert "identity_subject_hmac_sha256" in accept_cols
assert "terms_sha256" in accept_cols
assert "authentication_proof_sha256" in accept_cols
assert "server_hmac_sha256" in accept_cols

quote_bytes = b"SYNTHETIC accepted quote BWP100"
quote_hash = hashlib.sha256(quote_bytes).hexdigest()
db.execute(
    "INSERT INTO essentials_private_frozen_quotes "
    "(tenant_id,quotation_id,customer_id,quotation_reference,"
    "acceptance_version,total_minor,quotation_sha256,"
    "immutable_quotation_bytes,frozen_by_actor_user_id,frozen_at) "
    "VALUES (?,?,?,?,?,?,?,?,?,?)",
    ("testTenant", "testQuote", "testCustomer", "SYN-Q-100", 1, 10000,
     quote_hash, quote_bytes, "syntheticStaffIssuer", "2026-11-19T00:00:00Z"),
)
assert db.execute(
    "SELECT count(*) FROM essentials_private_frozen_quotes q "
    "JOIN essentials_private_frozen_quote_terms t "
    "ON q.tenant_id=t.tenant_id AND q.quotation_id=t.quotation_id "
    "JOIN essentials_private_frozen_quote_terms_audit f "
    "ON f.tenant_id=q.tenant_id AND f.quotation_id=q.quotation_id"
).fetchone()[0] == 0, "Bare quote leaked to complete-terms customer reader"
fail_sql(
    lambda: db.execute(
        "UPDATE essentials_private_frozen_quotes SET total_minor=10 "
        "WHERE quotation_id='testQuote'"
    ), "immutable quotation amount"
)
fail_sql(
    lambda: db.execute(
        "DELETE FROM essentials_private_frozen_quotes "
        "WHERE quotation_id='testQuote'"
    ), "immutable frozen quote delete"
)

assert db.execute("PRAGMA foreign_key_check").fetchall() == []
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"

# This must not silently re-run, weaken triggers, or make duplicate tables.
before = (schema_objects(db, "table"), schema_objects(db, "trigger"))
fail_sql(
    lambda: db.executescript("BEGIN IMMEDIATE;\n" + sql_batch + "\nCOMMIT;\n"),
    "duplicate installation"
)
db.rollback()
assert (schema_objects(db, "table"), schema_objects(db, "trigger")) == before

# Migration batch failure on a brand-new DB must leave NO partial schema.
broken = clean_db()
fail_sql(
    lambda: broken.executescript(
        "BEGIN IMMEDIATE;\n" + sql_batch
        + "\nINSERT INTO definitely_not_authorized_table VALUES (1);\nCOMMIT;\n"
    ), "synthetic atomic clean-room error"
)
broken.rollback()
assert schema_objects(broken, "table") == set(), "partial schema after abort"
assert schema_objects(broken, "trigger") == set()

# Source SHA-256 manifest. Approval must explicitly bind these exact values
# AND exact reviewed main SHA; cannot use git blob SHA-1 as SQL checksum.
manifest = [
    {
        "order": i,
        "path": "cloudflare/migrations/" + name,
        "sha256": hashlib.sha256(sql.encode("utf-8")).hexdigest(),
        "utf8_bytes": len(sql.encode("utf-8")),
    }
    for i, (name, sql) in enumerate(contents, 1)
]
print("PHASE_C_CUSTOMER_ONLY_CHECKSUMS=" + json.dumps(manifest, sort_keys=True))
print(
    "PASS: six exact customer-only migrations; 14 tables; 33 triggers; "
    "complete FK/integrity; legacy employee consent absent; immutable "
    "quote; duplicate-run guard; all-or-none clean-room rollback"
)
