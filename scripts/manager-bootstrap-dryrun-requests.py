#!/usr/bin/env python3
"""Produce a REDACTED no-network dry-run for manager Worker first-version bootstrap.

No HTTP client, no token reads, no network and no Cloudflare writes. Inputs must
be the previously pinned immutable artifact preparation output.
"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent
MANIFEST_SCRIPT = ROOT / "manager-bootstrap-offline-manifest.py"
CONTRACT_SCRIPT = ROOT / "manager-bootstrap-api-contract.py"
ACCOUNT = "ddd23cab31928a4bb3d4998df9b26d1d"
WORKER = "bw-manager-invitations-functional-private-staging"
DB = "518a9e33-b2ba-4204-ac52-aae4150a7b52"

def import_safely(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

manifest_mod = import_safely("manager_bootstrap_offline_manifest", MANIFEST_SCRIPT)
contract_mod = import_safely("manager_bootstrap_api_contract", CONTRACT_SCRIPT)

def create_redacted_plan(target: pathlib.Path):
    target = target.resolve(strict=True)
    entrypoint = target / "cloudflare" / "src" / "worker.js"
    config_path = target / "cloudflare" / "wrangler.manager-invitations-functional-staging.toml"
    if not entrypoint.is_file() or entrypoint.is_symlink():
        raise ValueError("unverified Worker binary")
    if manifest_mod.hash_file(entrypoint) != manifest_mod.WORKER_SHA256:
        raise ValueError("original Worker binary checksum mismatch")
    config = manifest_mod.validate_config(config_path)
    manifest = manifest_mod.build_manifest(target / "public")
    if len(manifest) != 278:
        raise ValueError("static asset set incomplete")
    if config["name"] != WORKER or config["d1_databases"][0]["database_id"] != DB:
        raise ValueError("unreviewed Worker or D1")
    flags = config["vars"]
    if any(v != "false" for k, v in flags.items() if k.endswith("_ENABLED") or k.endswith("_READY")):
        raise ValueError("activation flag detected")
    for forbidden in ("routes", "route", "triggers", "services", "r2_buckets"):
        if config.get(forbidden):
            raise ValueError("forbidden Cloudflare binding: " + forbidden)

    # Explicit API requests are a plan, not requests sent. Version body deliberately
    # omits actual compiled code, assets upload JWT and secret values in any output.
    operations = [
        {
            "order": 1, "method": "POST",
            "path": f"/accounts/{ACCOUNT}/workers/workers",
            "body": {"name": WORKER, "subdomain": {"enabled": False, "previews_enabled": False}},
            "expected": "inert Worker record, deployed_on=null",
        },
        {
            "order": 2, "method": "POST",
            "path": f"/accounts/{ACCOUNT}/workers/scripts/{WORKER}/assets-upload-session",
            "body": {"manifest": "<278 validated immutable paths, sha256 prefix, sizes>"},
            "expected": "short-lived upload JWT and optional missing-file buckets",
        },
        {
            "order": 3, "method": "POST",
            "path": f"/accounts/{ACCOUNT}/workers/assets/upload?base64=true",
            "body": "<multipart data for Cloudflare-requested asset hashes only; no secrets displayed>",
            "expected": "completion JWT; only if buckets nonempty",
        },
        {
            "order": 4, "method": "POST",
            "path": f"/accounts/{ACCOUNT}/workers/workers/{{worker_id}}/versions",
            "body": {
                "main_module": "worker.js",
                "modules": "<exact original compiled worker.js, base64, verified sha256>",
                "compatibility_date": config["compatibility_date"],
                "bindings": [
                    {"type": "d1", "name": "DB", "id": DB},
                    {"type": "assets", "name": "ASSETS"},
                    "<exact reviewed disabled plain-text vars from Wrangler config>",
                ],
                "assets": {
                    "jwt": "<never printed; obtained from asset-upload completion>",
                    "config": {
                        "html_handling": config["assets"]["html_handling"],
                        "not_found_handling": config["assets"]["not_found_handling"],
                        "run_worker_first": config["assets"]["run_worker_first"],
                    },
                },
            },
            "expected": "one undeployed version, no deployment call",
        },
    ]
    names = [op["method"] for op in operations]
    if names != ["POST"] * 4 or any(
        word in op["path"] for op in operations for word in
        ("/deployments", "/dns_records", "/routes", "/domains")
    ):
        raise ValueError("unexpected API action")
    return {
        "mode": "DRY_RUN_ONLY_NO_NETWORK_NO_CLOUDFLARE_WRITE",
        "account_id": ACCOUNT,
        "worker_name": WORKER,
        "worker_sha256": manifest_mod.WORKER_SHA256,
        "reviewed_wrangle_blob": manifest_mod.CONFIG_SHA1,
        "assets_count": len(manifest),
        "staging_db": DB,
        "public_ingress_expected": False,
        "require_independent_reviewer": "thusico",
        "require_separate_live_bootstrap_approval": True,
        "manual_version_only_upload_not_yet_supported_for_new_worker": True,
        "operations": operations,
        "prohibited": ["PUT /workers/scripts", "wrangler deploy", "POST /deployments",
                        "DNS write", "Workers routes write", "preview URL enablement"],
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--target", type=pathlib.Path, required=True)
    p.add_argument("--output", type=pathlib.Path, required=True)
    a = p.parse_args()
    report = create_redacted_plan(a.target)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print("Dry-run only: safe initial-version API request specification generated (zero network)")

if __name__ == "__main__":
    main()
