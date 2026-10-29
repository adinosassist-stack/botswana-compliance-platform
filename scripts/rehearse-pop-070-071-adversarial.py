#!/usr/bin/env python3
"""Offline POP 070→071 migration adversarial rehearsal. NEVER connects to Cloudflare."""
import pathlib
import sqlite3
import json

root=pathlib.Path(__file__).resolve().parents[1]
s070=(root/"cloudflare/migrations/070_payment_pop_documents.sql").read_text()
s071=(root/"cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text()

def base():
    db=sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE payment_orders(id TEXT PRIMARY KEY);
    CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY);
    INSERT INTO tenants VALUES('existing-tenant');
    INSERT INTO payment_orders VALUES('existing-order');
    INSERT INTO manual_payment_submissions VALUES('existing-submission');
    """)
    return db

def objects(db):
    return set(db.execute("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").fetchall())

db=base()
prior=objects(db)
db.executescript(s070)
assert ("table","payment_pop_documents") in objects(db)
assert ("table","payment_pop_upload_requests") not in objects(db)
after070=objects(db)
db.executescript(s071)
after071=objects(db)
assert ("table","payment_pop_upload_requests") in after071
assert {"content_sha256","scan_result_signature","storage_deleted_at"}.issubset(
    {r[1] for r in db.execute("PRAGMA table_info(payment_pop_documents)")})
assert not db.execute("PRAGMA foreign_key_check").fetchall()
assert db.execute("SELECT count(*) FROM tenants").fetchone()[0]==1
assert db.execute("SELECT count(*) FROM payment_orders").fetchone()[0]==1
assert db.execute("SELECT count(*) FROM manual_payment_submissions").fetchone()[0]==1
assert prior.issubset(after070) and after070.issubset(after071)
# 071 must not be treated as an idempotent retry after partial execution.
try:
    db.executescript(s071)
except sqlite3.OperationalError as e:
    assert "duplicate column" in str(e).lower()
else:
    raise AssertionError("071 unexpectedly became safely repeatable; review deployment assumptions")

# Dependency failure must be detected before anyone attempts to apply 071 to an empty schema.
isolated=base()
try:
    isolated.executescript(s071)
except sqlite3.OperationalError as e:
    assert "no such table" in str(e).lower()
else:
    raise AssertionError("071 accepted without prerequisite 070")

print(json.dumps({"kind":"pop_070_071_adversarial_offline_contract",
                  "result":"pass","production_contacted":False,
                  "production_backup_verified":False,
                  "production_compatible_staging_verified":False,
                  "production_write_authorized":False}))
