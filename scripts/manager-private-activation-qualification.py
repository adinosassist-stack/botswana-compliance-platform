#!/usr/bin/env python3
"""Read-only, fail-closed Manager activation evidence qualification.

No Cloudflare API clients, credentials, Worker deployment or DNS mutations.
A passing snapshot proves only internal consistency of the supplied evidence,
not its freshness, provenance, live Access interception or execution approval.
"""
import argparse
import json
import re
from pathlib import Path

REPO = "adinosassist-stack/botswana-compliance-platform"
TRACKING_ISSUE = 2599
CANDIDATE_SOURCE_SHA = "96645f46d670c46e05dbad3af1ae846172d32cc1"
ACCOUNT = "f585813fa376f7c71c7d4a79254168fa"
ZONE = "5cf26ad83f8d5a5fb6ef97ce516b932b"
ZONE_NAME = "thebedesk-test.win"
HOST = "manager-staging.thebedesk-test.win"
WORKER_NAME = "bw-manager-invitations-functional-private-staging"
WORKER_ID = "a83242df903d4fb7b4ad5ea9e5a1a509"
CANDIDATE = "b4c61970-0a0b-4c63-bc37-1b067e215a6d"
BASELINE = "cc509d3c-75d4-450a-acb1-e2ecdcb245d7"
D1 = "1a2fc702-2592-491c-9f55-80e032a56dd8"
D1_NAME = "bw-manager-invitations-synthetic-staging"
ACCESS_APP = "fa020bbc-0407-40f0-873e-e79537dcf021"
POLICY_ID = "6fc750df-7e40-492f-845d-47e6e5deab0b"
IDP = "a8fac234-02d0-4f3e-a821-471cf4eee7f8"
TESTER = "banabothem@yahoo.com"
MANIFEST_SHA256 = "2b06f615812022db4a5d2ace49bce433cb1929d25ebde37228dc88d5325f3f6e"
WORKER_SHA256 = "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e"
NO_PRODUCTION = "NO_PUBLIC_INGRESS_OR_PRODUCTION_CHANGES"
PHASE_MARKERS = {
    "deploy_inert": "APPROVE_MANAGER_PRIVATE_DEPLOY_NO_INGRESS",
    "ingress_test": "APPROVE_MANAGER_PRIVATE_INGRESS_TEST_ONLY",
}


class QualificationError(ValueError):
    pass


def require(condition, why):
    if not condition:
        raise QualificationError(why)


def exact(observed, expected, why):
    require(observed == expected, why)


def validate_inventory(s, current_main_sha):
    """Validate an untrusted read-only JSON inventory; never authorize writes."""
    require(isinstance(s, dict), "invalid inventory")
    require(re.fullmatch(r"[0-9a-f]{40}", str(current_main_sha)) is not None,
            "invalid current main SHA")
    exact(current_main_sha, CANDIDATE_SOURCE_SHA, "main changed; refresh exact-source qualification")
    exact(s.get("account_id"), ACCOUNT, "wrong account")
    z = s.get("zone") or {}
    exact(z, {"id": ZONE, "name": ZONE_NAME, "status": "active"}, "wrong zone")
    w = s.get("worker") or {}
    exact(w.get("id"), WORKER_ID, "wrong Worker ID")
    exact(w.get("name"), WORKER_NAME, "wrong Worker name")
    versions = w.get("versions")
    require(isinstance(versions, list) and len(versions) == 2, "version count changed")
    exact({x.get("id") for x in versions if isinstance(x, dict)},
          {BASELINE, CANDIDATE}, "version inventory changed")
    require(all("deployed_on" in x and x["deployed_on"] is None
                for x in versions), "deployed version observed or unknown")
    exact(w.get("deployments"), [], "unexpected active deployment")
    exact(w.get("workers_dev"), False, "workers.dev must be disabled")
    exact(w.get("preview_urls"), False, "preview ingress must be disabled")
    exact(w.get("custom_domains"), [], "custom domain is present")
    ingress = s.get("ingress") or {}
    exact(ingress.get("dns"), [], "exact-host DNS must not exist at preflight")
    exact(ingress.get("routes"), [], "zone Worker route must not exist at preflight")
    a = s.get("access") or {}
    exact(a.get("deny_unmatched_requests"), True, "Access default-deny absent")
    exact(a.get("app"), {
        "id": ACCESS_APP, "domain": HOST,
        "destinations": [{"type": "public", "uri": HOST}],
        "allowed_idps": [IDP], "policy_ids": [POLICY_ID],
    }, "Access app mismatch")
    exact(a.get("policies"), [{
        "id": POLICY_ID, "decision": "allow",
        "include": [{"email": {"email": TESTER}}],
        "exclude": [], "require": [],
    }], "Access policy is not exactly one authorized tester")
    db = s.get("d1") or {}
    exact(db, {"uuid": D1, "name": D1_NAME, "num_tables": 13},
          "isolated synthetic D1 mismatch")
    candidate = s.get("candidate") or {}
    exact(candidate.get("id"), CANDIDATE, "candidate ID mismatch")
    require("deployed_on" in candidate and candidate["deployed_on"] is None,
            "candidate deployment state is not inert")
    exact(candidate.get("urls"), [], "candidate has URL ingress")
    raw_bindings = candidate.get("bindings")
    require(isinstance(raw_bindings, list), "candidate bindings unavailable")
    require(all(isinstance(b, dict) and isinstance(b.get("name"), str)
                for b in raw_bindings), "invalid candidate bindings")
    bindings = {b["name"]: b for b in raw_bindings}
    require(len(bindings) == len(raw_bindings), "duplicate binding names")
    types = {
        "APP_ENV": "plain_text", "ASSETS": "assets", "DB": "d1",
        "EVIDENCE_UPLOADS_ENABLED": "plain_text",
        "MANAGER_ACCESS_PROVISIONING_ENABLED": "plain_text",
        "MANAGER_ACCESS_REQUESTS_ENABLED": "plain_text",
        "MANAGER_INVITATIONS_ACCESS_READY": "plain_text",
        "MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED": "plain_text",
        "MANAGER_INVITATIONS_SCHEMA_READY": "plain_text",
        "PAYMENT_PROVIDER": "plain_text", "POP_UPLOAD_STAGING_ENABLED": "plain_text",
        "PUBLIC_APP_URL": "plain_text", "PUBLIC_ORIGIN": "plain_text",
        "REGISTRATION_MODE": "plain_text", "SESSION_SECRET": "secret_text",
        "THEBE_AI_EXPORTS_ENABLED": "plain_text",
        "THEBE_GENERAL_AI_ENABLED": "plain_text",
    }
    exact({k: v.get("type") for k, v in bindings.items()}, types,
          "unexpected or missing candidate binding")
    exact(bindings["DB"].get("database_id"), D1, "candidate bound to wrong D1")
    require("text" not in bindings["SESSION_SECRET"],
            "secret value must not appear in evidence")
    expected_vars = {
        "APP_ENV": "staging", "EVIDENCE_UPLOADS_ENABLED": "false",
        "MANAGER_ACCESS_PROVISIONING_ENABLED": "false",
        "MANAGER_ACCESS_REQUESTS_ENABLED": "true",
        "MANAGER_INVITATIONS_ACCESS_READY": "true",
        "MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED": "true",
        "MANAGER_INVITATIONS_SCHEMA_READY": "true",
        "PAYMENT_PROVIDER": "none", "POP_UPLOAD_STAGING_ENABLED": "false",
        "PUBLIC_APP_URL": "https://" + HOST,
        "PUBLIC_ORIGIN": "https://" + HOST, "REGISTRATION_MODE": "hold",
        "THEBE_AI_EXPORTS_ENABLED": "false", "THEBE_GENERAL_AI_ENABLED": "false",
    }
    exact({k: bindings[k].get("text") for k in expected_vars}, expected_vars,
          "candidate flags/origin/payment configuration differs")
    return {
        "status": "READ_ONLY_SNAPSHOT_CONSISTENT_NOT_AUTHORIZED",
        "candidate_version": CANDIDATE,
        "deployment_authorized": False,
        "ingress_authorized": False,
        "live_access_probes": "NOT_PERFORMED",
        "synthetic_browser_e2e": "NOT_PERFORMED",
        "d1_recovery_proof": "NOT_VERIFIED",
    }


def verify_separate_approvals(owner, reviewer, phase, source_sha):
    """Offline test helper; a future runner must fetch comments from GitHub API."""
    require(phase in PHASE_MARKERS, "unrecognized activation phase")
    require(source_sha == CANDIDATE_SOURCE_SHA, "stale source approval")
    require(owner.get("id") != reviewer.get("id"), "approval IDs must differ")
    required = (PHASE_MARKERS[phase], source_sha, CANDIDATE,
                WORKER_SHA256, MANIFEST_SHA256, ACCOUNT, D1, HOST, NO_PRODUCTION)
    for item, principal in ((owner, "adinosassist-stack"), (reviewer, "thusico")):
        require(item.get("user", {}).get("login") == principal,
                "approval author mismatch")
        body = item.get("body", "")
        require(isinstance(body, str)
                and all(text in body for text in required)
                and "REQUEST CHANGES" not in body.upper(),
                "activation phase approval missing or inconsistent")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--current-main", required=True)
    args = parser.parse_args()
    try:
        result = validate_inventory(
            json.loads(args.snapshot.read_text(encoding="utf-8")),
            args.current_main,
        )
        print(json.dumps(result, sort_keys=True))
    except (QualificationError, ValueError, TypeError, OSError, KeyError):
        raise SystemExit("Manager activation read-only qualification DENIED") from None


if __name__ == "__main__":
    main()
