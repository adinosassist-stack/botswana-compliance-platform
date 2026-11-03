#!/usr/bin/env python3
"""Offline-only qualification of schema definitions in a local JSON file."""
import json
import sqlite3
import sys
from pathlib import Path

def qualify(path):
    data = json.loads(Path(path).read_text())
    if data.get("kind") != "review_only_application_ddl":
        raise ValueError("invalid_schema_source")
    if data.get("customer_records_included") is not False:
        raise ValueError("customer_rows_forbidden")
    objects = data["definitions"]
    seen = set()
    with sqlite3.connect(":memory:") as db:
        for kind in ("table", "index", "view", "trigger"):
            for obj in objects:
                if obj["type"] != kind:
                    continue
                key = (kind, obj["name"])
                if key in seen or key[1] == "_cf_KV":
                    raise ValueError("unsafe_schema_object")
                seen.add(key)
                db.execute(obj["sql"])
        existing = set(db.execute(
            "SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))
    expected = {key for key in seen if not key[1].startswith("sqlite_autoindex_")}
    report = {"expected": len(expected), "actual": len(existing),
              "missing": len(expected - existing),
              "unexpected": len(existing - expected),
              "remote_database_writes": False}
    print(json.dumps(report))
    return 0 if expected == existing else 2

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: qualify-pop-private-schema-replay.py private-json")
    raise SystemExit(qualify(sys.argv[1]))
