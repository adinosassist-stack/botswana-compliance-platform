#!/usr/bin/env python3
"""Offline migration 070→071 SQLite fixture rehearsal; never touches Cloudflare or production."""
import hashlib
import json
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
p070 = ROOT / "cloudflare/migrations/070_payment_pop_documents.sql"
p071 = ROOT / "cloudflare/migrations/071_payment_pop_runtime_compat.sql"
sql070, sql071 = p070.read_text(), p071.read_text()
hashes = [hashlib.sha256(s.encode()).hexdigest() for s in (sql070, sql071)]
assert all(len(h) == 64 for h in hashes)
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
# Deliberately minimal fixtures: validates syntax and named references, not full production compatibility.
db.executescript("""
CREATE TABLE tenants (id TEXT PRIMARY KEY);
CREATE TABLE payment_orders (id TEXT PRIMARY KEY);
CREATE TABLE manual_payment_submissions (id TEXT PRIMARY KEY);
""")
db.executescript(sql070)
assert db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_pop_documents'").fetchone()
cols070 = {r[1] for r in db.execute("PRAGMA table_info(payment_pop_documents)")}
assert "content_sha256" not in cols070
db.executescript(sql071)
expected = {"content_sha256","object_etag","scan_request_id","scan_requested_at",
            "scan_request_expires_at","scan_result_hash","scan_result_body",
            "scan_result_signature","scanner_provider","scanned_at",
            "last_owner_read_at","storage_deleted_at"}
cols071 = {r[1] for r in db.execute("PRAGMA table_info(payment_pop_documents)")}
assert expected.issubset(cols071)
reservation = {r[1] for r in db.execute("PRAGMA table_info(payment_pop_upload_requests)")}
assert {"document_id","tenant_id","payment_order_id","key_hash","request_hash","bytes","state","created_at"}.issubset(reservation)
assert db.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='payment_pop_upload_requests_tenant_idx'").fetchone()
assert len(list(db.execute("PRAGMA foreign_key_list(payment_pop_upload_requests)"))) >= 2
assert len(list(db.execute("PRAGMA foreign_key_list(payment_pop_documents)"))) >= 3
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
assert db.execute("SELECT count(*) FROM payment_pop_documents").fetchone()[0] == 0
assert db.execute("SELECT count(*) FROM payment_pop_upload_requests").fetchone()[0] == 0
print(json.dumps({"kind":"pop070_071_offline_sqlite_rehearsal","status":"pass",
 "sql070_sha256":hashes[0],"sql071_sha256":hashes[1],
 "fixture":"minimal_in_memory_only","production_compatibility_proven":False,
 "production_backup_verified":False,"production_contacted":False,
 "production_write_authorized":False,"production_mutation_performed":False}))
