#!/usr/bin/env python3
"""Create a redacted, OFFLINE-ONLY review plan for an isolated Manager Worker.

No HTTP/network imports, Cloudflare credential reads, Worker writes, or deployment.
This file cannot perform a live operation. The output is NOT an approval.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "isolated_manager_qualification", HERE / "manager-standalone-offline-qualification.py"
)
isolated = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolated)

ACCOUNT = "f585813fa376f7c71c7d4a79254168fa"
D1 = "1a2fc702-2592-491c-9f55-80e032a56dd8"
NAME = "bw-manager-invitations-functional-private-staging"
CONFIG_BLOB = "637476567f078621e0363cd7bb8380fd90342197"
WORKER_SHA256 = "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e"
LEGACY_PRODUCTION_ACCOUNT = "ddd23cab31928a4bb3d4998df9b26d1d"


class ReviewPlanError(ValueError):
    pass


def plan(qualification: dict, manifest: dict) -> dict:
    """Validate inputs and produce reviewed *proposed* API steps, never requests."""
    expected = {
        "account_id": ACCOUNT,
        "database_id": D1,
        "worker": NAME,
        "config_blob_sha1": CONFIG_BLOB,
        "original_worker_sha256": WORKER_SHA256,
        "assets_count": 278,
        "preview_urls_enabled": False,
        "public_worker_enabled": False,
        "requires_independent_version_bootstrap_approval": True,
    }
    if not isinstance(qualification, dict):
        raise ReviewPlanError("missing independent offline qualification")
    for key, value in expected.items():
        if type(qualification.get(key)) is not type(value) or qualification.get(key) != value:
            raise ReviewPlanError("qualification mismatch: " + key)
    if "NO_NETWORK_NO_WRITES" not in qualification.get("mode", ""):
        raise ReviewPlanError("offline qualification provenance absent")
    if not isinstance(manifest, dict) or len(manifest) != 278 or "/404.html" not in manifest:
        raise ReviewPlanError("immutable static asset manifest incomplete")
    for path, asset in manifest.items():
        if (not isinstance(path, str) or not path.startswith("/") or
                not isinstance(asset, dict)):
            raise ReviewPlanError("invalid immutable asset path")
        digest = asset.get("hash")
        if (not isinstance(digest, str) or len(digest) != 32 or
                any(c not in "0123456789abcdef" for c in digest) or
                type(asset.get("size")) is not int or asset["size"] < 0):
            raise ReviewPlanError("invalid immutable asset digest or size")
    manifest_digest = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    prefix = "/accounts/" + ACCOUNT
    # Proposed calls, NOT sent. The version operation explicitly includes deploy=false.
    steps = [
        {"sequence": 1, "name": "create_inert_worker_record",
         "method": "POST", "path": prefix + "/workers/workers",
         "requires": "prewrite no-Worker/no-ingress readback; disabled subdomain and previews"},
        {"sequence": 2, "name": "register_exact_assets_manifest",
         "method": "POST", "path": prefix + "/workers/scripts/" + NAME + "/assets-upload-session",
         "requires": "278 reviewed immutable assets; no secret material in logs"},
        {"sequence": 3, "name": "upload_missing_asset_buckets_only",
         "method": "POST", "path": prefix + "/workers/assets/upload?base64=true",
         "conditional": True, "requires": "final upload-completion JWT, not initial session JWT"},
        {"sequence": 4, "name": "create_exact_undeployed_version",
         "method": "POST", "path": prefix + "/workers/workers/<verified-worker-id>/versions?deploy=false",
         "requires": "exact Worker SHA-256, isolated D1, disabled flags, reviewed ASSETS; no deployment"},
    ]
    if any(s["method"] != "POST" or not s["path"].startswith(prefix + "/") or
           any(bad in s["path"] for bad in ("/deployments", "/routes", "/dns_records", "/domains"))
           for s in steps):
        raise ReviewPlanError("non-reviewable operation")
    result = {
        "status": "REVIEW_ONLY_NO_LIVE_EXECUTION",
        "mode": "OFFLINE_NO_HTTP_NO_CREDENTIALS_NO_CLOUDFLARE_WRITES",
        "worker_name": NAME,
        "account_id": ACCOUNT,
        "database_id": D1,
        "worker_sha256": WORKER_SHA256,
        "config_git_blob": CONFIG_BLOB,
        "assets_count": 278,
        "manifest_sha256": manifest_digest,
        "steps": steps,
        "expected_no_ingress": {
            "workers_dev": False, "preview_urls": False, "deployments": 0,
            "routes": 0, "domains": 0, "dns": 0, "public_login": False,
        },
        "approval_requirements": [
            "reviewed exact source and matching artifact/manifest",
            "owner authorization AND independent thusico approval for exact one-shot implementation",
            "account-isolated protected credential and supported runner; no bypass of blocked controls",
            "read-only preflight and postflight; no activated Access app or ingress at first version",
            "separate Access/session-secret/functional-login approvals after no-ingress postflight",
        ],
        "prohibited": [
            "wrangler deploy", "legacy version-only workflow", "production account credentials",
            "workers.dev or version URLs", "routes or DNS", "deployments",
            "customer data import", "production mutation",
        ],
    }
    if LEGACY_PRODUCTION_ACCOUNT in json.dumps(result, sort_keys=True):
        raise ReviewPlanError("legacy production account contamination")
    return result


def generate(prepared_artifacts: Path) -> dict:
    qualified = isolated.qualify(prepared_artifacts)
    manifest = isolated.immutable.build_manifest(prepared_artifacts / "public")
    return plan(qualified, manifest)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--prepared-artifacts", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    args = p.parse_args()
    report = generate(args.prepared_artifacts)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Manager standalone first-version plan: OFFLINE reviewed proposal only; zero Cloudflare writes")


if __name__ == "__main__":
    main()
