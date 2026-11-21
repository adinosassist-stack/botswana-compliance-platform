#!/usr/bin/env python3
"""Protected owner-dispatched deployment of ONE pinned Manager Worker version.

This runner has no DNS/route/custom-domain or production write capability.
It is not invoked by PR CI. Never auto-retry after ambiguous API response.
"""
import argparse
import importlib.util
import json
import os
import re
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


q = load("manager_qualifier", "manager-private-activation-qualification.py")
previous = load("manager_protected_lib", "manager-standalone-protected-runner.py")
ACTION = "APPROVE_MANAGER_PRIVATE_DEPLOY_NO_INGRESS"
ACK = "NO_DNS_OR_ROUTE_CHANGES"
WORKFLOW = ".github/workflows/manager-private-no-ingress-deploy.yml"
UPLOAD_RUN = 44932073483
ACCOUNT_PATH = "/accounts/" + q.ACCOUNT
ZONE_PATH = "/zones/" + q.ZONE
VERSION_PATH = ACCOUNT_PATH + "/workers/workers/" + q.WORKER_ID + "/versions"
DEPLOY_PATH = ACCOUNT_PATH + "/workers/scripts/" + q.WORKER_NAME + "/deployments"
GH_API = "https://api.github.com/repos/" + q.REPO


class Denied(RuntimeError):
    pass


def need(condition, message):
    if not condition:
        raise Denied(message)


def rows(value, label):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "versions", "deployments", "result"):
            if isinstance(value.get(key), list):
                return value[key]
    raise Denied("Unknown " + label + " inventory")


def github_get(token, path):
    need(path.startswith("/") and ".." not in path, "Unexpected GitHub path")
    request = urllib.request.Request(
        GH_API + path, method="GET",
        headers={"Authorization": "Bearer " + token,
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"})
    try:
        value = previous._read_json(request)
    except previous.ProtectedRunnerError:
        raise Denied("GitHub verification unavailable") from None
    need(isinstance(value, dict), "Invalid GitHub read")
    return value


def validate_runtime(env, sha):
    need(bool(re.fullmatch(r"[a-f0-9]{40}", str(sha))),
         "Invalid exact main SHA")
    expected = {
        "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REPOSITORY": q.REPO, "GITHUB_ACTOR": "adinosassist-stack",
        "GITHUB_REF": "refs/heads/main", "GITHUB_SHA": sha,
        "GITHUB_WORKFLOW_REF": q.REPO + "/" + WORKFLOW + "@refs/heads/main",
    }
    for key, val in expected.items():
        need(env.get(key) == val, "Not owner-dispatched exact main workflow")
    token = env.get("GH_TOKEN")
    need(bool(token), "GitHub read token missing")
    need(github_get(token, "/branches/main").get("commit", {}).get("sha") == sha,
         "Protected main moved after dispatch")
    run = github_get(token, "/actions/runs/" + str(UPLOAD_RUN))
    need(run.get("status") == "completed" and run.get("conclusion") == "success"
         and run.get("head_sha") == q.CANDIDATE_SOURCE_SHA
         and run.get("actor", {}).get("login") == "adinosassist-stack",
         "Immutable candidate upload receipt differs")


def validate_comments(owner, reviewer, exact_sha):
    need(owner.get("id") != reviewer.get("id"), "Approvals must be distinct")
    expected = (ACTION, ACK, q.NO_PRODUCTION, exact_sha, q.CANDIDATE,
                q.WORKER_SHA256, q.MANIFEST_SHA256, q.ACCOUNT,
                q.ZONE, q.D1, q.HOST, str(UPLOAD_RUN))
    for comment, login in ((owner, "adinosassist-stack"), (reviewer, "thusico")):
        need(comment.get("user", {}).get("login") == login,
             "Independent approval author mismatch")
        need(comment.get("issue_url") == GH_API + "/issues/" + str(q.TRACKING_ISSUE),
             "Approval is not on tracking issue")
        body = comment.get("body")
        need(isinstance(body, str) and all(x in body for x in expected)
             and "REQUEST CHANGES" not in body.upper(),
             "Exact-version no-ingress approval missing")
    return True


def approvals(token, owner_id, reviewer_id, sha):
    need(isinstance(owner_id, int) and isinstance(reviewer_id, int)
         and owner_id > 0 and reviewer_id > 0 and owner_id != reviewer_id,
         "Distinct approval IDs required")
    return validate_comments(
        github_get(token, "/issues/comments/" + str(owner_id)),
        github_get(token, "/issues/comments/" + str(reviewer_id)), sha)


def inventory(client):
    """Read LIVE Cloudflare state and never include a session secret in output."""
    get = lambda path: client.request("GET", path)
    zone = get(ZONE_PATH)
    need(zone.get("account", {}).get("id") == q.ACCOUNT,
         "Staging zone owned by wrong account")
    zones = rows(get("/zones?account.id=" + q.ACCOUNT), "zones")
    need(len(zones) == 1 and zones[0].get("id") == q.ZONE,
         "Unexpected additional account zone")
    worker = get(ACCOUNT_PATH + "/workers/workers/" + q.WORKER_ID)
    vers = rows(get(VERSION_PATH), "versions")
    deployments = rows(get(DEPLOY_PATH), "deployments")
    sub = get(ACCOUNT_PATH + "/workers/scripts/" + q.WORKER_NAME + "/subdomain")
    domains = rows(get(ACCOUNT_PATH + "/workers/domains"), "domains")
    routes = rows(get(ZONE_PATH + "/workers/routes"), "routes")
    dns = rows(get(ZONE_PATH + "/dns_records"), "DNS records")
    forbidden_dns = [x for x in dns if x.get("name") in
                     (q.HOST, "*." + q.ZONE_NAME)]
    apps = rows(get(ACCOUNT_PATH + "/access/apps"), "Access applications")
    policies = rows(get(ACCOUNT_PATH + "/access/policies"), "Access policies")
    need(len(apps) == 1 and len(policies) == 1,
         "Access applications or policies changed")
    org = get(ACCOUNT_PATH + "/access/organizations")
    db = get(ACCOUNT_PATH + "/d1/database/" + q.D1)
    need(db.get("read_replication", {}).get("mode") == "disabled",
         "D1 read replication is no longer disabled")
    bookmark = get(ACCOUNT_PATH + "/d1/database/" + q.D1 +
                   "/time_travel/bookmark")
    need(isinstance(bookmark.get("bookmark"), str) and
         len(bookmark["bookmark"]) >= 4, "D1 recovery bookmark unavailable")
    candidate = get(VERSION_PATH + "/" + q.CANDIDATE)
    need(candidate.get("main_module") == "worker.js"
         and candidate.get("compatibility_date") == "2026-09-03",
         "Candidate runtime metadata unexpected")
    safe_bindings = []
    for b in candidate.get("bindings") or []:
        kind = b.get("type")
        entry = {"type": kind, "name": b.get("name")}
        if kind == "secret_text":
            need("text" not in b, "Unexpected secret disclosure in provider response")
        elif kind == "d1":
            entry["database_id"] = b.get("database_id")
        elif kind == "plain_text":
            entry["text"] = b.get("text")
        elif kind != "assets":
            raise Denied("Unexpected candidate binding")
        safe_bindings.append(entry)
    app, policy = apps[0], policies[0]
    snapshot = {
        "account_id": q.ACCOUNT,
        "zone": {k: zone.get(k) for k in ("id", "name", "status")},
        "worker": {
            "id": worker.get("id"), "name": worker.get("name"),
            "versions": [{"id": v.get("id"), "deployed_on": v.get("deployed_on")}
                         for v in vers],
            "deployments": deployments, "workers_dev": sub.get("enabled"),
            "preview_urls": sub.get("previews_enabled"), "custom_domains": domains,
        },
        "ingress": {"dns": forbidden_dns, "routes": routes},
        "access": {
            "deny_unmatched_requests": org.get("deny_unmatched_requests"),
            "app": {k: app.get(k) for k in
                    ("id", "domain", "destinations", "allowed_idps")} |
                   {"policy_ids": [v.get("id") for v in app.get("policies", [])]},
            "policies": [{
                "id": policy.get("id"), "decision": policy.get("decision"),
                "include": policy.get("include"), "exclude": policy.get("exclude"),
                "require": policy.get("require"),
            }],
        },
        "d1": {k: db.get(k) for k in ("uuid", "name", "num_tables")},
        "candidate": {
            "id": candidate.get("id"), "deployed_on": candidate.get("deployed_on"),
            "urls": candidate.get("urls"), "bindings": safe_bindings,
        },
    }
    try:
        # Candidate upload SHA is historical provenance, NOT a live main SHA.
        q.validate_inventory(snapshot, q.CANDIDATE_SOURCE_SHA)
    except (q.QualificationError, ValueError, TypeError, KeyError):
        raise Denied("Live isolated candidate inventory preflight denied") from None
    return True


def payload():
    return {"strategy": "percentage",
            "versions": [{"version_id": q.CANDIDATE, "percentage": 100}],
            "annotations": {"workers/message": "Approved isolated Manager no-ingress candidate"}}


def postflight(client, deployment_id):
    need(bool(re.fullmatch(r"[0-9a-f-]{36}", str(deployment_id))),
         "Deployment result ambiguous, require manual isolated review")
    deployments = rows(client.request("GET", DEPLOY_PATH), "postflight deployments")
    need(len(deployments) == 1 and deployments[0].get("id") == deployment_id,
         "Deployment inventory changed; halt without automatic rollback")
    need(deployments[0].get("versions") ==
         [{"version_id": q.CANDIDATE, "percentage": 100}],
         "Deployed version differs from approved candidate")
    routes = rows(client.request("GET", ZONE_PATH + "/workers/routes"),
                  "postflight routes")
    need(not routes, "Unexpected test zone route appeared")
    dns = rows(client.request("GET", ZONE_PATH + "/dns_records"),
               "postflight DNS")
    need(not any(d.get("name") in (q.HOST, "*." + q.ZONE_NAME) for d in dns),
         "Exact or wildcard staging DNS appeared")
    sub = client.request("GET", ACCOUNT_PATH + "/workers/scripts/" +
                         q.WORKER_NAME + "/subdomain")
    need(sub.get("enabled") is False and sub.get("previews_enabled") is False,
         "Public/preview URL changed")
    domains = rows(client.request("GET", ACCOUNT_PATH + "/workers/domains"),
                   "postflight domains")
    need(not domains, "Custom domain appeared")
    detail = client.request("GET", VERSION_PATH + "/" + q.CANDIDATE)
    need(detail.get("id") == q.CANDIDATE and detail.get("urls") == [],
         "Candidate has unexpected routable URL")
    return {
        "status": "PINNED_CANDIDATE_DEPLOYED_ZERO_INGRESS",
        "version_id": q.CANDIDATE, "deployment_id": deployment_id,
        "custom_domains": 0, "dns": 0, "routes": 0,
        "workers_dev": False, "preview_urls": False,
        "private_login_live": False, "production_changed": False,
        "separate_ingress_approval_required": True,
    }


def execute(args, env, client_factory=None):
    need(args.execute_pinned_candidate and args.authorization == ACTION
         and args.no_ingress_ack == ACK and args.candidate_version == q.CANDIDATE,
         "No exact-version execution authorization")
    validate_runtime(env, args.exact_main_sha)
    approvals(env["GH_TOKEN"], args.owner_comment_id,
              args.reviewer_comment_id, args.exact_main_sha)
    token = env.get("MANAGER_NO_INGRESS_DEPLOY_CLOUDFLARE_TOKEN", "")
    need(len(token) >= 24, "Dedicated isolated deployment credential missing")
    client = client_factory(token) if client_factory else previous.CloudflareClient(token)
    inventory(client)  # ALL read-only gates before first write.
    result = client.request("POST", DEPLOY_PATH, body=payload())  # ONE write.
    return postflight(client, result.get("id") if isinstance(result, dict) else None)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--execute-pinned-candidate", action="store_true")
    p.add_argument("--authorization", required=True)
    p.add_argument("--no-ingress-ack", required=True)
    p.add_argument("--candidate-version", required=True)
    p.add_argument("--exact-main-sha", required=True)
    p.add_argument("--owner-comment-id", required=True, type=int)
    p.add_argument("--reviewer-comment-id", required=True, type=int)
    args = p.parse_args()
    try:
        report = execute(args, os.environ)
    except (Denied, q.QualificationError, previous.ProtectedRunnerError,
            ValueError, TypeError, KeyError, OSError):
        raise SystemExit(
            "DENIED: protected Manager no-ingress deploy or postflight incomplete; "
            "do not retry without isolated inventory review."
        ) from None
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
