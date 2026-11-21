"""Upload one reviewed, undeployed version to the isolated Manager Worker."""
import argparse
import base64
import importlib.util
import json
import os
from pathlib import Path
import tomllib

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("protected_runner", HERE / "manager-standalone-protected-runner.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
transport = runner.inert

ACTION = "APPROVE_MANAGER_PRIVATE_CANDIDATE_VERSION_ONLY"
WORKFLOW = ".github/workflows/manager-private-candidate-upload.yml"
WORKER_ID = "a83242df903d4fb7b4ad5ea9e5a1a509"
BASE_VERSION = "cc509d3c-75d4-450a-acb1-e2ecdcb245d7"
HOST = "manager-staging.thebedesk-test.win"
ACCESS_APP = "fa020bbc-0407-40f0-873e-e79537dcf021"
CONFIG = HERE.parent / "cloudflare/wrangler.manager-private-browser-staging.toml"


def require(condition, message):
    if not condition:
        raise runner.ProtectedRunnerError(message)


def verified_config():
    config = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    expected = transport.offline.qualified_config()
    expected["vars"].update({
        "PUBLIC_ORIGIN": "https://" + HOST,
        "PUBLIC_APP_URL": "https://" + HOST,
        "MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED": "true",
        "MANAGER_INVITATIONS_SCHEMA_READY": "true",
        "MANAGER_INVITATIONS_ACCESS_READY": "true",
        "MANAGER_ACCESS_REQUESTS_ENABLED": "true",
    })
    require(config == expected, "candidate config differs from isolated staging contract")
    return config


def verify_isolation(client, version_ids):
    base = runner.BASE
    worker = base + "/workers/workers/" + WORKER_ID
    script = base + "/workers/scripts/" + transport.WORKER
    versions = transport._rows(client.request("GET", worker + "/versions"), "versions")
    require(len(versions) == len(version_ids) and {v["id"] for v in versions} == version_ids,
            "unexpected Worker version inventory")
    require(all(not v.get("deployed_on") for v in versions), "deployed version found")
    require(not transport._rows(client.request("GET", script + "/deployments"), "deployments"),
            "active deployment found")
    subdomain = client.request("GET", script + "/subdomain")
    require(subdomain.get("enabled") is False and subdomain.get("previews_enabled") is False,
            "public or preview ingress enabled or unknown")
    require(not transport._rows(client.request("GET", base + "/workers/domains"), "custom domains"),
            "Worker custom domain found")
    apps = client.request("GET", base + "/access/apps")
    require(len(apps) == 1 and apps[0].get("id") == ACCESS_APP and apps[0].get("domain") == HOST
            and [p.get("id") for p in apps[0].get("policies", [])] == [transport.POLICY_ID]
            and apps[0].get("allowed_idps") == [transport.IDP_ID]
            and apps[0].get("destinations") == [{"type": "public", "uri": HOST}],
            "exact staging Access app missing")
    policy = client.request("GET", base + "/access/policies")
    require(len(policy) == 1 and policy[0].get("id") == transport.POLICY_ID
            and policy[0].get("decision") == "allow"
            and policy[0].get("include") == [{"email": {"email": transport.TESTER}}]
            and policy[0].get("exclude") == [] and policy[0].get("require") == [],
            "single-tester Access policy differs")
    org = client.request("GET", base + "/access/organizations")
    require(org.get("deny_unmatched_requests") is True, "Access default deny missing")
    db = client.request("GET", base + "/d1/database/" + runner.D1)
    require(db.get("uuid") == runner.D1 and db.get("num_tables") == 13,
            "isolated D1 inventory differs")


def upload(args):
    env = os.environ
    require(all(env.get(k) == v for k, v in {
        "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REPOSITORY": runner.REPO, "GITHUB_ACTOR": "adinosassist-stack",
        "GITHUB_REF": "refs/heads/main", "GITHUB_SHA": args.source_sha,
        "GITHUB_WORKFLOW_REF": runner.REPO + "/" + WORKFLOW + "@refs/heads/main",
    }.items()), "candidate upload requires owner dispatch from exact main")
    require(args.owner_comment_id != args.reviewer_comment_id, "approval comments must differ")
    for comment_id, login in ((args.owner_comment_id, "adinosassist-stack"),
                              (args.reviewer_comment_id, "thusico")):
        comment = runner._github_comment(env["GH_TOKEN"], comment_id)
        body = comment.get("body") or ""
        require(comment.get("user", {}).get("login") == login
                and all(value in body for value in (
                    ACTION, args.source_sha, runner.MANIFEST_SHA256, runner.WORKER_SHA256,
                    runner.ACCOUNT, runner.D1, WORKER_ID, BASE_VERSION, HOST, runner.APPROVAL_STAMP,
                )) and "REQUEST CHANGES" not in body.upper(), "candidate approval does not match scope")
    config = verified_config()
    prepared = Path(args.prepared_artifacts)
    transport.offline.qualify(prepared)
    manifest = transport.offline.immutable.build_manifest(prepared / "public")
    require(len(manifest) == 278 and transport._hash_manifest(manifest) == runner.MANIFEST_SHA256,
            "immutable assets differ")
    worker = prepared / "cloudflare/src/worker.js"
    require(transport.offline.immutable.hash_file(worker) == runner.WORKER_SHA256, "Worker bytes differ")
    secret = env.get("MANAGER_PRIVATE_STAGING_SESSION_SECRET", "")
    require(len(secret) >= 32, "dedicated staging session secret missing or too short")
    client = runner.CloudflareClient(env["MANAGER_STANDALONE_WORKER_TOKEN"])
    verify_isolation(client, {BASE_VERSION})
    completion = transport.upload_asset_buckets(client, manifest, transport._assets(manifest, prepared))
    bindings = [{"type": "d1", "name": "DB", "database_id": runner.D1},
                {"type": "assets", "name": "ASSETS"},
                {"type": "secret_text", "name": "SESSION_SECRET", "text": secret}]
    bindings.extend({"type": "plain_text", "name": k, "text": v} for k, v in sorted(config["vars"].items()))
    path = runner.BASE + "/workers/workers/" + WORKER_ID + "/versions"
    version = client.request("POST", path + "?deploy=false", body={
        "main_module": "worker.js", "compatibility_date": config["compatibility_date"],
        "modules": [{"name": "worker.js", "content_type": "application/javascript+module",
                     "content_base64": base64.b64encode(worker.read_bytes()).decode("ascii")}],
        "bindings": bindings, "assets": {"jwt": completion, "config": {
            k: config["assets"][k] for k in ("html_handling", "not_found_handling", "run_worker_first")
        }},
    })
    version_id = version.get("id")
    require(isinstance(version_id, str) and version_id != BASE_VERSION, "new version ID missing")
    print(json.dumps({"candidate_version_id": version_id}))
    verify_isolation(client, {BASE_VERSION, version_id})
    details = client.request("GET", path + "/" + version_id)
    def public_binding(binding):
        return {k: binding.get(k) for k in (
            ("type", "name", "database_id") if binding["type"] == "d1" else
            ("type", "name", "text") if binding["type"] == "plain_text" else ("type", "name")
        )}
    require(sorted(map(public_binding, details["bindings"]), key=lambda b: b["name"])
            == sorted(map(public_binding, bindings), key=lambda b: b["name"])
            and not details.get("urls"), "candidate bindings or URLs differ")
    print(json.dumps({"status": "CANDIDATE_UPLOADED_UNDEPLOYED", "version_id": version_id}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-config", action="store_true")
    parser.add_argument("--prepared-artifacts")
    parser.add_argument("--source-sha")
    parser.add_argument("--owner-comment-id", type=int)
    parser.add_argument("--reviewer-comment-id", type=int)
    args = parser.parse_args()
    try:
        if args.check_config:
            verified_config()
        else:
            upload(args)
    except (ValueError, KeyError, TypeError, OSError, runner.ProtectedRunnerError):
        raise SystemExit("Manager candidate upload denied or incomplete; inspect staging inventory before retry.") from None
