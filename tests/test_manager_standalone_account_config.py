"""Fail-closed regression checks for the dedicated Cloudflare manager staging account."""
from pathlib import Path
import tomllib
import unittest

ROOT=Path(__file__).resolve().parents[1]
EXPECTED_ACCOUNT="f585813fa376f7c71c7d4a79254168fa"
EXPECTED_D1="1a2fc702-2592-491c-9f55-80e032a56dd8"
OLD_ACCOUNT_D1="518a9e33-b2ba-4204-ac52-aae4150a7b52"
CONFIG=ROOT/"cloudflare/wrangler.manager-standalone-account-staging.toml"

class ManagerStandaloneAccountTests(unittest.TestCase):
    def test_isolated_account_and_db_are_explicit(self):
        obj=tomllib.loads(CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(obj["account_id"],EXPECTED_ACCOUNT)
        self.assertEqual(obj["name"],"bw-manager-invitations-functional-private-staging")
        self.assertEqual(obj["d1_databases"],[{"binding":"DB","database_name":"bw-manager-invitations-synthetic-staging","database_id":EXPECTED_D1}])
        self.assertNotIn(OLD_ACCOUNT_D1,CONFIG.read_text())

    def test_no_public_or_preview_routing(self):
        obj=tomllib.loads(CONFIG.read_text(encoding="utf-8"))
        self.assertIs(obj["workers_dev"],False)
        self.assertIs(obj["preview_urls"],False)
        for forbidden in ("routes","route","triggers","services","r2_buckets","kv_namespaces"):
            self.assertNotIn(forbidden,obj)
        self.assertEqual(obj["vars"]["PUBLIC_ORIGIN"],"")
        self.assertEqual(obj["vars"]["PUBLIC_APP_URL"],"")

    def test_activation_and_external_services_off(self):
        obj=tomllib.loads(CONFIG.read_text(encoding="utf-8"))
        vars=obj["vars"]
        self.assertEqual(vars["REGISTRATION_MODE"],"hold")
        for flag in (
            "MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED",
            "MANAGER_INVITATIONS_SCHEMA_READY",
            "MANAGER_INVITATIONS_ACCESS_READY",
            "MANAGER_ACCESS_REQUESTS_ENABLED",
            "MANAGER_ACCESS_PROVISIONING_ENABLED",
            "EVIDENCE_UPLOADS_ENABLED",
            "THEBE_GENERAL_AI_ENABLED",
            "THEBE_AI_EXPORTS_ENABLED",
            "POP_UPLOAD_STAGING_ENABLED",
        ):
            self.assertEqual(vars[flag],"false",flag)
        self.assertEqual(vars["PAYMENT_PROVIDER"],"none")

    def test_no_unreviewed_changes_from_prior_manager_config(self):
        old=tomllib.loads((ROOT/"cloudflare/wrangler.manager-invitations-functional-staging.toml").read_text())
        new=tomllib.loads(CONFIG.read_text())
        old["account_id"]=EXPECTED_ACCOUNT
        old["d1_databases"][0]["database_id"]=EXPECTED_D1
        self.assertEqual(new,old)

    def test_legacy_workflow_never_runs_mutating_job(self):
        workflow=(ROOT/".github/workflows/manager-protected-version-only-upload.yml").read_text()
        self.assertIn("version-only:\n    if: ${{ false }}",workflow)
        self.assertIn("offline-qualification:",workflow)

if __name__=="__main__":
    unittest.main()
