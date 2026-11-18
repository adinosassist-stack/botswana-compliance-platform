#!/usr/bin/env python3
"""Read-only, fail-closed first-version manager staging Cloudflare postflight.

No Cloudflare write endpoints, activation, or token output. Designed for a future
separately approved protected execution workflow; not wired to any live dispatch.
"""
import argparse
import json
import os
import urllib.error
import urllib.request

ACCOUNT = "ddd23cab31928a4bb3d4998df9b26d1d"
ZONE = "33e363d52b69c4a64dbb8a0891dbb3a9"
DB = "518a9e33-b2ba-4204-ac52-aae4150a7b52"
NAME = "bw-manager-invitations-functional-private-staging"
HOST = "manager-staging.thebedesk.com"
ACCESS_APP = "7934753d-0188-4796-9288-bfd99d3be791"

class PostflightError(RuntimeError):
    pass

def rows(value, label):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "versions", "deployments", "result"):
            if key in value and isinstance(value[key], list):
                return value[key]
    raise PostflightError(label + " response shape unknown; refuse success")

def validate(get, worker_id, version_id):
    if not isinstance(worker_id, str) or not worker_id or "/" in worker_id or "?" in worker_id:
        raise PostflightError("worker ID invalid")
    if not isinstance(version_id, str) or not version_id or "/" in version_id:
        raise PostflightError("version ID invalid")
    account = f"/accounts/{ACCOUNT}"
    worker = get(account + f"/workers/workers/{worker_id}")
    if not isinstance(worker, dict) or worker.get("id") != worker_id or worker.get("name") != NAME:
        raise PostflightError("Worker identity mismatch")
    if worker.get("deployed_on") is not None:
        raise PostflightError("Worker is deployed")
    sub = worker.get("subdomain")
    if not isinstance(sub, dict) or sub.get("enabled") is not False or sub.get("previews_enabled") is not False:
        raise PostflightError("Worker public or preview URL enabled/unknown")
    versions = rows(get(account + f"/workers/workers/{worker_id}/versions"), "version list")
    if len(versions) != 1 or not isinstance(versions[0], dict) or versions[0].get("id") != version_id:
        raise PostflightError("first-version count or identity mismatch")
    if versions[0].get("deployed_on") not in (None, ""):
        raise PostflightError("version has deployment metadata")
    deployments = rows(get(account + f"/workers/scripts/{NAME}/deployments"), "deployments")
    if deployments:
        raise PostflightError("Worker has active deployment")
    public_sub = get(account + f"/workers/scripts/{NAME}/subdomain")
    if not isinstance(public_sub, dict) or public_sub.get("enabled") is not False:
        raise PostflightError("workers.dev subdomain status unknown/enabled")
    routes = rows(get(f"/zones/{ZONE}/workers/routes"), "routes")
    if any(not isinstance(item, dict) or item.get("script") == NAME or HOST in str(item.get("pattern", "")) for item in routes):
        raise PostflightError("manager Worker route exists")
    domains = rows(get(account + "/workers/domains"), "domains")
    if any(not isinstance(item, dict) or item.get("service") == NAME or item.get("hostname") == HOST for item in domains):
        raise PostflightError("manager custom domain exists")
    dns = rows(get(f"/zones/{ZONE}/dns_records?name={HOST}"), "DNS")
    if dns:
        raise PostflightError("manager hostname DNS ingress exists")
    db = get(account + f"/d1/database/{DB}")
    if not isinstance(db, dict) or db.get("uuid") != DB or db.get("name") != "bw-manager-invitations-synthetic-staging":
        raise PostflightError("isolated D1 binding target mismatch")
    access = get(account + f"/access/apps/{ACCESS_APP}")
    if not isinstance(access, dict) or access.get("domain") != HOST:
        raise PostflightError("private Access app missing/mismatched")
    policies = access.get("policies")
    if (not isinstance(policies, list) or len(policies) != 1 or
        policies[0].get("decision") != "allow" or
        policies[0].get("include") != [{"email": {"email": "banabothem@yahoo.com"}}]):
        raise PostflightError("private tester policy changed")
    return {"result": "PASS_UNDEPLOYED_NO_INGRESS", "worker": NAME,
            "worker_id": worker_id, "version_id": version_id,
            "deployed": False, "workers_dev": False, "previews": False,
            "routes": 0, "domains": 0, "hostname_dns": 0, "deployments": 0,
            "database": DB, "access_policy": "ONE_APPROVED_PRIVATE_TESTER"}

def live_get(path):
    if not (path.startswith(f"/accounts/{ACCOUNT}/") or path.startswith(f"/zones/{ZONE}/")):
        raise PostflightError("read URL outside approved Cloudflare resources")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        raise PostflightError("missing protected read credential")
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path,
        headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
        method="GET")
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            body = json.load(response)
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
        raise PostflightError("Cloudflare read-only postflight request failed") from None
    if not isinstance(body, dict) or body.get("success") is not True or body.get("result") is None:
        raise PostflightError("Cloudflare read-only result unknown")
    return body["result"]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker-id", required=True)
    parser.add_argument("--version-id", required=True)
    args = parser.parse_args()
    if os.environ.get("CLOUDFLARE_ACCOUNT_ID") != ACCOUNT:
        raise PostflightError("unexpected Cloudflare account")
    print(json.dumps(validate(live_get, args.worker_id, args.version_id), sort_keys=True))

if __name__ == "__main__":
    main()
