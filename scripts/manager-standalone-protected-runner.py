#!/usr/bin/env python3
"""Protected, *opt-in* initial Manager Worker upload. DENY BY DEFAULT.

This script cannot run from a normal terminal or from a PR. It requires exact
owner + independent reviewer GitHub issue approvals, source SHA, immutable
manifest hash, an owner-dispatched main-branch workflow, and a protected
isolated-account credential. No deploy, routes, DNS, Access ingress, or login.

Repository environment manager-standalone-first-version-protected MUST have
an independent thusico reviewer, self-review prevention and main-only branches.
No approval is inferred from a merged source PR.
"""
import argparse
import importlib.util
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE = HERE / "manager-standalone-inert-version-transport.py"
_spec = importlib.util.spec_from_file_location("manager_standalone_inert", MODULE)
inert = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(inert)

ACCOUNT = "f585813fa376f7c71c7d4a79254168fa"
D1 = "1a2fc702-2592-491c-9f55-80e032a56dd8"
MANIFEST_SHA256 = "2b06f615812022db4a5d2ace49bce433cb1929d25ebde37228dc88d5325f3f6e"
WORKER_SHA256 = "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e"
REPO = "adinosassist-stack/botswana-compliance-platform"
ISSUE_NUMBER = 2599
WORKFLOW = ".github/workflows/manager-standalone-protected-first-version.yml"
ACTION = "APPROVE_MANAGER_STANDALONE_FIRST_VERSION_ONLY_NO_DEPLOY"
APPROVAL_STAMP = "NO_PUBLIC_INGRESS_OR_PRODUCTION_CHANGES"
API = "https://api.cloudflare.com/client/v4"
GITHUB_API = "https://api.github.com"
BASE = "/accounts/" + ACCOUNT


class ProtectedRunnerError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ProtectedRunnerError("HTTP redirect denied")


def _read_json(req, limit=7_000_000):
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=35) as response:
            if response.status < 200 or response.status >= 300:
                raise ProtectedRunnerError("non-success HTTP response")
            raw = response.read(limit + 1)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
        # Never return HTTP bodies: they can contain credentials or JWTs.
        raise ProtectedRunnerError("protected request failed: HTTP/API transport") from None
    if len(raw) > limit:
        raise ProtectedRunnerError("unbounded API response denied")
    try:
        return json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise ProtectedRunnerError("invalid JSON API response") from None


def _github_comment(token, comment_id):
    if not isinstance(comment_id, int) or comment_id < 1:
        raise ProtectedRunnerError("invalid issue approval comment identifier")
    req = urllib.request.Request(
        GITHUB_API + "/repos/" + REPO + "/issues/comments/" + str(comment_id),
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="GET",
    )
    result = _read_json(req)
    if not isinstance(result, dict) or result.get("issue_url") != (
        GITHUB_API + "/repos/" + REPO + "/issues/" + str(ISSUE_NUMBER)
    ):
        raise ProtectedRunnerError("approval comment is not on exact tracking issue")
    return result


def verify_approvals(owner, reviewer, source_sha):
    """An independent decision must be independently authored and scope-pinned."""
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
        raise ProtectedRunnerError("invalid exact reviewed source SHA")
    if owner.get("id") == reviewer.get("id"):
        raise ProtectedRunnerError("same comment cannot provide two approvals")
    for comment, expected_user in ((owner, "adinosassist-stack"), (reviewer, "thusico")):
        if comment.get("user", {}).get("login") != expected_user:
            raise ProtectedRunnerError("approval author is not the required principal")
        body = comment.get("body")
        if not isinstance(body, str):
            raise ProtectedRunnerError("missing approval body")
        required = (
            ACTION, source_sha, MANIFEST_SHA256, WORKER_SHA256,
            ACCOUNT, D1, APPROVAL_STAMP,
        )
        if any(value not in body for value in required):
            raise ProtectedRunnerError("approval not pinned to identical source and scope")
        if "REQUEST CHANGES" in body.upper():
            raise ProtectedRunnerError("approval contains changes requested")
    return True


def verify_runtime(env, source_sha):
    required = {
        "GITHUB_ACTIONS": "true",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REPOSITORY": REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_SHA": source_sha,
        "GITHUB_ACTOR": "adinosassist-stack",
        "GITHUB_WORKFLOW_REF": REPO + "/" + WORKFLOW + "@refs/heads/main",
        "CLOUDFLARE_ACCOUNT_ID": ACCOUNT,
        "MANAGER_STAGING_EXECUTION_MODE": "FIRST_VERSION_ONLY_NO_DEPLOY",
    }
    for key, value in required.items():
        if env.get(key) != value:
            raise ProtectedRunnerError("protected GitHub environment identity mismatch: " + key)
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
        raise ProtectedRunnerError("invalid exact source SHA")
    if env.get("GITHUB_EVENT_NAME") == "pull_request" or env.get("GITHUB_REF") != "refs/heads/main":
        raise ProtectedRunnerError("PR or non-main execution denied")
    return True


class CloudflareClient:
    """Minimal API adapter with closed allowlists; no routes or deployments writes."""

    def __init__(self, token):
        if not isinstance(token, str) or len(token) < 10:
            raise ProtectedRunnerError("protected Cloudflare credential missing")
        self.__token = token

    @staticmethod
    def _allowed(method, path):
        static_get = {
            BASE + suffix for suffix in (
                "/d1/database/" + D1, "/access/organizations", "/access/policies",
                "/access/identity_providers", "/access/apps", "/workers/workers",
                "/workers/scripts", "/workers/domains",
                "/workers/scripts/" + inert.WORKER + "/deployments",
                "/workers/scripts/" + inert.WORKER + "/subdomain",
            )
        }
        static_post = {
            BASE + "/workers/workers",
            BASE + "/workers/scripts/" + inert.WORKER + "/assets-upload-session",
            BASE + "/workers/assets/upload?base64=true",
        }
        worker = r"[a-zA-Z0-9_-]{8,64}"
        ver = r"[a-zA-Z0-9_-]{8,64}"
        if method == "GET":
            return path in static_get or bool(re.fullmatch(
                re.escape(BASE) + r"/workers/workers/" + worker
                + r"(?:/versions(?:/" + ver + r")?)?", path
            ))
        if method == "POST":
            return path in static_post or bool(re.fullmatch(
                re.escape(BASE) + r"/workers/workers/" + worker
                + r"/versions\?deploy=false", path
            ))
        return False

    def request(self, method, path, body=None, jwt=None, multipart=False, content_type=None):
        if not self._allowed(method, path):
            raise ProtectedRunnerError("unapproved Cloudflare method/path")
        if jwt is not None and path != BASE + "/workers/assets/upload?base64=true":
            raise ProtectedRunnerError("JWT permitted only for immutable asset upload")
        if multipart != (path == BASE + "/workers/assets/upload?base64=true"):
            raise ProtectedRunnerError("multipart mode restricted to assets API")
        if method == "GET" and (body is not None or jwt is not None or multipart):
            raise ProtectedRunnerError("GET must be read-only")
        if method == "POST" and body is None:
            raise ProtectedRunnerError("POST body missing")
        headers = {"Authorization": "Bearer " + (jwt if jwt is not None else self.__token)}
        if multipart:
            if not isinstance(body, bytes) or not content_type or not content_type.startswith(
                "multipart/form-data; boundary=thebe-standalone-manager-assets-"
            ):
                raise ProtectedRunnerError("asset MIME/boundary mismatched")
            payload = body
            headers["Content-Type"] = content_type
            if len(payload) > 64 * 1024 * 1024:
                raise ProtectedRunnerError("asset upload exceeds approved per-request limit")
        elif body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        else:
            payload = None
        result = _read_json(urllib.request.Request(
            API + path, data=payload, headers=headers, method=method,
        ))
        if not isinstance(result, dict) or result.get("success") is not True:
            raise ProtectedRunnerError("Cloudflare returned failure/unknown status")
        value = result.get("result")
        if not isinstance(value, (list, dict)):
            raise ProtectedRunnerError("Cloudflare response data missing")
        return value


def run(args, env, get_comment=_github_comment):
    if not args.execute_approved:
        raise ProtectedRunnerError("DENIED: explicit protected execution flag missing")
    verify_runtime(env, args.source_sha)
    if args.manifest_sha256 != MANIFEST_SHA256:
        raise ProtectedRunnerError("immutable manifest SHA-256 mismatch")
    if args.owner_comment_id == args.reviewer_comment_id:
        raise ProtectedRunnerError("owner and reviewer comments must differ")
    github_token = env.get("GH_TOKEN", "")
    if not github_token:
        raise ProtectedRunnerError("protected GitHub read credential absent")
    owner = get_comment(github_token, args.owner_comment_id)
    reviewer = get_comment(github_token, args.reviewer_comment_id)
    verify_approvals(owner, reviewer, args.source_sha)
    # Independently validate exact compiled Worker, unchanged config, all 278 files.
    prepared = Path(args.prepared_artifacts)
    offline_receipt = inert.offline.qualify(prepared)
    manifest = inert.offline.immutable.build_manifest(prepared / "public")
    if offline_receipt.get("account_id") != ACCOUNT or (
        offline_receipt.get("original_worker_sha256") != WORKER_SHA256
    ) or inert._hash_manifest(manifest) != MANIFEST_SHA256:
        raise ProtectedRunnerError("offline source/artifact verification failed")
    # Only reach the protected Cloudflare credential after all approvals and bytes.
    cf_token = env.get("MANAGER_STANDALONE_WORKER_TOKEN", "")
    if not cf_token:
        raise ProtectedRunnerError("dedicated standalone Worker token missing")
    return inert.bootstrap_inert_record_and_version(
        CloudflareClient(cf_token), prepared, MANIFEST_SHA256,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared-artifacts", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--owner-comment-id", type=int, required=True)
    parser.add_argument("--reviewer-comment-id", type=int, required=True)
    parser.add_argument("--execute-approved", action="store_true")
    args = parser.parse_args()
    try:
        result = run(args, os.environ)
    except ProtectedRunnerError as exc:
        # Generic error only; do not log bearer tokens, JWTs, or provider bodies.
        raise SystemExit("DENIED: " + str(exc)) from None
    # Result includes only IDs and nonsecret postflight facts.
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
