#!/usr/bin/env python3
"""Offline POP 070/071 rehearsal against the repository's full Cloudflare schema.

This test never contacts Cloudflare. A repository schema is NOT a verified
production snapshot or a recoverable backup, so successful execution must
not authorize production writes.
"""
import pathlib
import sqlite3
import json

root=pathlib.Path(__file__).resolve().parents[1]
baseline=(root/"cloudflare/schema.sql").read_text()
sql070=(root/"cloudflare/migrations/070_payment_pop_documents.sql").read_text()
sql071=(root/"cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text()
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(baseline)
required={"tenants","payment_orders","manual_payment_submissions"}
existing={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert required <= existing, f"schema missing dependency tables: {required-existing}"
preexisting_pop={"payment_pop_documents","payment_pop_upload_requests"} & existing
if preexisting_pop:
    print(json.dumps({"kind":"pop_repo_schema_rehearsal","result":"blocked_baseline_already_contains_pop_objects",
                      "objects":sorted(preexisting_pop),"production_contacted":False,
                      "production_compatible_staging_verified":False}))
    raise SystemExit(2)
db.executescript(sql070)
db.executescript(sql071)
assert {r[1] for r in db.execute("PRAGMA table_info(payment_pop_documents)")} >= {
    "content_sha256","object_etag","scan_result_signature","storage_deleted_at"}
assert "payment_pop_upload_requests" in {
    r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert not db.execute("PRAGMA foreign_key_check").fetchall()
print(json.dumps({"kind":"pop_repo_schema_rehearsal","result":"pass",
                  "production_contacted":False,"production_compatible_staging_verified":False,
                  "backup_verified":False,"production_write_authorized":False}))
