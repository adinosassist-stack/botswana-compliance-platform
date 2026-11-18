#!/usr/bin/env python3
"""Verify immutable manager staging GitHub Actions artifacts without deploying them."""
import argparse
import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile
import zipfile

EXPECTED = {
    "source_sha": "d17e15dc5080d093efbd84c976f15d612d064bb0",
    "worker_zip_sha256": "a2eeaf9f0cd5dda160cf7d10fb5ddc201a71844b24289a178278b4f74d9dabc7",
    "assets_zip_sha256": "8fc3c4e845375bc9bfc30080d5724c2caef138f991d2c5f41a239e8799ad46f5",
    "worker_sha256": "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e",
    "public_tar_sha256": "a2a6099c465a3605227ae77858bbd9d475e9fda7bc3e751fc4f1a3b947a660dc",
    "asset_file_count": 278,
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def safe_name(name):
    norm = pathlib.PurePosixPath(name)
    return bool(name) and not name.startswith("/") and "\\" not in name and ".." not in norm.parts

def archive(path, expected):
    raw = path.read_bytes()
    assert digest(raw) == expected, f"ZIP digest mismatch: {path.name}"
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names = z.namelist()
        assert len(names) == len(set(names)), "duplicate ZIP entries"
        assert all(safe_name(n) for n in names), "unsafe ZIP path"
        assert all(((i.external_attr >> 16) & 0o170000) != 0o120000 for i in z.infolist()), "ZIP symlink"
        return {n: z.read(n) for n in names if not n.endswith("/")}

def manifest(data):
    result = {}
    for line in data.decode("utf-8").splitlines():
        m = re.fullmatch(r"([a-f0-9]{64})\\s+\\*?(.+)", line)
        assert m, f"invalid checksum manifest line: {line[:100]}"
        name = m[2].removeprefix("./")
        assert safe_name(name) and name not in result
        result[name] = m[1]
    return result

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--worker", type=pathlib.Path, required=True)
    p.add_argument("--assets", type=pathlib.Path, required=True)
    p.add_argument("--report", type=pathlib.Path, required=True)
    a = p.parse_args()
    w = archive(a.worker, EXPECTED["worker_zip_sha256"])
    s = archive(a.assets, EXPECTED["assets_zip_sha256"])
    assert set(w) == {"worker.js", "worker.js.map", "README.md", "SHA256SUMS", "BUILD-REFERENCE.txt"}, set(w)
    assert set(s) == {"public.tar", "ASSETS-SHA256SUMS", "ARTIFACT-SHA256SUMS", "BUILD-REFERENCE.txt"}, set(s)
    assert digest(w["worker.js"]) == EXPECTED["worker_sha256"]
    assert digest(s["public.tar"]) == EXPECTED["public_tar_sha256"]
    assert f"git_commit={EXPECTED['source_sha']}" in w["BUILD-REFERENCE.txt"].decode()
    assert f"source_checkout_sha={EXPECTED['source_sha']}" in s["BUILD-REFERENCE.txt"].decode()
    assert "mode=dry-run-no-deployment" in w["BUILD-REFERENCE.txt"].decode()
    assert "workers_dev=false;preview_urls=false;no_routes=true" in w["BUILD-REFERENCE.txt"].decode()
    w_checks = manifest(w["SHA256SUMS"])
    assert set(w_checks) == {"worker.js", "worker.js.map", "README.md"}
    assert all(digest(w[n]) == sha for n, sha in w_checks.items())
    artifact_checks = manifest(s["ARTIFACT-SHA256SUMS"])
    assert set(artifact_checks) == {"public.tar", "ASSETS-SHA256SUMS"}
    assert all(digest(s[n]) == sha for n, sha in artifact_checks.items())
    assets_checks = manifest(s["ASSETS-SHA256SUMS"])
    with tarfile.open(fileobj=io.BytesIO(s["public.tar"]), mode="r:") as tar:
        entries = tar.getmembers()
        files = [m for m in entries if m.isfile()]
        assert all(safe_name(m.name) for m in entries), "unsafe TAR path"
        assert all(m.isdir() or m.isfile() for m in entries), "symlink/hardlink/special TAR entry"
        assert len(files) == EXPECTED["asset_file_count"], "static file count mismatch"
        assert set(assets_checks) == {m.name for m in files}, "missing/extra assets"
        for entry in files:
            assert digest(tar.extractfile(entry).read()) == assets_checks[entry.name], entry.name
    report = {
        "status": "PASS",
        "mode": "OFFLINE_ARTIFACT_VERIFICATION_ONLY_NO_CLOUDFLARE",
        "source_sha": EXPECTED["source_sha"],
        "worker_sha256": EXPECTED["worker_sha256"],
        "public_tar_sha256": EXPECTED["public_tar_sha256"],
        "static_files_verified": len(files),
        "worker_zip_sha256": EXPECTED["worker_zip_sha256"],
        "assets_zip_sha256": EXPECTED["assets_zip_sha256"],
        "worker_artifact_id": 14407666400,
        "assets_artifact_id": 14407970936,
        "deployed": False,
    }
    a.report.parent.mkdir(parents=True, exist_ok=True)
    a.report.write_text(json.dumps(report, indent=2) + "\\n")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("FAIL:", str(exc), file=sys.stderr)
        sys.exit(1)
