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

# Qualify every interruption point, including all columns present but the
# reservation table or index still missing. Never replay 071 over these states.
statements=[]
buffer=""
for line in s071.splitlines(keepends=True):
    buffer+=line
    if sqlite3.complete_statement(buffer):
        statements.append(buffer)
        buffer=""
assert not buffer.strip() and len(statements)==14, "Review changed 071 statement boundaries"
required_columns={"content_sha256","object_etag","scan_request_id","scan_requested_at",
                  "scan_request_expires_at","scan_result_hash","scan_result_body",
                  "scan_result_signature","scanner_provider","scanned_at",
                  "last_owner_read_at","storage_deleted_at"}
partial_states_rejected=0
for completed in range(1,len(statements)):
    with base() as interrupted:
        interrupted.executescript(s070)
        interrupted.execute("""INSERT INTO payment_pop_documents
          (id,tenant_id,payment_order_id,submission_id,source,object_key,display_name,content_type,bytes)
          VALUES('existing-pop','existing-tenant','existing-order','existing-submission',
                 'web','synthetic-private-key','receipt.pdf','application/pdf',100)""")
        interrupted.executescript("\n".join(statements[:completed]))
        before_schema=interrupted.execute("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").fetchall()
        before_row=interrupted.execute("SELECT * FROM payment_pop_documents").fetchall()
        columns={r[1] for r in interrupted.execute("PRAGMA table_info(payment_pop_documents)")}
        assert len(columns & required_columns)==min(completed,12)
        assert (("table","payment_pop_upload_requests") in objects(interrupted))==(completed==13)
        assert ("index","payment_pop_upload_requests_tenant_idx") not in objects(interrupted)
        try:
            interrupted.executescript(s071)
        except sqlite3.OperationalError as error:
            assert "duplicate column" in str(error).lower()
        else:
            raise AssertionError(f"071 replay accepted after {completed} completed statements")
        assert interrupted.execute("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").fetchall()==before_schema
        assert interrupted.execute("SELECT * FROM payment_pop_documents").fetchall()==before_row
        assert not interrupted.execute("PRAGMA foreign_key_check").fetchall()
        assert interrupted.execute("SELECT scan_status FROM payment_pop_documents").fetchone()[0]=="pending"
        partial_states_rejected+=1
    interrupted.close()

# Dependency failure must be detected before anyone attempts to apply 071 to an empty schema.
isolated=base()
try:
    isolated.executescript(s071)
except sqlite3.OperationalError as e:
    assert "no such table" in str(e).lower()
else:
    raise AssertionError("071 accepted without prerequisite 070")

print(json.dumps({"kind":"pop_070_071_adversarial_offline_contract",
                  "result":"pass","partial_states_rejected":partial_states_rejected,
                  "existing_pending_pop_preserved":True,"production_contacted":False,
                  "production_backup_verified":False,
                  "production_compatible_staging_verified":False,
                  "production_write_authorized":False}))
