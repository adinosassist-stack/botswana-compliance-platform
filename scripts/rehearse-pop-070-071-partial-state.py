#!/usr/bin/env python3
"""Offline-only POP 070/071 partial-state qualification; NEVER connects to D1."""
import json
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
sql070 = (root / "cloudflare/migrations/070_payment_pop_documents.sql").read_text()
sql071 = (root / "cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text()
required_071 = ("content_sha256", "object_etag", "scan_request_id", "scan_requested_at",
                "scan_request_expires_at", "scan_result_hash", "scan_result_body",
                "scan_result_signature", "scanner_provider", "scanned_at",
                "last_owner_read_at", "storage_deleted_at")

def fixture():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE payment_orders(id TEXT PRIMARY KEY);
    CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY);
    """)
    db.executescript(sql070)
    return db

def inspect(db):
    columns = {row[1] for row in db.execute("PRAGMA table_info(payment_pop_documents)")}
    objects = {row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE name IN ('payment_pop_upload_requests', 'payment_pop_upload_requests_tenant_idx')")}
    return columns, objects

# The only authorized rehearsal order on a clean isolated fixture is 070 then 071.
clean = fixture()
before, before_objects = inspect(clean)
assert not set(required_071) & before
assert not before_objects
clean.executescript(sql071)
after, after_objects = inspect(clean)
assert set(required_071).issubset(after)
assert {"payment_pop_upload_requests", "payment_pop_upload_requests_tenant_idx"}.issubset(after_objects)
assert clean.execute("PRAGMA foreign_key_check").fetchall() == []

# A partial 071 state must not be misclassified as a safe fresh application.
partial = fixture()
partial.execute("ALTER TABLE payment_pop_documents ADD COLUMN content_sha256 TEXT")
partial_before, _ = inspect(partial)
assert "content_sha256" in partial_before and "object_etag" not in partial_before
try:
    partial.executescript(sql071)
except sqlite3.OperationalError as error:
    assert "duplicate column name" in str(error)
else:
    raise AssertionError("Unsafe 071 replay unexpectedly succeeded")

# Re-running complete 071 also fails; operator must inspect/reconcile, never blindly retry.
try:
    clean.executescript(sql071)
except sqlite3.OperationalError as error:
    assert "duplicate column name" in str(error)
else:
    raise AssertionError("Unexpectedly idempotent 071 replay")

print(json.dumps({"kind": "pop_070_071_partial_state_offline", "status": "pass",
                  "clean_rehearsal": "pass", "partial_replay": "rejected",
                  "duplicate_replay": "rejected",
                  "fixture": "minimal_in_memory_only",
                  "production_compatibility_proven": False,
                  "backup_verified": False,
                  "production_contacted": False,
                  "production_write_performed": False}))
