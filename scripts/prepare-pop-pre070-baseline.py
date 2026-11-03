#!/usr/bin/env python3
"""Prepare a pinned repository-only baseline. No network or database writes."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
PINS = {
    "cloudflare/schema.sql": "eae3e568e1895dd9f2851059fd3209d25ac9ff3b942411b483508f0b935e3e4d",
    "cloudflare/migrations/070_payment_pop_documents.sql": "f52f9c8e429670cf2e5956b7610e7f1e9b8594e946470ee331ecf06f979c9261",
    "cloudflare/migrations/071_payment_pop_runtime_compat.sql": "24cb1d9e42ef6edaaf04ba53f3945f5112cc61b0c3d52010480be4603c38dc3c",
}


def prepare(root=ROOT):
    sources = {}
    for path, expected in PINS.items():
        data = (root / path).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("pop_baseline_source_mismatch")
        sources[path] = data.decode("utf-8")
    schema, migration, forward = sources.values()
    if schema.count(migration) != 1:
        raise ValueError("pop_baseline_embedded_070_mismatch")
    # Remove only the byte-identical embedded migration; retain all seeds,
    # triggers and unrelated SQL. This is not a production schema snapshot.
    baseline = schema.replace(migration, "", 1)
    with sqlite3.connect(":memory:") as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(baseline)
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"tenants", "payment_orders", "manual_payment_submissions"} <= tables:
            raise ValueError("pop_baseline_dependencies_missing")
        if tables & {"payment_pop_documents", "payment_pop_upload_requests"}:
            raise ValueError("pop_baseline_already_migrated")
        db.executescript(migration)
        db.executescript(forward)
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("pop_baseline_foreign_keys")
    report = {
        "kind": "pop_pre070_repository_baseline", "source_hashes": PINS,
        "baseline_sha256": hashlib.sha256(baseline.encode()).hexdigest(),
        "ordered_rehearsal_passed": True, "fixture": "repository_schema_and_seeds_only",
        "production_contacted": False, "production_compatibility_verified": False,
        "backup_verified": False, "staging_write_authorized": False,
        "production_write_authorized": False,
    }
    return baseline, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schema", action="store_true", help="emit candidate SQL instead of manifest")
    args = parser.parse_args()
    baseline, report = prepare()
    print(baseline if args.schema else json.dumps(report), end="" if args.schema else "\n")
