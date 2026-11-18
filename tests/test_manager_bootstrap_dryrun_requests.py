"""No-network contract tests for first-version bootstrap redacted dry-run."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/manager-bootstrap-dryrun-requests.py"
SPEC = importlib.util.spec_from_file_location("bootstrap_dryrun", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class ManagerBootstrapDryRunTests(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.root = pathlib.Path(t.name)
        worker = self.root / "cloudflare" / "src" / "worker.js"
        worker.parent.mkdir(parents=True)
        worker.write_bytes(b"approved")
        (self.root / "cloudflare" / "wrangler.manager-invitations-functional-staging.toml").write_text("stub")
        (self.root / "public").mkdir()
        self.cfg = {
            "name": mod.WORKER,
            "d1_databases": [{"database_id": mod.DB}],
            "vars": {"MANAGER_ACCESS_REQUESTS_ENABLED": "false", "THEBE_AI_EXPORTS_ENABLED": "false"},
            "compatibility_date": "2026-09-03",
            "assets": {
                "html_handling": "auto-trailing-slash",
                "not_found_handling": "404-page",
                "run_worker_first": ["/auth", "/api/*"],
            },
        }
    def patches(self):
        import contextlib
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(mock.patch.object(mod.manifest_mod, "hash_file", return_value=mod.manifest_mod.WORKER_SHA256))
        stack.enter_context(mock.patch.object(mod.manifest_mod, "validate_config", return_value=self.cfg))
        stack.enter_context(mock.patch.object(mod.manifest_mod, "build_manifest", return_value={f"/asset{i}": {} for i in range(278)}))
        return stack

    def test_only_dry_run_post_paths_never_deploy(self):
        self.patches()
        report = mod.create_redacted_plan(self.root)
        self.assertEqual(len(report["operations"]), 4)
        self.assertTrue(all(op["method"] == "POST" for op in report["operations"]))
        self.assertFalse(any("/deployments" in op["path"] for op in report["operations"]))
        self.assertTrue(report["require_separate_live_bootstrap_approval"])
        self.assertNotIn("token", report.keys())
        self.assertEqual(report["mode"], "DRY_RUN_ONLY_NO_NETWORK_NO_CLOUDFLARE_WRITE")

    def test_activation_flag_rejected(self):
        self.patches()
        self.cfg["vars"]["MANAGER_ACCESS_REQUESTS_ENABLED"] = "true"
        with self.assertRaisesRegex(ValueError, "activation flag"):
            mod.create_redacted_plan(self.root)

    def test_wrong_database_rejected(self):
        self.patches()
        self.cfg["d1_databases"][0]["database_id"] = "production"
        with self.assertRaisesRegex(ValueError, "unreviewed"):
            mod.create_redacted_plan(self.root)

    def test_routes_rejected(self):
        self.patches()
        self.cfg["routes"] = ["example.com/*"]
        with self.assertRaisesRegex(ValueError, "forbidden"):
            mod.create_redacted_plan(self.root)

    def test_tampered_worker_rejected(self):
        self.patches()
        with mock.patch.object(mod.manifest_mod, "hash_file", return_value="0" * 64):
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                mod.create_redacted_plan(self.root)

    def test_missing_assets_rejected(self):
        self.patches()
        with mock.patch.object(mod.manifest_mod, "build_manifest", return_value={"/404.html": {}}):
            with self.assertRaisesRegex(ValueError, "incomplete"):
                mod.create_redacted_plan(self.root)

if __name__ == "__main__":
    unittest.main()
