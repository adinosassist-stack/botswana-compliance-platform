"""OFFLINE ONLY: verify exact isolated-account D1 DDL plan in local SQLite.

Do not import Cloudflare clients, create tokens, deploy, or execute remote SQL.
"""
import hashlib
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "tests/fixtures/essentials_invoice_isolated_schema_plan_v1.json").read_text())
assert manifest["kind"] == "thebe-essentials-invoice-schema-plan-v1"
assert manifest["mode"] == "source-only-offline-no-remote-execution"
assert manifest["readyForRemoteSchemaWrite"] is False
assert manifest["dataRecordsAllowed"] is False
assert all(manifest[k] is True for k in (
    "requiresNewOwnerApproval", "requiresNewIndependentThusicoApproval",
    "requiresProtectedEnvironmentApproval",
))
assert manifest["cloudflareAccountId"] == "ae0dccfed66fc497259aebd81229f08d"
assert manifest["isolatedD1Id"] == "4eb6c739-9c45-4756-bfa9-8ec0a6efb3be"
assert manifest["forbiddenProductionAccountId"] == "ddd23cab31928a4bb3d4998df9b26d1d"
assert manifest["forbiddenProductionD1Id"] == "8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"
assert manifest["forbiddenLegacyStagingD1Id"] == "f6d35915-851a-4771-9e07-589572dc4d05"
assert len({manifest["isolatedD1Id"], manifest["forbiddenProductionD1Id"],
            manifest["forbiddenLegacyStagingD1Id"]}) == 3
assert manifest["cloudflareAccountId"] != manifest["forbiddenProductionAccountId"]
assert manifest["mainAtPreparation"] == "72a61c0c6d05d52193f940037bef2da31337b0a9"

raw = (ROOT / manifest["stagingSqlPath"]).read_bytes()
sql = raw.decode("utf-8")
digest = hashlib.sha256(raw).hexdigest()
assert digest == manifest["rawSqlSha256"], "staging SQL bytes or reviewed digest changed"

deps_path, draft_path, accepted_path = manifest["sourceFiles"]
deps = (ROOT / deps_path).read_text().split("INSERT INTO tenants(id)")[0].rstrip() + "\n"
draft = (ROOT / draft_path).read_text().rstrip() + "\n"
accepted = (ROOT / accepted_path).read_text().rstrip() + "\n"
assert len(manifest["sourceFiles"]) == 3
assert deps_path == "tests/fixtures/essentials_d1_synthetic_dependencies_STAGING_ONLY.sql"
assert draft_path == "cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql"
assert accepted_path == "cloudflare/migrations/essentials_accepted_quotation_snapshots_STAGING_CANDIDATE.sql"

sections = [("dependency_schema", deps), ("invoice_drafts", draft),
            ("accepted_snapshots", accepted)]
header = """-- OFFLINE CANDIDATE ONLY -- MUST NOT RUN WITHOUT SEPARATE OWNER AND THUSICO APPROVAL.
-- New isolated Cloudflare account: ae0dccfed66fc497259aebd81229f08d
-- New isolated EMPTY D1: bw-essentials-invoice-rehearsal
-- D1 UUID: 4eb6c739-9c45-4756-bfa9-8ec0a6efb3be
-- Protected main at preparation: 72a61c0c6d05d52193f940037bef2da31337b0a9
-- Ordered DDL ONLY. No synthetic/customer records. No staging execution authorized.
-- DO NOT use production account ddd23cab31928a4bb3d4998df9b26d1d
-- DO NOT use old D1 f6d35915-851a-4771-9e07-589572dc4d05
"""
expected = header + "\n"
for name, source in sections:
    expected += "-- BEGIN " + name + "\n" + source + "-- END " + name + "\n\n"
assert sql == expected, "source drift, reordering or extra commands in DDL plan"

def validate_ddl_only(s):
    # Strip comments, then reject DML and unsafe commands; exact source identity
    # above provides a stronger allowlist than a standalone keyword scanner.
    no_comments = re.sub(r"(?m)^\s*--[^\n]*(?:\n|$)", "", s)
    for token in ("INSERT", "UPDATE", "DELETE", "REPLACE", "DROP", "ALTER",
                  "ATTACH", "DETACH", "VACUUM", "PRAGMA", "CREATE VIRTUAL",
                  "BEGIN TRANSACTION", "COMMIT", "ROLLBACK"):
        assert not re.search(r"\b" + token.replace(" ", r"\s+") + r"\b",
                             no_comments, re.IGNORECASE), "unsafe SQL token: " + token
    assert len(re.findall(r"\bCREATE\s+TABLE\b", no_comments, re.IGNORECASE)) == 5
    assert len(re.findall(r"\bCREATE\s+TRIGGER\b", no_comments, re.IGNORECASE)) == 4
    assert len(re.findall(r"\bCREATE\s+INDEX\b", no_comments, re.IGNORECASE)) == 1

validate_ddl_only(sql)
for malicious in ("INSERT INTO tenants(id) VALUES ('evil');",
                  "DROP TABLE tenants;",
                  "ATTACH DATABASE 'other.db' AS other;",
                  "UPDATE finance_customers SET status='inactive';"):
    try:
        validate_ddl_only(sql + "\n" + malicious)
    except AssertionError:
        pass
    else:
        raise AssertionError("unsafe additional SQL command accepted: " + malicious)

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(sql)
rows = db.execute(
    "SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
).fetchall()
tables = {name for kind, name in rows if kind == "table"}
triggers = {name for kind, name in rows if kind == "trigger"}
indexes = {name for kind, name in rows if kind == "index"}
assert tables == set(manifest["expectedTables"]), tables
assert triggers == set(manifest["expectedTriggers"]), triggers
assert indexes == set(manifest["expectedIndexes"]), indexes
for table in tables:
    assert db.execute("SELECT count(*) FROM " + table).fetchone()[0] == 0
assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
before = sorted(rows)
try:
    db.executescript(sql)
except sqlite3.OperationalError as e:
    assert "already exists" in str(e), str(e)
else:
    raise AssertionError("schema reapplication must fail closed")
assert sorted(db.execute(
    "SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
).fetchall()) == before
assert all(db.execute("SELECT count(*) FROM " + t).fetchone()[0] == 0 for t in tables)
db.close()
print("PASS isolated-account schema plan: 5 empty app tables, 4 triggers, "
      "1 index, 4 denied DML/tamper cases, no reapply, no remote API; "
      "raw_sql_sha256=" + digest)
