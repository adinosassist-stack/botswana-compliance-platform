#!/usr/bin/env python3
"""Offline-only Cloudflare manager first-version asset-manifest qualification.

Never calls external services, reads credentials, or creates a Worker/deployment.
Only run AFTER scripts/verify-manager-exact-staging-artifacts.py and
scripts/prepare-manager-version-upload.py have completed successfully.
"""
import argparse
import hashlib
import json
import pathlib
import tomllib

WORKER_SHA256 = "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e"
CONFIG_SHA1 = "7d3c5a36912df19409ab168f18c67df7b55f4755"
EXPECTED_WORKER = "bw-manager-invitations-functional-private-staging"
EXPECTED_DB = "518a9e33-b2ba-4204-ac52-aae4150a7b52"
EXPECTED_COUNT = 278

def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def validate_config(path):
    data = path.read_bytes()
    git_blob = b"blob " + str(len(data)).encode() + b"\x00" + data
    if hashlib.sha1(git_blob).hexdigest() != CONFIG_SHA1:
        raise ValueError("Wrangler config does not match reviewed Git blob")
    config = tomllib.loads(data.decode("utf-8"))
    if (config.get("name") != EXPECTED_WORKER or
        config.get("main") != "src/worker.js" or
        config.get("workers_dev") is not False or
        config.get("preview_urls") is not False or
        config.get("routes") or config.get("triggers")):
        raise ValueError("unapproved Worker name, entrypoint or public routing")
    if config.get("d1_databases") != [{
        "binding": "DB",
        "database_name": "bw-manager-invitations-synthetic-staging",
        "database_id": EXPECTED_DB,
    }]:
        raise ValueError("staging database binding mismatch")
    if config.get("assets", {}).get("directory") != "../public":
        raise ValueError("assets directory mismatch")
    if config.get("assets", {}).get("binding") != "ASSETS":
        raise ValueError("assets binding mismatch")
    flags = (
        "MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED",
        "MANAGER_INVITATIONS_SCHEMA_READY",
        "MANAGER_INVITATIONS_ACCESS_READY",
        "MANAGER_ACCESS_REQUESTS_ENABLED",
        "MANAGER_ACCESS_PROVISIONING_ENABLED",
    )
    if any(config.get("vars", {}).get(flag) != "false" for flag in flags):
        raise ValueError("manager activation flag must be disabled")
    if any(config.get("vars", {}).get(k) != "" for k in ("PUBLIC_ORIGIN", "PUBLIC_APP_URL")):
        raise ValueError("manager public URL must remain empty")
    return config

def build_manifest(directory, expected_count=EXPECTED_COUNT):
    if not directory.is_dir() or directory.is_symlink():
        raise ValueError("assets root is missing or is a symlink")
    manifest = {}
    casefold_names = set()
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError("symlink not allowed in assets: " + str(path))
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError("non-file asset: " + str(path))
        relative = path.relative_to(directory).as_posix()
        if not relative or relative.startswith("/") or ".." in pathlib.PurePosixPath(relative).parts:
            raise ValueError("invalid asset path")
        key = "/" + relative
        if key.casefold() in casefold_names:
            raise ValueError("case-insensitive asset name collision: " + key)
        casefold_names.add(key.casefold())
        size = path.stat().st_size
        if size > 25 * 1024 * 1024:
            raise ValueError("oversized asset: " + key)
        manifest[key] = {"hash": hash_file(path)[:32], "size": size}
    if len(manifest) != expected_count:
        raise ValueError(f"expected {expected_count} assets, found {len(manifest)}")
    if "/404.html" not in manifest:
        raise ValueError("approved static bundle must contain /404.html")
    return manifest

def qualify(target, output):
    worker = target / "cloudflare" / "src" / "worker.js"
    config_path = target / "cloudflare" / "wrangler.manager-invitations-functional-staging.toml"
    if not worker.is_file() or worker.is_symlink():
        raise ValueError("compiled Worker missing or symlink")
    if hash_file(worker) != WORKER_SHA256:
        raise ValueError("exact compiled Worker checksum mismatch")
    config = validate_config(config_path)
    manifest = build_manifest(target / "public")
    report = {
        "mode": "OFFLINE_ONLY_NO_CLOUDFLARE_CALLS",
        "approved_worker": EXPECTED_WORKER,
        "worker_sha256": WORKER_SHA256,
        "config_git_blob_sha1": CONFIG_SHA1,
        "staging_d1": EXPECTED_DB,
        "compatibility_date": config["compatibility_date"],
        "assets_count": len(manifest),
        "manifest": manifest,
        "prohibited_operations": ["deploy", "dns", "route", "preview", "production"],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print("Offline manifest and reviewed Worker qualified; 278 files; NO NETWORK OR DEPLOYMENT")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    qualify(args.target, args.output)

if __name__ == "__main__":
    main()
