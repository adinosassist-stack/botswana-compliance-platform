"""Synthetic-only tests: protected Manager Worker runner must deny unsafe requests."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "manager_standalone_protected_runner",
    ROOT / "scripts/manager-standalone-protected-runner.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def environment(sha="a" * 40):
    return {
        "GITHUB_ACTIONS": "true",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REPOSITORY": mod.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_SHA": sha,
        "GITHUB_ACTOR": "adinosassist-stack",
        "GITHUB_WORKFLOW_REF": mod.REPO + "/" + mod.WORKFLOW + "@refs/heads/main",
        "CLOUDFLARE_ACCOUNT_ID": mod.ACCOUNT,
        "MANAGER_STAGING_EXECUTION_MODE": "FIRST_VERSION_ONLY_NO_DEPLOY",
        "GH_TOKEN": "synthetic-github-read-token",
        "MANAGER_STANDALONE_WORKER_TOKEN": "synthetic-cloudflare-staging-token",
    }


def comments(sha="a" * 40):
    body = "\n".join((
        mod.ACTION, sha, mod.MANIFEST_SHA256, mod.WORKER_SHA256,
        mod.ACCOUNT, mod.D1, mod.APPROVAL_STAMP,
    ))
    return (
        {"id": 1001, "user": {"login": "adinosassist-stack"}, "body": body},
        {"id": 1002, "user": {"login": "thusico"}, "body": body},
    )


def args(sha="a" * 40):
    return SimpleNamespace(
        execute_approved=True, source_sha=sha,
        manifest_sha256=mod.MANIFEST_SHA256,
        owner_comment_id=1001, reviewer_comment_id=1002,
        prepared_artifacts="/synthetic",
    )


class ProtectedRunnerTests(unittest.TestCase):
    def test_positive_offline_approval_contract(self):
        owner, reviewer = comments()
        self.assertTrue(mod.verify_approvals(owner, reviewer, "a" * 40))
        self.assertTrue(mod.verify_runtime(environment(), "a" * 40))

    def test_identity_conditions_fail_closed(self):
        for k, value in (
            ("GITHUB_ACTOR", "thusico"),
            ("GITHUB_EVENT_NAME", "pull_request"),
            ("GITHUB_REF", "refs/heads/preview"),
            ("GITHUB_SHA", "b" * 40),
            ("GITHUB_WORKFLOW_REF", "wrong-workflow"),
            ("CLOUDFLARE_ACCOUNT_ID", "ddd23cab31928a4bb3d4998df9b26d1d"),
            ("MANAGER_STAGING_EXECUTION_MODE", "DEPLOY"),
        ):
            with self.subTest(field=k):
                e = environment()
                e[k] = value
                with self.assertRaises(mod.ProtectedRunnerError):
                    mod.verify_runtime(e, "a" * 40)

    def test_exact_reviewer_and_owner_pins_required(self):
        owner, reviewer = comments()
        for change in (
            {"user": {"login": "adinosassist-stack"}},
            {"body": "APPROVE_MANAGER_STANDALONE_FIRST_VERSION_ONLY_NO_DEPLOY"},
            {"body": reviewer["body"].replace(mod.D1, "wrong-database")},
            {"body": reviewer["body"].replace(mod.MANIFEST_SHA256, "0" * 64)},
            {"body": reviewer["body"] + "\nREQUEST CHANGES"},
        ):
            altered = dict(reviewer, **change)
            with self.subTest(change=change), self.assertRaises(mod.ProtectedRunnerError):
                mod.verify_approvals(owner, altered, "a" * 40)

    def test_only_approved_cloudflare_http_methods_and_exact_paths(self):
        allowed = [
            ("GET", mod.BASE + "/d1/database/" + mod.D1),
            ("GET", mod.BASE + "/access/policies"),
            ("GET", mod.BASE + "/workers/workers"),
            ("GET", mod.BASE + "/workers/workers/worker_12345678/versions/version_12345678"),
            ("POST", mod.BASE + "/workers/workers"),
            ("POST", mod.BASE + "/workers/scripts/" + mod.inert.WORKER + "/assets-upload-session"),
            ("POST", mod.BASE + "/workers/assets/upload?base64=true"),
            ("POST", mod.BASE + "/workers/workers/worker_12345678/versions?deploy=false"),
        ]
        for method, path in allowed:
            self.assertTrue(mod.CloudflareClient._allowed(method, path), (method, path))
        denied = [
            ("PUT", mod.BASE + "/workers/workers"),
            ("DELETE", mod.BASE + "/workers/workers/worker_12345678"),
            ("POST", mod.BASE + "/workers/workers/worker_12345678/versions"),
            ("POST", mod.BASE + "/workers/workers/worker_12345678/versions?deploy=true"),
            ("POST", mod.BASE + "/workers/scripts/" + mod.inert.WORKER + "/deployments"),
            ("POST", mod.BASE + "/access/apps"),
            ("POST", mod.BASE + "/workers/routes"),
            ("POST", mod.BASE + "/dns_records"),
            ("GET", mod.BASE + "/tokens"),
            ("GET", "/accounts/ddd23cab31928a4bb3d4998df9b26d1d/workers/workers"),
        ]
        for method, path in denied:
            self.assertFalse(mod.CloudflareClient._allowed(method, path), (method, path))

    def test_wrong_multipart_and_jwt_use_refuse_before_network(self):
        c = mod.CloudflareClient("synthetic-only-long-test-token")
        with mock.patch.object(mod, "_read_json") as read:
            with self.assertRaises(mod.ProtectedRunnerError):
                c.request("POST", mod.BASE + "/workers/workers", {"name": "x"}, jwt="JWT")
            with self.assertRaises(mod.ProtectedRunnerError):
                c.request("POST", mod.BASE + "/workers/workers", {}, multipart=True)
            with self.assertRaises(mod.ProtectedRunnerError):
                c.request("POST", mod.BASE + "/workers/assets/upload?base64=true", b"bad", jwt="JWT", multipart=True, content_type="application/json")
            read.assert_not_called()

    def test_no_execute_flag_denies_without_any_github_request(self):
        a = args()
        a.execute_approved = False
        with mock.patch.object(mod, "_github_comment") as fetch, mock.patch.object(mod.inert, "bootstrap_inert_record_and_version") as perform:
            with self.assertRaises(mod.ProtectedRunnerError):
                mod.run(a, environment())
            fetch.assert_not_called()
            perform.assert_not_called()

    def test_bad_second_approval_denies_before_cloudflare(self):
        owner, reviewer = comments()
        reviewer["body"] = reviewer["body"].replace(mod.WORKER_SHA256, "0" * 64)
        get = lambda token, cid: owner if cid == 1001 else reviewer
        with mock.patch.object(mod.inert, "bootstrap_inert_record_and_version") as perform:
            with self.assertRaises(mod.ProtectedRunnerError):
                mod.run(args(), environment(), get_comment=get)
            perform.assert_not_called()

    def test_synthetic_validated_path_calls_adapter_only_after_all_gates(self):
        owner, reviewer = comments()
        get = lambda token, cid: owner if cid == 1001 else reviewer
        receipt = {"account_id": mod.ACCOUNT, "original_worker_sha256": mod.WORKER_SHA256}
        with (
            mock.patch.object(mod.inert.offline, "qualify", return_value=receipt),
            mock.patch.object(mod.inert.offline.immutable, "build_manifest", return_value={"/404.html": {"hash": "f" * 32, "size": 1}}),
            mock.patch.object(mod.inert, "_hash_manifest", return_value=mod.MANIFEST_SHA256),
            mock.patch.object(mod, "CloudflareClient") as client,
            mock.patch.object(mod.inert, "bootstrap_inert_record_and_version", return_value={"status": "synthetic"}) as perform,
        ):
            result = mod.run(args(), environment(), get_comment=get)
        self.assertEqual(result["status"], "synthetic")
        client.assert_called_once_with("synthetic-cloudflare-staging-token")
        perform.assert_called_once()
        self.assertEqual(perform.call_args.args[2], mod.MANIFEST_SHA256)


if __name__ == "__main__":
    unittest.main()
