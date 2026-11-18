"""Offline synthetic manager schema dry-run; never connects to Cloudflare."""
import pathlib
import re
import sqlite3
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCHEMA=ROOT/"cloudflare/manager-standalone-synthetic-schema-review.sql"
TABLES={
    "audit_events","auth_rate_limits","daily_employee_reports","employees",
    "memberships","operating_locations","sessions","tenants","users",
    "workspace_manager_access_requests","workspace_manager_invites",
    "workspace_manager_location_grants","workspace_manager_request_codes",
}
INDEXES={
    "auth_rate_limits_expiry_idx","auth_rate_limits_scope_expiry_idx",
    "daily_employee_reports_employee_date_idx","daily_employee_reports_tenant_date_idx",
    "employees_tenant_status_idx","manager_access_one_pending_per_user_tenant",
    "manager_access_requests_owner_queue","manager_request_codes_scope",
    "operating_locations_by_tenant","sessions_user_idx",
    "workspace_manager_invites_expiration","workspace_manager_invites_tenant_email",
    "workspace_manager_location_grants_lookup",
}
class ManagerStandaloneSchemaTests(unittest.TestCase):
    def test_schema_only_13_tables_13_indexes_and_no_records(self):
        script=SCHEMA.read_text(encoding="utf-8")
        self.assertFalse(re.search(r"(?im)^\s*(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|ATTACH)\b",script))
        self.assertNotIn("CREATE TRIGGER",script.upper())
        with sqlite3.connect(":memory:") as db:
            db.executescript(script)
            rows=db.execute("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").fetchall()
            self.assertEqual({name for typ,name in rows if typ=="table"},TABLES)
            self.assertEqual({name for typ,name in rows if typ=="index"},INDEXES)
            for table in TABLES:
                self.assertEqual(db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0],0)
    def test_source_is_documented_but_not_applied(self):
        script=SCHEMA.read_text(encoding="utf-8")
        self.assertIn("NO CUSTOMER DATA",script)
        self.assertIn("1a2fc702-2592-491c-9f55-80e032a56dd8",script)
        self.assertIn("NEVER APPLY WITHOUT THUSICO REVIEW",script)

if __name__=="__main__":
    unittest.main()
