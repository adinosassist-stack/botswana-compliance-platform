#!/usr/bin/env python3
"""Manager first-version Cloudflare API transport — DENY-BY-DEFAULT.

NOT wired to a production/dispatch workflow. A separate approved PR and protected
GitHub job MUST authorize a one-time call. Never use this script interactively.
It has no PUT, DELETE, script upload/deploy, DNS, routes or deployments POST.
"""
import argparse
import base64
import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import urllib.request
import urllib.error

ACCOUNT = "ddd23cab31928a4bb3d4998df9b26d1d"
NAME = "bw-manager-invitations-functional-private-staging"
API = "https://api.cloudflare.com/client/v4"
ROOT = Path(__file__).resolve().parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

manifest_checks = load("manager_manifest_checks", "manager-bootstrap-offline-manifest.py")
response_checks = load("manager_response_checks", "manager-bootstrap-api-contract.py")

class ProtocolError(RuntimeError):
    pass

class Client:
    def __init__(self, token, transport=None):
        if not token:
            raise ProtocolError("missing protected credential")
        self._token = token
        self._transport = transport or self._send

    @staticmethod
    def _send(req):
        with urllib.request.urlopen(req, timeout=35) as response:
            return response.status, response.read()

    def request(self, method, path, body=None, jwt=None, multipart=False):
        if method not in ("GET", "POST"):
            raise ProtocolError("write method not allowed")
        if not path.startswith(f"/accounts/{ACCOUNT}/"):
            raise ProtocolError("unapproved Cloudflare account")
        if method == "POST" and path not in {
            f"/accounts/{ACCOUNT}/workers/workers",
            f"/accounts/{ACCOUNT}/workers/scripts/{NAME}/assets-upload-session",
            f"/accounts/{ACCOUNT}/workers/assets/upload?base64=true",
        } and not (
            path.startswith(f"/accounts/{ACCOUNT}/workers/workers/")
            and path.endswith("/versions") and path.count("/") == 6
        ):
            raise ProtocolError("unapproved Cloudflare write path")
        if method == "GET" and any(v in path for v in ("?include=modules", "/tokens/", "/secrets")):
            raise ProtocolError("unapproved read path")
        headers = {"Authorization": "Bearer " + (jwt if jwt is not None else self._token)}
        if body is None:
            payload = None
        elif multipart:
            boundary = "thebe-manager-assets-upload-6f7a4da3"
            headers["Content-Type"] = "multipart/form-data; boundary=" + boundary
            payload = body
        else:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(API + path, data=payload, headers=headers, method=method)
        try:
            status, response = self._transport(request)
        except (urllib.error.HTTPError, urllib.error.URLError):
            raise ProtocolError("Cloudflare request failed; inspect protected runner logs (tokens redacted)") from None
        if not (200 <= status < 300):
            raise ProtocolError("Cloudflare request returned non-success response")
        try:
            obj = json.loads(response)
        except (ValueError, UnicodeDecodeError):
            raise ProtocolError("Cloudflare JSON response invalid") from None
        if obj.get("success") is not True or not isinstance(obj.get("result"), (dict, list)):
            raise ProtocolError("Cloudflare API returned failed or ambiguous result")
        return obj["result"]

def encode_bucket(bucket, files_by_hash):
    # Each hash key is the form field name, value is the BASE64 text. Preserve
    # the correct content-type to avoid serving HTML/CSS/JS as octet-stream.
    boundary = "thebe-manager-assets-upload-6f7a4da3"
    parts = []
    for digest in bucket:
        if digest not in files_by_hash:
            raise ProtocolError("API requested unknown immutable asset")
        path = files_by_hash[digest]
        data = base64.b64encode(path.read_bytes())
        mimetype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        parts.append((f'--{boundary}\r\n'
                      f'Content-Disposition: form-data; name="{digest}"; filename="{digest}"\r\n'
                      f'Content-Type: {mimetype}\r\n\r\n').encode() + data + b"\r\n")
    parts.append(("--" + boundary + "--\r\n").encode())
    return b"".join(parts)

def prepare(target):
    worker_path = target / "cloudflare/src/worker.js"
    config_path = target / "cloudflare/wrangler.manager-invitations-functional-staging.toml"
    if not worker_path.is_file() or worker_path.is_symlink():
        raise ProtocolError("Worker artifact missing")
    if manifest_checks.hash_file(worker_path) != manifest_checks.WORKER_SHA256:
        raise ProtocolError("Worker artifact hash mismatch")
    config = manifest_checks.validate_config(config_path)
    manifest = manifest_checks.build_manifest(target / "public")
    if config["name"] != NAME or len(manifest) != 278:
        raise ProtocolError("immutable target mismatch")
    assets_by_hash = {}
    for key, item in manifest.items():
        if item["hash"] in assets_by_hash:
            # Collision/duplicate content is fine only when exact original bytes match.
            if assets_by_hash[item["hash"]].read_bytes() != (target / "public" / key.lstrip("/")).read_bytes():
                raise ProtocolError("asset hash collision")
        assets_by_hash[item["hash"]] = target / "public" / key.lstrip("/")
    return config, manifest, assets_by_hash, worker_path

def inert_bootstrap(client, target):
    config, manifest, files, worker = prepare(target)
    base = f"/accounts/{ACCOUNT}"
    # Do not create anything if any matching Worker already exists.
    existing = client.request("GET", base + "/workers/workers")
    if any(x.get("name") == NAME for x in existing):
        raise ProtocolError("target Worker already exists; manual review required")
    created = client.request("POST", base + "/workers/workers", {
        "name": NAME,
        "subdomain": {"enabled": False, "previews_enabled": False},
    })
    wid = response_checks.verify_worker_record(created)
    session = client.request("POST", base + f"/workers/scripts/{NAME}/assets-upload-session", {"manifest": manifest})
    response_checks.verify_assets_session(session, manifest)
    completion = session["jwt"]
    for bucket in session["buckets"]:
        result = client.request("POST", base + "/workers/assets/upload?base64=true",
                                encode_bucket(bucket, files), jwt=completion, multipart=True)
        if "jwt" in result:
            completion = result["jwt"]
    if not isinstance(completion, str) or not completion:
        raise ProtocolError("missing assets completion JWT")
    bindings = [{"type": "d1", "name": "DB", "id": manifest_checks.EXPECTED_DB},
                {"type": "assets", "name": "ASSETS"}]
    bindings += [{"type": "plain_text", "name": k, "text": v}
                 for k, v in sorted(config["vars"].items())]
    version = client.request("POST", base + f"/workers/workers/{wid}/versions", {
        "main_module": "worker.js",
        "compatibility_date": config["compatibility_date"],
        "modules": [{"name": "worker.js", "content_type": "application/javascript+module",
                     "content_base64": base64.b64encode(worker.read_bytes()).decode("ascii")}],
        "bindings": bindings,
        "assets": {"jwt": completion, "config": {
            "html_handling": config["assets"]["html_handling"],
            "not_found_handling": config["assets"]["not_found_handling"],
            "run_worker_first": config["assets"]["run_worker_first"],
        }},
    })
    version_id = response_checks.verify_first_version(created, version)
    # This is NOT a postflight approval. The protected workflow must separately
    # verify deployments, routes, domains, DNS and Access policy via read-only API.
    return {"worker_id": wid, "version_id": version_id, "assets_count": 278,
            "postflight_required": True, "deployment_status": "UNVERIFIED"}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--prepared-artifacts", type=Path, required=True)
    p.add_argument("--execute-approved-inert-bootstrap", action="store_true")
    args = p.parse_args()
    if not args.execute_approved_inert_bootstrap:
        raise SystemExit("DENIED: execute flag absent; default is no Cloudflare writes")
    if os.environ.get("MANAGER_FIRST_VERSION_OWNER_APPROVED") != "YES" or os.environ.get("MANAGER_FIRST_VERSION_THUSICO_APPROVED") != "YES":
        raise SystemExit("DENIED: independent protected authorization absent")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        raise SystemExit("DENIED: protected credential absent")
    result = inert_bootstrap(Client(token), args.prepared_artifacts)
    print(json.dumps(result, sort_keys=True))

if __name__ == "__main__":
    main()
