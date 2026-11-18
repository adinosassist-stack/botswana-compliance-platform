#!/usr/bin/env python3
"""Unpack the exact reviewed Manager Worker/assets for the *isolated* Cloudflare account.

No network, secrets, Cloudflare API, wrangler deploy, or production-account config.
Fail closed before any writes when the ZIP/TAR/config/manifest provenance differs.
"""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
STANDALONE_CONFIG = ROOT / "cloudflare/wrangler.manager-standalone-account-staging.toml"
LEGACY_CONFIG_NAME = "wrangler.manager-invitations-functional-staging.toml"
EXPECTED_MANIFEST_SHA256 = "2b06f615812022db4a5d2ace49bce433cb1929d25ebde37228dc88d5325f3f6e"
EXPECTED_ACCOUNT = "f585813fa376f7c71c7d4a79254168fa"
EXPECTED_DATABASE = "1a2fc702-2592-491c-9f55-80e032a56dd8"


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verified = _load("manager_verified_original_artifacts", "verify-manager-exact-staging-artifacts.py")
isolated = _load("manager_exact_isolated_qualification", "manager-standalone-offline-qualification.py")


class PreparationError(ValueError):
    pass


def _manifest_sha256(manifest):
    return hashlib.sha256(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _read_and_verify(worker_zip, assets_zip):
    """Read all original bytes and reject dangerous or drifted archive members."""
    worker_entries = verified.archive(
        worker_zip, verified.EXPECTED["worker_zip_sha256"]
    )
    assets_entries = verified.archive(
        assets_zip, verified.EXPECTED["assets_zip_sha256"]
    )
    if set(worker_entries) != {
        "worker.js", "worker.js.map", "README.md", "SHA256SUMS", "BUILD-REFERENCE.txt",
    }:
        raise PreparationError("unexpected original Worker artifact entries")
    if set(assets_entries) != {
        "public.tar", "ASSETS-SHA256SUMS", "ARTIFACT-SHA256SUMS", "BUILD-REFERENCE.txt",
    }:
        raise PreparationError("unexpected original static artifact entries")
    if verified.digest(worker_entries["worker.js"]) != verified.EXPECTED["worker_sha256"]:
        raise PreparationError("compiled Worker SHA-256 changed")
    if verified.digest(assets_entries["public.tar"]) != verified.EXPECTED["public_tar_sha256"]:
        raise PreparationError("original public.tar SHA-256 changed")
    if verified.EXPECTED["source_sha"] not in worker_entries["BUILD-REFERENCE.txt"].decode():
        raise PreparationError("original Worker build source mismatch")
    if verified.EXPECTED["source_sha"] not in assets_entries["BUILD-REFERENCE.txt"].decode():
        raise PreparationError("static build source mismatch")

    worker_checks = verified.manifest(worker_entries["SHA256SUMS"])
    if set(worker_checks) != {"worker.js", "worker.js.map", "README.md"}:
        raise PreparationError("original Worker checksums changed")
    if any(
        verified.digest(worker_entries[name]) != expected
        for name, expected in worker_checks.items()
    ):
        raise PreparationError("Worker internal checksums changed")

    artifact_checks = verified.manifest(assets_entries["ARTIFACT-SHA256SUMS"])
    if set(artifact_checks) != {"public.tar", "ASSETS-SHA256SUMS"}:
        raise PreparationError("static artifact checksums changed")
    if any(
        verified.digest(assets_entries[name]) != expected
        for name, expected in artifact_checks.items()
    ):
        raise PreparationError("static artifact internal checksums changed")

    file_checks = verified.manifest(assets_entries["ASSETS-SHA256SUMS"])
    assets = {}
    seen_casefold = set()
    with tarfile.open(fileobj=io.BytesIO(assets_entries["public.tar"]), mode="r:") as tar:
        members = tar.getmembers()
        if not all(m.isfile() or m.isdir() for m in members):
            raise PreparationError("archive has symlinks, hardlinks or special files")
        for entry in members:
            if not verified.safe_name(entry.name):
                raise PreparationError("invalid original asset archive path")
            pure = PurePosixPath(entry.name)
            if not pure.parts or pure.parts[0] != "public":
                raise PreparationError("original archive path outside public/")
            if entry.isdir():
                continue
            if len(pure.parts) < 2:
                raise PreparationError("asset file has no relative path")
            rel = PurePosixPath(*pure.parts[1:])
            key = "/" + rel.as_posix()
            if key.casefold() in seen_casefold:
                raise PreparationError("duplicate or case-insensitive asset collision")
            seen_casefold.add(key.casefold())
            data = tar.extractfile(entry).read()
            if file_checks.get(entry.name) != verified.digest(data):
                raise PreparationError("static asset checksum mismatch")
            if len(data) > 25 * 1024 * 1024:
                raise PreparationError("static asset exceeds Cloudflare size limit")
            assets[key] = data
    if len(assets) != verified.EXPECTED["asset_file_count"]:
        raise PreparationError("static asset count mismatch")
    if set(file_checks) != {"public" + k for k in assets}:
        raise PreparationError("static asset checksum inventory mismatch")
    if "/404.html" not in assets:
        raise PreparationError("reviewed static assets have no /404.html")
    manifest = {
        key: {"hash": verified.digest(data)[:32], "size": len(data)}
        for key, data in assets.items()
    }
    if _manifest_sha256(manifest) != EXPECTED_MANIFEST_SHA256:
        raise PreparationError("immutable 278-asset manifest SHA-256 mismatch")
    return worker_entries["worker.js"], assets


def prepare(worker_zip, assets_zip, target):
    worker_zip = Path(worker_zip)
    assets_zip = Path(assets_zip)
    target = Path(target)
    if target.exists() or target.is_symlink():
        raise PreparationError("isolated preparation destination must not exist")
    config = isolated.qualified_config()
    if (
        config.get("account_id") != EXPECTED_ACCOUNT
        or config["d1_databases"][0]["database_id"] != EXPECTED_DATABASE
        or config.get("workers_dev") is not False
        or config.get("preview_urls") is not False
        or config.get("routes") or config.get("triggers")
    ):
        raise PreparationError("standalone reviewed configuration does not forbid ingress")
    standalone_content = STANDALONE_CONFIG.read_bytes()
    worker, assets = _read_and_verify(worker_zip, assets_zip)

    # All archive/config provenance checks precede the first filesystem mutation.
    worker_dest = target / "cloudflare/src/worker.js"
    config_dest = target / "cloudflare/wrangler.manager-standalone-account-staging.toml"
    worker_dest.parent.mkdir(parents=True, exist_ok=False)
    worker_dest.write_bytes(worker)
    config_dest.write_bytes(standalone_content)
    public_root = target / "public"
    public_root.mkdir()
    for key, data in assets.items():
        dest = public_root.joinpath(*PurePosixPath(key.lstrip("/")).parts)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    if (target / "cloudflare" / LEGACY_CONFIG_NAME).exists():
        raise PreparationError("legacy production-account staging config must never be staged")

    qualified = isolated.qualify(target)
    if qualified.get("account_id") != EXPECTED_ACCOUNT or qualified.get("database_id") != EXPECTED_DATABASE:
        raise PreparationError("qualified artifact changed to a different Cloudflare account")
    extracted_manifest = isolated.immutable.build_manifest(public_root)
    if _manifest_sha256(extracted_manifest) != EXPECTED_MANIFEST_SHA256:
        raise PreparationError("re-extracted static asset manifest mismatch")
    if config_dest.read_bytes() != STANDALONE_CONFIG.read_bytes():
        raise PreparationError("packaged standalone config changed")
    return {
        "mode": "OFFLINE_STANDALONE_ARTIFACT_PREPARATION_NO_NETWORK",
        "account_id": EXPECTED_ACCOUNT,
        "database_id": EXPECTED_DATABASE,
        "worker_sha256": verified.EXPECTED["worker_sha256"],
        "manifest_sha256": EXPECTED_MANIFEST_SHA256,
        "assets_count": len(assets),
        "legacy_config_staged": False,
        "public_ingress": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.worker, args.assets, args.target)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
