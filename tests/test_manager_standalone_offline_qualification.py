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

if __name__=="__main__":
    unittest.main()
