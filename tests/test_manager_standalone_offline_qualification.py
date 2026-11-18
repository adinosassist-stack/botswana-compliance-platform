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


_inert_spec = importlib.util.spec_from_file_location(
    "standalone_manager_inert_transport",
    ROOT / "scripts/manager-standalone-inert-version-transport.py",
)
inert = importlib.util.module_from_spec(_inert_spec)
_inert_spec.loader.exec_module(inert)


class StandaloneInertTransportTests(unittest.TestCase):
    """Synthetic API adapter only; no Cloudflare credentials or network."""

    class FakeClient:
        def __init__(self):
            self.calls = []
            self.created = False
            self.public = False
            self.preexisting = False
            self.missing_completion = False

        def request(self, method, path, body=None, jwt=None, multipart=False):
            self.calls.append((method, path))
            b = inert.BASE
            worker = {
                "id": "worker_12345678", "name": inert.WORKER, "deployed_on": None,
                "subdomain": {"enabled": self.public, "previews_enabled": False},
            }
            if method == "GET":
                routes = {
                    b + "/d1/database/" + inert.DATABASE: {
                        "uuid": inert.DATABASE,
                        "name": "bw-manager-invitations-synthetic-staging",
                        "num_tables": 13, "read_replication": {"mode": "disabled"},
                    },
                    b + "/access/organizations": {
                        "deny_unmatched_requests": True, "strict_service_token_auth": True,
                    },
                    b + "/access/policies": [{
                        "id": inert.POLICY_ID, "app_count": 0,
                        "decision": "allow", "include": [{"email": {"email": inert.TESTER}}],
                        "exclude": [], "require": [],
                    }],
                    b + "/access/identity_providers": [{"id": inert.IDP_ID, "type": "onetimepin"}],
                    b + "/access/apps": [],
                    b + "/workers/workers": [worker] if (self.created or self.preexisting) else [],
                    b + "/workers/scripts": [],
                    b + "/workers/domains": [],
                    b + "/workers/workers/worker_12345678": worker,
                    b + "/workers/workers/worker_12345678/versions": [
                        {"id": "version_12345678", "deployed_on": None},
                    ],
                    b + "/workers/scripts/" + inert.WORKER + "/deployments": [],
                    b + "/workers/scripts/" + inert.WORKER + "/subdomain": {"enabled": False},
                }
                if path not in routes:
                    raise AssertionError("unexpected GET path " + path)
                return routes[path]
            if method != "POST":
                raise AssertionError("unsafe non-POST write")
            if path == b + "/workers/workers":
                self.created = True
                return worker
            if path == b + "/workers/scripts/" + inert.WORKER + "/assets-upload-session":
                if self.missing_completion:
                    return {"jwt": "session-jwt", "buckets": [["0" * 32]]}
                return {"jwt": "complete-jwt", "buckets": []}
            if path == b + "/workers/assets/upload?base64=true":
                return {"jwt": None if self.missing_completion else "upload-final-jwt"}
            if path == b + "/workers/workers/worker_12345678/versions?deploy=false":
                return {"id": "version_12345678", "deployed_on": None}
            raise AssertionError("unexpected POST path " + path)

    @staticmethod
    def manifest():
        m = {f"/asset{i}.html": {"hash": f"{i:032x}", "size": 1} for i in range(277)}
        m["/404.html"] = {"hash": "f" * 32, "size": 1}
        return m

    @staticmethod
    def qualification():
        return {
            "account_id": inert.ACCOUNT,
            "database_id": inert.DATABASE,
            "original_worker_sha256": inert.WORKER_SHA256,
        }

    @staticmethod
    def config():
        return {
            "compatibility_date": "2026-09-03",
            "vars": {"MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED": "false"},
            "assets": {
                "html_handling": "auto-trailing-slash", "not_found_handling": "404-page",
                "run_worker_first": ["/auth", "/auth/*", "/api/*", "/manager-invite/*"],
            },
        }

    def invoke(self, client, root):
        manifest = self.manifest()
        with (
            mock.patch.object(inert.offline, "qualify", return_value=self.qualification()),
            mock.patch.object(inert.offline, "qualified_config", return_value=self.config()),
            mock.patch.object(inert.offline.immutable, "build_manifest", return_value=manifest),
            mock.patch.object(inert.offline.immutable, "hash_file", return_value=inert.WORKER_SHA256),
        ):
            return inert.bootstrap_inert_record_and_version(
                client, root, inert._hash_manifest(manifest)
            )

    def test_inert_first_version_uses_only_isolated_paths_and_never_deploys(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            worker = root / "cloudflare/src/worker.js"
            worker.parent.mkdir(parents=True)
            worker.write_bytes(b"synthetic-compiled-worker")
            client = self.FakeClient()
            report = self.invoke(client, root)
        self.assertEqual(report["status"], "FIRST_VERSION_UNDEPLOYED_POSTFLIGHT_PASS")
        writes = [path for method, path in client.calls if method == "POST"]
        self.assertEqual(len(writes), 3)
        self.assertTrue(all(path.startswith(inert.BASE + "/") for path in writes))
        self.assertTrue(writes[-1].endswith("/versions?deploy=false"))
        self.assertFalse(any("/deployments" in path for path in writes))
        self.assertFalse(report["workers_dev"])
        self.assertFalse(report["preview_urls"])

    def test_existing_worker_refuses_all_writes(self):
        client = self.FakeClient()
        client.preexisting = True
        with self.assertRaisesRegex(inert.FirstVersionGateError, "already exists"):
            inert.preflight(client)
        self.assertFalse(any(method == "POST" for method, _ in client.calls))

    def test_detached_access_is_required(self):
        class WrongPolicy(self.FakeClient):
            def request(self, method, path, **kwargs):
                result = super().request(method, path, **kwargs)
                if method == "GET" and path.endswith("/access/policies"):
                    result[0]["app_count"] = 1
                return result
        client = WrongPolicy()
        with self.assertRaisesRegex(inert.FirstVersionGateError, "policy mismatch"):
            inert.preflight(client)
        self.assertFalse(any(method == "POST" for method, _ in client.calls))

    def test_missing_asset_completion_token_prevents_version(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            worker = root / "cloudflare/src/worker.js"
            worker.parent.mkdir(parents=True)
            worker.write_bytes(b"synthetic-compiled-worker")
            public = root / "public"
            public.mkdir()
            (public / "asset10.html").write_bytes(b"synthetic")
            (public / "asset0.html").write_bytes(b"synthetic")
            client = self.FakeClient()
            client.missing_completion = True
            with self.assertRaisesRegex(inert.FirstVersionGateError, "completion token"):
                self.invoke(client, root)
        self.assertFalse(any("/versions" in path and method == "POST" for method, path in client.calls))

    def test_manifest_approval_drift_blocks_before_any_api_call(self):
        client = self.FakeClient()
        with self.assertRaisesRegex(inert.FirstVersionGateError, "manifest differs"):
            with (
                mock.patch.object(inert.offline, "qualify", return_value=self.qualification()),
                mock.patch.object(inert.offline, "qualified_config", return_value=self.config()),
                mock.patch.object(inert.offline.immutable, "build_manifest", return_value=self.manifest()),
            ):
                inert.bootstrap_inert_record_and_version(client, pathlib.Path("/nonexistent"), "0" * 64)
        self.assertEqual(client.calls, [])

    def test_unsafe_new_record_refuses_asset_upload(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            worker = root / "cloudflare/src/worker.js"
            worker.parent.mkdir(parents=True)
            worker.write_bytes(b"synthetic-compiled-worker")
            client = self.FakeClient()
            client.public = True
            with self.assertRaisesRegex(inert.FirstVersionGateError, "public or preview"):
                self.invoke(client, root)
        writes = [path for method, path in client.calls if method == "POST"]
        self.assertEqual(writes, [inert.BASE + "/workers/workers"])

if __name__=="__main__":
    unittest.main()
