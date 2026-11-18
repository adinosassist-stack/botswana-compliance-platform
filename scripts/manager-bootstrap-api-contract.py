#!/usr/bin/env python3
"""Offline-only Cloudflare manager initial-version API response contract.

This module does not implement HTTP transport or read credentials. All functions
accept synthetic API response dictionaries for unit testing. It cannot deploy.
"""
from typing import Any

ACCOUNT = "ddd23cab31928a4bb3d4998df9b26d1d"
NAME = "bw-manager-invitations-functional-private-staging"
ALLOWED_PATHS = {
    "worker_create": f"/accounts/{ACCOUNT}/workers/workers",
    "assets_session": f"/accounts/{ACCOUNT}/workers/scripts/{NAME}/assets-upload-session",
    "asset_upload": f"/accounts/{ACCOUNT}/workers/assets/upload?base64=true",
}
EXPECTED_ASSETS = 278

def verify_worker_record(api_result: dict[str, Any]) -> str:
    """Reject any initial Worker that can already serve traffic."""
    if not isinstance(api_result, dict):
        raise ValueError("missing Worker response")
    worker_id = api_result.get("id")
    if not isinstance(worker_id, str) or len(worker_id) < 8:
        raise ValueError("missing Worker ID")
    if api_result.get("name") != NAME:
        raise ValueError("incorrect Worker name")
    if api_result.get("deployed_on") is not None:
        raise ValueError("Worker already deployed")
    subdomain = api_result.get("subdomain")
    if not isinstance(subdomain, dict):
        raise ValueError("Worker subdomain status missing")
    if subdomain.get("enabled") is not False or subdomain.get("previews_enabled") is not False:
        raise ValueError("Worker has public or preview address enabled")
    return worker_id

def verify_assets_session(response: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    """Require a complete 278-file manifest and valid missing-upload buckets."""
    if len(manifest) != EXPECTED_ASSETS:
        raise ValueError("incomplete asset manifest")
    for path, meta in manifest.items():
        if not path.startswith("/") or not isinstance(meta, dict):
            raise ValueError("invalid asset manifest path")
        h = meta.get("hash")
        if not isinstance(h, str) or len(h) != 32 or any(c not in "0123456789abcdef" for c in h):
            raise ValueError("invalid asset hash")
        if not isinstance(meta.get("size"), int) or meta["size"] < 0:
            raise ValueError("invalid asset size")
    jwt = response.get("jwt")
    buckets = response.get("buckets")
    if not isinstance(jwt, str) or not jwt or not isinstance(buckets, list):
        raise ValueError("upload session token or buckets missing")
    known_hashes = {meta["hash"] for meta in manifest.values()}
    for bucket in buckets:
        if not isinstance(bucket, list) or not bucket:
            raise ValueError("malformed upload bucket")
        if any(hashval not in known_hashes for hashval in bucket):
            raise ValueError("Cloudflare requested unrecognized asset")
    return {"uploads_required": sum(len(bucket) for bucket in buckets),
            "completion_token_available": len(buckets) == 0}

def verify_first_version(record: dict[str, Any], version: dict[str, Any]) -> str:
    """Version creation alone is not deployment authorization."""
    worker_id = verify_worker_record(record)
    version_id = version.get("id")
    if not isinstance(version_id, str) or len(version_id) < 8:
        raise ValueError("initial version ID missing")
    if version.get("deployed_on") not in (None, ""):
        raise ValueError("unexpected version deployment")
    if not worker_id:
        raise ValueError("missing isolated Worker record")
    return version_id

def verify_postflight(worker: dict[str, Any], versions: list[dict[str, Any]],
                      deployments: list[dict[str, Any]], routes: list[dict[str, Any]],
                      domains: list[dict[str, Any]], dns: list[dict[str, Any]]) -> str:
    """Fail closed unless exact Worker has one undeployed version and zero ingress."""
    verify_worker_record(worker)
    if len(versions) != 1:
        raise ValueError("expected exactly one undeployed version")
    version_id = verify_first_version(worker, versions[0])
    if any((deployments, routes, domains, dns)):
        raise ValueError("deployment or public ingress exists")
    return version_id

def permitted_method_path_pairs(worker_id: str) -> frozenset[tuple[str, str]]:
    """Document the isolated write allowlist; no deployment/PUT/DNS methods."""
    if not worker_id or "/" in worker_id or "?" in worker_id:
        raise ValueError("invalid Worker ID")
    return frozenset({
        ("POST", ALLOWED_PATHS["worker_create"]),
        ("POST", ALLOWED_PATHS["assets_session"]),
        ("POST", ALLOWED_PATHS["asset_upload"]),
        ("POST", f"/accounts/{ACCOUNT}/workers/workers/{worker_id}/versions"),
    })
