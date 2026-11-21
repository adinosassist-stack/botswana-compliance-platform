"""Offline-only negative contracts for the independently approved no-ingress runner."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "manager_no_ingress_runner", ROOT / "scripts/manager-private-no-ingress-deploy.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
FIXTURE = json.loads(
    (ROOT / "tests/fixtures/manager-private-activation-inventory.json").read_text())


class FakeCloudflare:
    """Mocked account/zone replies; NEVER sends network requests."""
    def __init__(self):
        s = copy.deepcopy(FIXTURE)
        a = m.ACCOUNT_PATH
        z = m.ZONE_PATH
        self.posts = []
        self.deployed = False
        self.values = {
            z: {**s["zone"], "account": {"id": m.q.ACCOUNT}},
            "/zones?account.id=" + m.q.ACCOUNT: [s["zone"]],
            a + "/workers/workers/" + m.q.WORKER_ID: {
                "id": m.q.WORKER_ID, "name": m.q.WORKER_NAME, "deployed_on": None},
            m.VERSION_PATH: s["worker"]["versions"],
            m.DEPLOY_PATH: [],
            a + "/workers/scripts/" + m.q.WORKER_NAME + "/subdomain": {
                "enabled": False, "previews_enabled": False},
            a + "/workers/domains": [],
            z + "/workers/routes": [],
            z + "/dns_records": [],
            a + "/access/apps": [{
                **{k: s["access"]["app"][k] for k in
                   ("id", "domain", "destinations", "allowed_idps")},
                "policies": [{"id": m.q.POLICY_ID}],
            }],
            a + "/access/policies": s["access"]["policies"],
            a + "/access/organizations": {"deny_unmatched_requests": True},
            a + "/d1/database/" + m.q.D1: {
                **s["d1"], "read_replication": {"mode": "disabled"}},
            a + "/d1/database/" + m.q.D1 + "/time_travel/bookmark":
                {"bookmark": "synthetic-mock-bookmark-only"},
            m.VERSION_PATH + "/" + m.q.CANDIDATE: {
                **s["candidate"], "main_module": "worker.js",
                "compatibility_date": "2026-09-03"},
        }

    def request(self, method, path, body=None):
        if method == "GET":
            if path not in self.values:
                raise AssertionError("unexpected GET " + path)
            return copy.deepcopy(self.values[path])
        if method == "POST":
            if path != m.DEPLOY_PATH or self.deployed:
                raise AssertionError("unapproved or repeated remote mutation")
            assert body == m.payload()
            self.deployed = True
            self.posts.append((path, body))
            self.values[path] = [{
                "id": "a118f123-00e0-4a01-9ee4-778899aa5555",
                "versions": [{"version_id": m.q.CANDIDATE, "percentage": 100}]}]
            return {"id": "a118f123-00e0-4a01-9ee4-778899aa5555"}
        raise AssertionError("unexpected method")


class ManagerDeploymentTests(unittest.TestCase):
    def comment(self, username, num, sha):
        payload = "\n".join([
            m.ACTION, m.ACK, m.q.NO_PRODUCTION, sha, m.q.CANDIDATE,
            m.q.WORKER_SHA256, m.q.MANIFEST_SHA256, m.q.ACCOUNT,
            m.q.ZONE, m.q.D1, m.q.HOST, str(m.UPLOAD_RUN),
        ])
        return {"id": num, "user": {"login": username},
                "issue_url": m.GH_API + "/issues/2599", "body": payload}

    def test_requires_distinct_exact_scope_owner_reviewer(self):
        sha = "d51c8571eeb4eda49e9bb78da3c9789e5de1efbc"
        o, r = self.comment("adinosassist-stack", 20, sha), self.comment("thusico", 21, sha)
        self.assertTrue(m.validate_comments(o, r, sha))
        for which, mutate in [
            ("same ID", lambda x: x.update(id=20)),
            ("wrong user", lambda x: x["user"].update(login="adinosassist-stack")),
            ("stale sha", lambda x: x.update(body=x["body"].replace(sha, "a"*40))),
            ("upload-only", lambda x: x.update(body=x["body"].replace(m.ACTION, "APPROVE_MANAGER_PRIVATE_CANDIDATE_VERSION_ONLY"))),
            ("wrong scope", lambda x: x.update(body=x["body"].replace(m.ACK, "CREATE_ROUTE"))),
            ("foreign issue", lambda x: x.update(issue_url=m.GH_API+"/issues/100")),
            ("request changes", lambda x: x.update(body=x["body"]+"\nREQUEST CHANGES")),
        ]:
            with self.subTest(which=which):
                bad = copy.deepcopy(r)
                mutate(bad)
                with self.assertRaises(m.Denied):
                    m.validate_comments(o, bad, sha)

    def test_runtime_requires_exact_main_owner_workflow(self):
        sha = "d51c8571eeb4eda49e9bb78da3c9789e5de1efbc"
        env = {
            "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REPOSITORY": m.q.REPO, "GITHUB_ACTOR": "adinosassist-stack",
            "GITHUB_REF": "refs/heads/main", "GITHUB_SHA": sha,
            "GITHUB_WORKFLOW_REF": m.q.REPO+"/"+m.WORKFLOW+"@refs/heads/main",
            "GH_TOKEN": "synthetic-no-access-token",
        }
        def fake_get(_token, path):
            if path == "/branches/main":
                return {"commit": {"sha": sha}}
            return {"status": "completed", "conclusion": "success",
                    "head_sha": m.q.CANDIDATE_SOURCE_SHA,
                    "actor": {"login": "adinosassist-stack"}}
        with patch.object(m, "github_get", side_effect=fake_get):
            m.validate_runtime(env, sha)
            for field, value in (("GITHUB_EVENT_NAME","pull_request"),
                                 ("GITHUB_REF","refs/heads/another"),
                                 ("GITHUB_ACTOR","thusico"),
                                 ("GITHUB_WORKFLOW_REF","different")):
                bad = dict(env, **{field:value})
                with self.subTest(field=field), self.assertRaises(m.Denied):
                    m.validate_runtime(bad, sha)
        with patch.object(m, "github_get", return_value={"commit":{"sha":"a"*40}}):
            with self.assertRaises(m.Denied):
                m.validate_runtime(env, sha)

    def test_live_inventory_mock_readonly(self):
        client = FakeCloudflare()
        self.assertTrue(m.inventory(client))
        self.assertFalse(client.posts)

    def test_bad_inventory_denied_before_post(self):
        changes = {
            "unexpected DNS": (m.ZONE_PATH+"/dns_records", [{"name":m.q.HOST}]),
            "wildcard DNS": (m.ZONE_PATH+"/dns_records", [{"name":"*."+m.q.ZONE_NAME}]),
            "rogue route": (m.ZONE_PATH+"/workers/routes", [{"pattern":"*"}]),
            "already deployed": (m.DEPLOY_PATH, [{"id":"other"}]),
            "public URL": (m.ACCOUNT_PATH+"/workers/scripts/"+m.q.WORKER_NAME+"/subdomain", {"enabled":True, "previews_enabled":False}),
            "wrong D1": (m.ACCOUNT_PATH+"/d1/database/"+m.q.D1, {"uuid":"bad", "num_tables":13, "read_replication":{"mode":"disabled"}}),
            "no recovery proof": (m.ACCOUNT_PATH+"/d1/database/"+m.q.D1+"/time_travel/bookmark", {"bookmark":""}),
            "wrong zone owner": (m.ZONE_PATH, {**FIXTURE["zone"],"account":{"id":"production"}}),
        }
        for label, (path, value) in changes.items():
            with self.subTest(label=label):
                client = FakeCloudflare()
                client.values[path] = value
                with self.assertRaises((m.Denied, m.q.QualificationError)):
                    m.inventory(client)
                self.assertFalse(client.posts)

    def test_one_exact_deployment_and_zero_ingress_postflight(self):
        client = FakeCloudflare()
        self.assertTrue(m.inventory(client))
        res = client.request("POST", m.DEPLOY_PATH, body=m.payload())
        receipt = m.postflight(client, res["id"])
        self.assertEqual(receipt["status"], "PINNED_CANDIDATE_DEPLOYED_ZERO_INGRESS")
        self.assertFalse(receipt["private_login_live"])
        self.assertFalse(receipt["production_changed"])
        self.assertEqual(len(client.posts), 1)
        client.values[m.ZONE_PATH+"/workers/routes"] = [{"pattern":"*"}]
        with self.assertRaises(m.Denied):
            m.postflight(client, res["id"])

    def test_missing_explicit_inputs_do_not_consult_cloudflare(self):
        class Args:
            execute_pinned_candidate = True
            authorization = "invalid"
            no_ingress_ack = m.ACK
            candidate_version = m.q.CANDIDATE
            exact_main_sha = "d51c8571eeb4eda49e9bb78da3c9789e5de1efbc"
            owner_comment_id = 1
            reviewer_comment_id = 2
        with self.assertRaises(m.Denied):
            m.execute(Args(), {}, client_factory=lambda token: (_ for _ in ()).throw(
                AssertionError("Cloudflare client must not be instantiated")))


if __name__ == "__main__":
    unittest.main()
