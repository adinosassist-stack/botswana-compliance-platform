"""Synthetic-only tests for denied-by-default manager Cloudflare transport."""
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

SRC = pathlib.Path(__file__).resolve().parents[1] / "scripts/manager-bootstrap-inert-api-transport.py"
spec = importlib.util.spec_from_file_location("inert_manager_transport", SRC)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class TransportTests(unittest.TestCase):
    def test_rejects_unapproved_api_write_paths(self):
        requests = []
        def sender(req):
            requests.append(req)
            return 200, b'{"success":true,"result":{"ok":true}}'
        client = mod.Client("synthetic-test-token", sender)
        for path in (
            f"/accounts/{mod.ACCOUNT}/workers/scripts/production",
            f"/accounts/{mod.ACCOUNT}/workers/scripts/production/deployments",
            f"/accounts/{mod.ACCOUNT}/dns_records",
            f"/accounts/{mod.ACCOUNT}/workers/scripts/production/routes",
            "/accounts/other-account/workers/workers",
        ):
            with self.subTest(path=path), self.assertRaises(mod.ProtocolError):
                client.request("POST", path, {})
        self.assertEqual(requests, [])

    def test_no_put_delete_methods(self):
        client = mod.Client("synthetic", lambda r: (200, b'{"success":true,"result":{}}'))
        for method in ("PUT", "DELETE", "PATCH"):
            with self.assertRaises(mod.ProtocolError):
                client.request(method, f"/accounts/{mod.ACCOUNT}/workers/workers", {})

    def test_exact_version_endpoint_allowed_but_not_other_paths(self):
        requests = []
        def sender(req):
            requests.append(req.full_url)
            return 200, b'{"success":true,"result":{"id":"version_12345678"}}'
        client = mod.Client("synthetic", sender)
        client.request("POST", f"/accounts/{mod.ACCOUNT}/workers/workers/worker_12345678/versions", {})
        self.assertEqual(len(requests), 1)
        with self.assertRaises(mod.ProtocolError):
            client.request("POST", f"/accounts/{mod.ACCOUNT}/workers/workers/worker_12345678/versions/extra", {})

    def test_rejects_failed_or_ambiguous_api_response(self):
        for status, response in (
            (403,b'{"success":false,"result":null}'),
            (200,b'{"success":false,"result":{}}'),
            (200,b'not-json'),
        ):
            with self.subTest(status=status), self.assertRaises(mod.ProtocolError):
                mod.Client("synthetic", lambda r, s=status, b=response: (s,b)).request(
                    "GET",f"/accounts/{mod.ACCOUNT}/workers/workers")

    def test_bucket_base64_and_mime(self):
        with tempfile.TemporaryDirectory() as td:
            f = pathlib.Path(td) / "404.html"
            f.write_bytes(b"<p>safe</p>")
            encoded = mod.encode_bucket(["a" * 32], {"a" * 32: f})
        self.assertIn(b"Content-Type: text/html", encoded)
        self.assertIn(b"PHA+c2FmZTwvcD4=", encoded)
        self.assertNotIn(b"<p>safe</p>", encoded)

    def test_unknown_bucket_digest_denied(self):
        with self.assertRaises(mod.ProtocolError):
            mod.encode_bucket(["a" * 32], {})

    def test_absent_target_stops_before_any_write(self):
        calls = []
        class Fake:
            def request(self, method,path,body=None,**kw):
                calls.append((method,path))
                return [{"name":mod.NAME}]
        with mock.patch.object(mod,"prepare",return_value=({}, {}, {}, pathlib.Path("none"))):
            with self.assertRaises(mod.ProtocolError):
                mod.inert_bootstrap(Fake(),pathlib.Path("none"))
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][0],"GET")

    def test_new_record_with_public_endpoint_stops_before_asset_session(self):
        calls=[]
        class Fake:
            def request(self,method,path,body=None,**kw):
                calls.append((method,path))
                if method=="GET":return []
                return {"id":"worker_12345678","name":mod.NAME,"deployed_on":None,
                        "subdomain":{"enabled":True,"previews_enabled":False}}
        with mock.patch.object(mod,"prepare",return_value=({}, {}, {}, pathlib.Path("none"))):
            with self.assertRaisesRegex(ValueError,"public or preview"):
                mod.inert_bootstrap(Fake(),pathlib.Path("none"))
        self.assertEqual([x[0] for x in calls],["GET","POST"])

    def test_missing_final_assets_completion_jwt_blocks_version_write(self):
        calls = []
        fake_manifest = {f"/asset{i}.html": {"hash": f"{i:032x}", "size": i}
                         for i in range(278)}
        expected = fake_manifest["/asset1.html"]["hash"]
        class Fake:
            def request(self, method, path, body=None, **kw):
                calls.append((method, path))
                if method == "GET":
                    return []
                if path.endswith("/workers/workers"):
                    return {"id": "worker_12345678", "name": mod.NAME, "deployed_on": None,
                            "subdomain": {"enabled": False, "previews_enabled": False}}
                if path.endswith("/assets-upload-session"):
                    return {"jwt": "synthetic-session", "buckets": [[expected]]}
                if "assets/upload" in path:
                    return {"status": "accepted", "jwt": None}
                raise AssertionError("no version upload should occur")
        with tempfile.TemporaryDirectory() as td:
            f = pathlib.Path(td) / "asset1.html"
            f.write_bytes(b"same")
            fake_files = {expected: f}
            fake_config = {"vars": {}, "compatibility_date": "2026-09-03",
                           "assets": {"html_handling":"auto-trailing-slash",
                                      "not_found_handling":"404-page", "run_worker_first":[]}}
            prepared = (fake_config, fake_manifest, fake_files, f)
            with mock.patch.object(mod, "prepare", return_value=prepared):
                with self.assertRaisesRegex(mod.ProtocolError, "completion JWT"):
                    mod.inert_bootstrap(Fake(), pathlib.Path(td))
        self.assertEqual(sum("/versions" in path for _, path in calls), 0)

if __name__=="__main__":
    unittest.main()
