"""Offline-only tests for pinned standalone Manager Worker account verification."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("isolated_manager",ROOT/"scripts/manager-standalone-offline-qualification.py")
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class StandaloneQualificationTests(unittest.TestCase):
    def test_pinned_reviewed_config_is_valid_and_isolated(self):
        cfg=mod.qualified_config()
        self.assertEqual(cfg["account_id"],mod.ACCOUNT)
        self.assertEqual(cfg["d1_databases"][0]["database_id"],mod.D1)
        self.assertIs(cfg["workers_dev"],False)
        self.assertIs(cfg["preview_urls"],False)

    def test_config_drift_fails_without_cloudflare_calls(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/"new.toml"
            p.write_bytes(mod.CONFIG_PATH.read_bytes().replace(
                b'preview_urls = false',b'preview_urls = true'))
            with self.assertRaisesRegex(mod.QualificationError,"Git blob"):
                mod.qualified_config(p)

    def test_legacy_database_reference_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/"new.toml"
            p.write_bytes(mod.CONFIG_PATH.read_bytes().replace(
                mod.D1.encode(),mod.OLD_D1.encode()))
            with self.assertRaisesRegex(mod.QualificationError,"Git blob"):
                mod.qualified_config(p)

    def test_unmodified_exact_binary_and_assets_are_required(self):
        with tempfile.TemporaryDirectory() as td:
            package=pathlib.Path(td)
            worker=package/"cloudflare/src/worker.js"
            worker.parent.mkdir(parents=True)
            worker.write_bytes(b"not approved")
            (package/"public").mkdir()
            with self.assertRaisesRegex(mod.QualificationError,"Worker binary"):
                mod.qualify(package)

    def test_qualified_original_binary_and_assets_offline(self):
        with tempfile.TemporaryDirectory() as td:
            package=pathlib.Path(td)
            worker=package/"cloudflare/src/worker.js"
            worker.parent.mkdir(parents=True)
            worker.write_bytes(b"simulated")
            (package/"public").mkdir()
            mock_manifest={f"/asset{i}.html":{"hash":f"{i:032x}","size":1} for i in range(277)}
            mock_manifest["/404.html"]={"hash":"f"*32,"size":1}
            with mock.patch.object(mod.immutable,"hash_file",return_value=mod.immutable.WORKER_SHA256),mock.patch.object(mod.immutable,"build_manifest",return_value=mock_manifest):
                report=mod.qualify(package)
            self.assertEqual(report["account_id"],mod.ACCOUNT)
            self.assertEqual(report["database_id"],mod.D1)
            self.assertEqual(report["assets_count"],278)
            self.assertTrue(report["requires_separate_schema_apply_and_recovery_approval"])
            self.assertTrue(report["requires_new_account_access_approval"])
            self.assertIn("NO_NETWORK",report["mode"])


plan_spec = importlib.util.spec_from_file_location(
    "isolated_manager_first_version_plan",
    ROOT / "scripts/manager-standalone-first-version-dryrun.py",
)
plan_mod = importlib.util.module_from_spec(plan_spec)
plan_spec.loader.exec_module(plan_mod)


class StandaloneFirstVersionDryRunTests(unittest.TestCase):
    """Review-only, no-network request plan must fail closed on any drift."""

    @staticmethod
    def report():
        return {
            "mode": "OFFLINE_ISOLATED_ACCOUNT_QUALIFICATION_NO_NETWORK_NO_WRITES",
            "account_id": plan_mod.ACCOUNT,
            "database_id": plan_mod.D1,
            "worker": plan_mod.NAME,
            "config_blob_sha1": plan_mod.CONFIG_BLOB,
            "original_worker_sha256": plan_mod.WORKER_SHA256,
            "assets_count": 278,
            "preview_urls_enabled": False,
            "public_worker_enabled": False,
            "requires_independent_version_bootstrap_approval": True,
        }

    @staticmethod
    def manifest():
        items = {f"/asset{i}.html": {"hash": f"{i:032x}", "size": 1} for i in range(277)}
        items["/404.html"] = {"hash": "f" * 32, "size": 1}
        return items

    def test_only_isolated_undeployed_offline_steps(self):
        result = plan_mod.plan(self.report(), self.manifest())
        self.assertEqual(result["status"], "REVIEW_ONLY_NO_LIVE_EXECUTION")
        self.assertEqual(result["account_id"], plan_mod.ACCOUNT)
        self.assertEqual(len(result["manifest_sha256"]), 64)
        self.assertEqual(result["assets_count"], 278)
        self.assertEqual([x["sequence"] for x in result["steps"]], [1, 2, 3, 4])
        self.assertTrue(result["steps"][-1]["path"].endswith("/versions?deploy=false"))
        self.assertTrue(all(x["method"] == "POST" for x in result["steps"]))
        self.assertFalse(result["expected_no_ingress"]["workers_dev"])
        self.assertNotIn(plan_mod.LEGACY_PRODUCTION_ACCOUNT, str(result))
        self.assertIn("NO_HTTP", result["mode"])

    def test_wrong_database_account_and_artifact_fail_closed(self):
        for name, change in [
            ("account_id", "ddd23cab31928a4bb3d4998df9b26d1d"),
            ("database_id", "518a9e33-b2ba-4204-ac52-aae4150a7b52"),
            ("worker", "other-worker"),
            ("config_blob_sha1", "0" * 40),
            ("original_worker_sha256", "0" * 64),
            ("assets_count", 277),
            ("preview_urls_enabled", True),
            ("public_worker_enabled", True),
            ("requires_independent_version_bootstrap_approval", False),
        ]:
            with self.subTest(field=name):
                report = self.report()
                report[name] = change
                with self.assertRaisesRegex(plan_mod.ReviewPlanError, "qualification mismatch"):
                    plan_mod.plan(report, self.manifest())

    def test_incomplete_or_invalid_assets_fail_closed(self):
        manifest = self.manifest()
        manifest.pop("/404.html")
        with self.assertRaisesRegex(plan_mod.ReviewPlanError, "manifest incomplete"):
            plan_mod.plan(self.report(), manifest)
        manifest = self.manifest()
        manifest["/404.html"] = {"hash": "NOT_A_HASH", "size": 1}
        with self.assertRaisesRegex(plan_mod.ReviewPlanError, "digest or size"):
            plan_mod.plan(self.report(), manifest)

    def test_unapproved_source_provenance_fails_closed(self):
        report = self.report()
        report["mode"] = "POSSIBLY_NETWORK_CAPABLE"
        with self.assertRaisesRegex(plan_mod.ReviewPlanError, "provenance"):
            plan_mod.plan(report, self.manifest())

if __name__=="__main__":
    unittest.main()
