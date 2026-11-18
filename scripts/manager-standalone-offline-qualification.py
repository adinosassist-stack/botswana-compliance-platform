#!/usr/bin/env python3
"""Offline-only exact artifact qualification for isolated Manager Cloudflare account.

This has no network/HTTP code, credential reads, Cloudflare writes or deployment.
It consumes existing verified immutable artifact package without modifying it.
"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[1]
ACCOUNT = "f585813fa376f7c71c7d4a79254168fa"
D1 = "1a2fc702-2592-491c-9f55-80e032a56dd8"
NAME = "bw-manager-invitations-functional-private-staging"
CONFIG_BLOB = "637476567f078621e0363cd7bb8380fd90342197"
OLD_D1 = "518a9e33-b2ba-4204-ac52-aae4150a7b52"
CONFIG_PATH = ROOT / "cloudflare/wrangler.manager-standalone-account-staging.toml"
LEGACY_CONFIG = ROOT / "cloudflare/wrangler.manager-invitations-functional-staging.toml"

spec = importlib.util.spec_from_file_location("immutable_manager_manifest", ROOT / "scripts/manager-bootstrap-offline-manifest.py")
immutable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(immutable)

class QualificationError(ValueError):
    pass

def qualified_config(new_config=CONFIG_PATH, old_config=LEGACY_CONFIG):
    payload = new_config.read_bytes()
    git_blob = b"blob " + str(len(payload)).encode() + b"\\0" + payload
    if hashlib.sha1(git_blob).hexdigest() != CONFIG_BLOB:
        raise QualificationError("new-account configuration differs from reviewed Git blob")
    new = tomllib.loads(payload.decode("utf-8"))
    old = tomllib.loads(old_config.read_text(encoding="utf-8"))
    old["account_id"] = ACCOUNT
    old["d1_databases"][0]["database_id"] = D1
    if new != old:
        raise QualificationError("unreviewed change beyond isolated account and D1")
    if (new.get("account_id") != ACCOUNT or new.get("name") != NAME or
        new.get("workers_dev") is not False or new.get("preview_urls") is not False or
        new.get("routes") or new.get("triggers")):
        raise QualificationError("invalid account, Worker or public ingress")
    flags = new["vars"]
    for flag in ("MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED","MANAGER_INVITATIONS_SCHEMA_READY",
                 "MANAGER_INVITATIONS_ACCESS_READY","MANAGER_ACCESS_REQUESTS_ENABLED",
                 "MANAGER_ACCESS_PROVISIONING_ENABLED","THEBE_GENERAL_AI_ENABLED",
                 "THEBE_AI_EXPORTS_ENABLED","POP_UPLOAD_STAGING_ENABLED"):
        if flags.get(flag) != "false":
            raise QualificationError("activation flag is not disabled: " + flag)
    if flags.get("PUBLIC_ORIGIN") != "" or flags.get("PUBLIC_APP_URL") != "":
        raise QualificationError("public origin must remain blank")
    if new["d1_databases"] != [{"binding":"DB","database_name":"bw-manager-invitations-synthetic-staging","database_id":D1}]:
        raise QualificationError("wrong synthetic database")
    return new

def qualify(package, new_config=CONFIG_PATH, old_config=LEGACY_CONFIG):
    config = qualified_config(new_config, old_config)
    worker = package / "cloudflare/src/worker.js"
    if worker.is_symlink() or not worker.is_file() or immutable.hash_file(worker) != immutable.WORKER_SHA256:
        raise QualificationError("unapproved compiled Worker binary")
    assets = immutable.build_manifest(package / "public")
    if len(assets) != 278:
        raise QualificationError("missing immutable static assets")
    return {
        "mode": "OFFLINE_ISOLATED_ACCOUNT_QUALIFICATION_NO_NETWORK_NO_WRITES",
        "account_id": ACCOUNT,
        "database_id": D1,
        "worker": NAME,
        "config_blob_sha1": CONFIG_BLOB,
        "original_worker_sha256": immutable.WORKER_SHA256,
        "assets_count": len(assets),
        "compatibility_date": config["compatibility_date"],
        "preview_urls_enabled": False,
        "public_worker_enabled": False,
        "requires_new_account_access_approval": True,
        "requires_separate_schema_apply_and_recovery_approval": True,
        "requires_independent_version_bootstrap_approval": True,
        "prohibited": ["wrangler deploy","worker version POST","assets upload","DNS","routes","production D1"],
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--prepared-artifacts",type=pathlib.Path,required=True)
    p.add_argument("--report",type=pathlib.Path,required=True)
    args=p.parse_args()
    result=qualify(args.prepared_artifacts)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(result,sort_keys=True,indent=2)+"\\n",encoding="utf-8")
    print("Standalone Manager account exact-artifact offline qualification PASSED; no Cloudflare writes")

if __name__=="__main__":
    main()
