#!/usr/bin/env python3
"""Standalone Manager Worker first-version transport: INERT SOURCE ONLY.

This module deliberately has NO HTTP client, credentials, CLI dispatch, or live
workflow wiring. An independently approved protected runner would have to inject
an authenticated request adapter after exact source/asset/security review.
No direct/interactive execution is supported. Never connect to production.
"""
import base64
import hashlib
import importlib.util
import json
import mimetypes
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "manager_standalone_qualification",
    ROOT / "manager-standalone-offline-qualification.py",
)
offline = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(offline)

ACCOUNT = "f585813fa376f7c71c7d4a79254168fa"
DATABASE = "1a2fc702-2592-491c-9f55-80e032a56dd8"
WORKER = "bw-manager-invitations-functional-private-staging"
POLICY_ID = "6fc750df-7e40-492f-845d-47e6e5deab0b"
IDP_ID = "a8fac234-02d0-4f3e-a821-471cf4eee7f8"
TESTER = "banabothem@yahoo.com"
PRODUCTION_ACCOUNT = "ddd23cab31928a4bb3d4998df9b26d1d"
WORKER_SHA256 = "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e"
BASE = "/accounts/" + ACCOUNT
ASSET_MULTIPART_BOUNDARY = "thebe-standalone-manager-assets-f26a7b"


class FirstVersionGateError(ValueError):
    pass


def _rows(value, label):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "versions", "deployments", "result"):
            if isinstance(value.get(key), list):
                return value[key]
    raise FirstVersionGateError(label + " response shape unknown")


def _expect_record(value, label):
    if not isinstance(value, dict):
        raise FirstVersionGateError(label + " response shape unknown")
    return value


def _record(value):
    obj = _expect_record(value, "Worker")
    wid = obj.get("id")
    if not isinstance(wid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", wid):
        raise FirstVersionGateError("invalid Worker identifier")
    if obj.get("name") != WORKER or obj.get("deployed_on") is not None:
        raise FirstVersionGateError("Worker name/deployed state mismatch")
    sub = obj.get("subdomain")
    if not isinstance(sub, dict) or sub.get("enabled") is not False or sub.get("previews_enabled") is not False:
        raise FirstVersionGateError("Worker public or preview URL status unsafe/unknown")
    return wid


def preflight(client):
    """Every inventory result is required; an unknown state stops before writes."""
    db = _expect_record(client.request("GET", BASE + "/d1/database/" + DATABASE), "D1")
    if (db.get("uuid") != DATABASE or
        db.get("name") != "bw-manager-invitations-synthetic-staging" or
        db.get("num_tables") != 13 or
        db.get("read_replication", {}).get("mode") != "disabled"):
        raise FirstVersionGateError("isolated D1 mismatch")
    org = _expect_record(client.request("GET", BASE + "/access/organizations"), "Zero Trust")
    if org.get("deny_unmatched_requests") is not True or org.get("strict_service_token_auth") is not True:
        raise FirstVersionGateError("Zero Trust organization not default-deny")
    policies = _rows(client.request("GET", BASE + "/access/policies"), "Access policies")
    if (len(policies) != 1 or not isinstance(policies[0], dict) or
        policies[0].get("id") != POLICY_ID or policies[0].get("app_count") != 0 or
        policies[0].get("decision") != "allow" or
        policies[0].get("include") != [{"email": {"email": TESTER}}] or
        policies[0].get("exclude") != [] or policies[0].get("require") != []):
        raise FirstVersionGateError("detached single-tester Access policy mismatch")
    idps = _rows(client.request("GET", BASE + "/access/identity_providers"), "identity providers")
    if len(idps) != 1 or idps[0].get("id") != IDP_ID or idps[0].get("type") != "onetimepin":
        raise FirstVersionGateError("isolated One-time PIN provider mismatch")
    for suffix, label in (
        ("/access/apps", "Access applications"),
        ("/workers/workers", "Worker records"),
        ("/workers/scripts", "Worker scripts"),
        ("/workers/domains", "Worker custom domains"),
    ):
        if _rows(client.request("GET", BASE + suffix), label):
            raise FirstVersionGateError(label + " already exists: manual review needed")
    return {"status": "PREFLIGHT_PASS_NO_INGRESS", "account": ACCOUNT, "database": DATABASE}


def _hash_manifest(manifest):
    return hashlib.sha256(json.dumps(
        manifest, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def _assets(manifest, prepared):
    files = {}
    for key, info in manifest.items():
        digest = info["hash"]
        path = prepared / "public" / key.lstrip("/")
        if digest in files:
            if files[digest].read_bytes() != path.read_bytes():
                raise FirstVersionGateError("asset digest collision")
        else:
            files[digest] = path
    return files


def _bucket_payload(bucket, files):
    if not isinstance(bucket, list) or not bucket or len(set(bucket)) != len(bucket):
        raise FirstVersionGateError("invalid asset upload bucket")
    boundary = ASSET_MULTIPART_BOUNDARY
    result = []
    for digest in bucket:
        if digest not in files:
            raise FirstVersionGateError("unknown asset upload digest")
        file = files[digest]
        mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        data = base64.b64encode(file.read_bytes())
        result.append(
            ('--' + boundary + '\r\n'
             + 'Content-Disposition: form-data; name="' + digest + '"; filename="' + digest + '"\r\n'
             + 'Content-Type: ' + mime + '\r\n\r\n').encode() + data + b'\r\n'
        )
    result.append(('--' + boundary + '--\r\n').encode())
    return b''.join(result)


def postflight(client, worker_id, version_id, config, approved_bindings):
    """Fail closed unless exact one version and no deploy/ingress in standalone account."""
    record = _expect_record(client.request("GET", BASE + "/workers/workers/" + worker_id), "Worker")
    if _record(record) != worker_id:
        raise FirstVersionGateError("Worker identity changed")
    versions = _rows(client.request("GET", BASE + "/workers/workers/" + worker_id + "/versions"), "versions")
    if (len(versions) != 1 or not isinstance(versions[0], dict) or
        versions[0].get("id") != version_id or versions[0].get("deployed_on") not in (None, "")):
        raise FirstVersionGateError("unexpected version count or deployment")
    details = _expect_record(
        client.request("GET", BASE + "/workers/workers/" + worker_id + "/versions/" + version_id),
        "Worker version details",
    )
    if (details.get("id") != version_id or
        details.get("main_module") != "worker.js" or
        details.get("compatibility_date") != config["compatibility_date"] or
        details.get("deployed_on") not in (None, "")):
        raise FirstVersionGateError("version identity/runtime/deployment mismatch")
    actual_bindings = details.get("bindings")
    if not isinstance(actual_bindings, list) or len(actual_bindings) != len(approved_bindings):
        raise FirstVersionGateError("version binding count mismatch")
    def normalize(binding):
        if not isinstance(binding, dict):
            raise FirstVersionGateError("malformed Worker version binding")
        kind, name = binding.get("type"), binding.get("name")
        if not isinstance(name, str) or kind not in ("d1", "assets", "plain_text"):
            raise FirstVersionGateError("unapproved version binding")
        # Cloudflare's version API requires `database_id` for D1 bindings.
        # The former `id` alias is deprecated and is not sufficient for a
        # reviewer-qualified response binding identity.
        fields = ("type", "name", "database_id") if kind == "d1" else (
            ("type", "name", "text") if kind == "plain_text" else ("type", "name")
        )
        return tuple((f, binding.get(f)) for f in fields)
    if sorted(normalize(b) for b in actual_bindings) != sorted(normalize(b) for b in approved_bindings):
        raise FirstVersionGateError("version bindings differ from reviewed isolated configuration")
    if details.get("urls") not in (None, []):
        raise FirstVersionGateError("first version unexpectedly exposes URLs")
    if _rows(client.request("GET", BASE + "/workers/scripts/" + WORKER + "/deployments"), "deployments"):
        raise FirstVersionGateError("Worker deployment unexpectedly exists")
    subdomain = _expect_record(
        client.request("GET", BASE + "/workers/scripts/" + WORKER + "/subdomain"), "workers.dev"
    )
    if subdomain.get("enabled") is not False:
        raise FirstVersionGateError("workers.dev enabled/unknown")
    if _rows(client.request("GET", BASE + "/workers/domains"), "custom domains"):
        raise FirstVersionGateError("custom domain unexpectedly exists")
    if _rows(client.request("GET", BASE + "/access/apps"), "Access applications"):
        raise FirstVersionGateError("Access app unexpectedly attached before separate gate")
    return {
        "status": "FIRST_VERSION_UNDEPLOYED_POSTFLIGHT_PASS",
        "account": ACCOUNT, "database": DATABASE, "worker": WORKER,
        "worker_id": worker_id, "version_id": version_id,
        "deployments": 0, "custom_domains": 0, "access_apps": 0,
        "workers_dev": False, "preview_urls": False,
        "route_and_dns_verification": "separate mandatory zone/hostname audit before ingress",
        "public_login": False,
    }


def upload_asset_buckets(client, manifest, files):
    session = _expect_record(client.request(
        "POST", BASE + "/workers/scripts/" + WORKER + "/assets-upload-session",
        body={"manifest": manifest},
    ), "assets session")
    token = session.get("jwt")
    buckets = session.get("buckets")
    if not isinstance(token, str) or not token or not isinstance(buckets, list):
        raise FirstVersionGateError("asset upload session invalid")
    completion = token if not buckets else None
    seen = set()
    for index, bucket in enumerate(buckets):
        if not isinstance(bucket, list) or any(d in seen for d in bucket):
            raise FirstVersionGateError("duplicated/invalid asset bucket")
        seen.update(bucket)
        response = client.request(
            "POST", BASE + "/workers/assets/upload?base64=true",
            body=_bucket_payload(bucket, files), jwt=token, multipart=True,
            content_type="multipart/form-data; boundary=" + ASSET_MULTIPART_BOUNDARY,
        )
        next_jwt = _expect_record(response, "asset completion").get("jwt")
        if next_jwt is None and index < len(buckets) - 1:
            continue
        if not isinstance(next_jwt, str) or not next_jwt:
            raise FirstVersionGateError("asset upload did not return completion token")
        if index != len(buckets) - 1:
            raise FirstVersionGateError("asset completion token returned before final bucket")
        completion = next_jwt
    if not completion:
        raise FirstVersionGateError("incomplete assets; version creation forbidden")

    return completion


def bootstrap_inert_record_and_version(client, prepared_artifacts, approved_manifest_sha256):
    """This callable is intentionally NOT wired to any authenticated runner."""
    if (not isinstance(approved_manifest_sha256, str) or
        not re.fullmatch(r"[0-9a-f]{64}", approved_manifest_sha256)):
        raise FirstVersionGateError("missing approved manifest digest")
    prepared = Path(prepared_artifacts)
    qualification = offline.qualify(prepared)
    if qualification.get("account_id") != ACCOUNT or qualification.get("database_id") != DATABASE:
        raise FirstVersionGateError("account or D1 qualification mismatch")
    if qualification.get("original_worker_sha256") != WORKER_SHA256:
        raise FirstVersionGateError("compiled Worker digest mismatch")
    config = offline.qualified_config()
    manifest = offline.immutable.build_manifest(prepared / "public")
    if _hash_manifest(manifest) != approved_manifest_sha256:
        raise FirstVersionGateError("manifest differs from independent approval")
    if len(manifest) != 278:
        raise FirstVersionGateError("incomplete immutable assets")
    worker = prepared / "cloudflare/src/worker.js"
    if offline.immutable.hash_file(worker) != WORKER_SHA256:
        raise FirstVersionGateError("Worker byte digest mismatch")
    files = _assets(manifest, prepared)

    preflight(client)  # Must verify every read-only gate BEFORE first write
    record = client.request("POST", BASE + "/workers/workers", body={
        "name": WORKER, "subdomain": {"enabled": False, "previews_enabled": False},
    })
    worker_id = _record(record)
    # Never begin asset upload before confirming inert created Worker record.
    if _record(client.request("GET", BASE + "/workers/workers/" + worker_id)) != worker_id:
        raise FirstVersionGateError("new Worker record readback mismatch")
    completion = upload_asset_buckets(client, manifest, files)

    bindings = [
        {"type": "d1", "name": "DB", "database_id": DATABASE},
        {"type": "assets", "name": "ASSETS"},
    ] + [{"type": "plain_text", "name": k, "text": v} for k, v in sorted(config["vars"].items())]
    version = _expect_record(client.request(
        "POST", BASE + "/workers/workers/" + worker_id + "/versions?deploy=false",
        body={
            "main_module": "worker.js",
            "compatibility_date": config["compatibility_date"],
            "modules": [{
                "name": "worker.js",
                "content_type": "application/javascript+module",
                "content_base64": base64.b64encode(worker.read_bytes()).decode("ascii"),
            }],
            "bindings": bindings,
            "assets": {"jwt": completion, "config": {
                "html_handling": config["assets"]["html_handling"],
                "not_found_handling": config["assets"]["not_found_handling"],
                "run_worker_first": config["assets"]["run_worker_first"],
            }},
        },
    ), "undeployed first version")
    version_id = version.get("id")
    if (not isinstance(version_id, str) or
        not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", version_id) or
        version.get("deployed_on") not in (None, "")):
        raise FirstVersionGateError("first version ID/deployment status invalid")
    return postflight(client, worker_id, version_id, config, bindings)


if __name__ == "__main__":
    raise SystemExit("DENIED: inert source module only; no CLI, live runner, or credential access")
