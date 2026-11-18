"""Offline Cloudflare manager first-version protocol contract tests."""
import importlib.util
import pathlib
import unittest

SRC = pathlib.Path(__file__).resolve().parents[1] / "scripts/manager-bootstrap-api-contract.py"
SPEC = importlib.util.spec_from_file_location("manager_bootstrap_api_contract", SRC)
contract = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(contract)

def worker(**changes):
    result = {
        "id": "worker_12345678",
        "name": contract.NAME,
        "deployed_on": None,
        "subdomain": {"enabled": False, "previews_enabled": False},
    }
    result.update(changes)
    return result

def manifest():
    return {f"/a{i:03}.html": {"hash": f"{i:032x}", "size": i}
            for i in range(contract.EXPECTED_ASSETS)}

class CloudflareManagerFirstVersionContractTests(unittest.TestCase):
    def test_inert_worker_passes(self):
        self.assertEqual(contract.verify_worker_record(worker()), "worker_12345678")

    def test_rejects_wrong_worker(self):
        with self.assertRaisesRegex(ValueError, "incorrect Worker"):
            contract.verify_worker_record(worker(name="thebe-production"))

    def test_rejects_existing_deployment(self):
        with self.assertRaisesRegex(ValueError, "already deployed"):
            contract.verify_worker_record(worker(deployed_on="2026-11-18T00:00:00Z"))

    def test_rejects_public_or_preview_url(self):
        for setting in ({"enabled": True, "previews_enabled": False},
                        {"enabled": False, "previews_enabled": True}):
            with self.subTest(setting=setting), self.assertRaisesRegex(ValueError, "public or preview"):
                contract.verify_worker_record(worker(subdomain=setting))

    def test_rejects_unknown_subdomain(self):
        with self.assertRaisesRegex(ValueError, "status missing"):
            contract.verify_worker_record(worker(subdomain=None))

    def test_valid_upload_session_and_no_upload_session(self):
        m = manifest()
        result = contract.verify_assets_session({"jwt": "synthetic", "buckets": []}, m)
        self.assertTrue(result["completion_token_available"])
        self.assertEqual(result["uploads_required"], 0)
        upload = contract.verify_assets_session({"jwt": "synthetic", "buckets": [[m["/a001.html"]["hash"]]]}, m)
        self.assertEqual(upload["uploads_required"], 1)
        self.assertFalse(upload["completion_token_available"])

    def test_rejects_unknown_asset_requested_by_api(self):
        with self.assertRaisesRegex(ValueError, "unrecognized"):
            contract.verify_assets_session({"jwt": "synthetic", "buckets": [["f" * 32]]}, manifest())

    def test_rejects_incomplete_manifest(self):
        with self.assertRaisesRegex(ValueError, "incomplete"):
            contract.verify_assets_session({"jwt": "synthetic", "buckets": []}, {"/x": {}})

    def test_rejects_missing_completion_token(self):
        with self.assertRaisesRegex(ValueError, "token"):
            contract.verify_assets_session({"jwt": "", "buckets": []}, manifest())

    def test_first_undeployed_version_only(self):
        self.assertEqual(contract.verify_first_version(worker(), {"id": "version_12345678"}), "version_12345678")
        with self.assertRaisesRegex(ValueError, "unexpected version deployment"):
            contract.verify_first_version(worker(), {"id": "version_12345678", "deployed_on": "now"})

    def test_postflight_requires_zero_ingress_and_one_version(self):
        data = ([{"id": "version_12345678"}], [], [], [], [])
        self.assertEqual(contract.verify_postflight(worker(), *data), "version_12345678")
        for index in range(1, 5):
            args = [list(v) for v in data]
            args[index] = [{"name": "unexpected ingress"}]
            with self.subTest(index=index), self.assertRaisesRegex(ValueError, "deployment or public ingress"):
                contract.verify_postflight(worker(), *args)
        with self.assertRaisesRegex(ValueError, "exactly one"):
            contract.verify_postflight(worker(), [], [], [], [], [])

    def test_allowlist_excludes_deployment_dns_route_or_put(self):
        allowed = contract.permitted_method_path_pairs("worker_12345678")
        self.assertEqual(len(allowed), 4)
        self.assertTrue(all(method == "POST" for method, _ in allowed))
        self.assertFalse(any("/deployments" in path or "/dns_records" in path or "/routes" in path
                             for _, path in allowed))
        with self.assertRaisesRegex(ValueError, "invalid Worker"):
            contract.permitted_method_path_pairs("../production")

if __name__ == "__main__":
    unittest.main()
