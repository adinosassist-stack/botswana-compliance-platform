#!/usr/bin/env python3
"""Offline, read-only POP staging catalog comparison; no network or SQL execution.

Input JSON files each contain {objects:[{name,type,tbl_name},...]} from
SELECT type,name,tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'.
Never include sqlite_master.sql or customer rows in evidence artifacts.
"""
import argparse
import json
from pathlib import Path

PRODUCTION = "production"
STAGING = "staging"
REQUIRED = {"tenants", "payment_orders", "manual_payment_submissions"}
POP = {"payment_pop_documents", "payment_pop_upload_requests"}


def load(path):
    payload = json.loads(Path(path).read_text(encoding="utf8"))
    if set(payload) != {"objects"} or not isinstance(payload["objects"], list):
        raise ValueError("catalog_invalid_shape")
    objects = {}
    for row in payload["objects"]:
        if not isinstance(row, dict) or not {"name", "type", "tbl_name"} <= set(row):
            raise ValueError("catalog_invalid_record")
        name, kind = row["name"], row["type"]
        if not isinstance(name, str) or not name or kind not in {"table", "index", "trigger", "view"}:
            raise ValueError("catalog_invalid_object")
        if (kind, name) in objects:
            raise ValueError("catalog_duplicate_object")
        objects[(kind, name)] = row["tbl_name"]
    return objects


def compare(prod, staging):
    prod_tables = {name for (kind, name) in prod if kind == "table"}
    staging_tables = {name for (kind, name) in staging if kind == "table"}
    missing_prod = sorted(REQUIRED - prod_tables)
    pop_present_prod = sorted(POP & prod_tables)
    missing_staging = sorted(set(prod) - set(staging))
    extra_staging = sorted(set(staging) - set(prod))
    mismatched_owners = sorted(f"{kind}:{name}" for (kind,name) in prod.keys() & staging.keys()
                               if prod[(kind,name)] != staging[(kind,name)])
    ready = not (missing_prod or pop_present_prod or missing_staging or extra_staging or mismatched_owners)
    return {
        "kind": "pop_production_staging_catalog_inventory",
        "production_object_count": len(prod),
        "staging_object_count": len(staging),
        "production_prerequisite_tables_missing": missing_prod,
        "production_pop_tables_present": pop_present_prod,
        "staging_objects_missing": [f"{kind}:{name}" for kind,name in missing_staging],
        "staging_objects_extra": [f"{kind}:{name}" for kind,name in extra_staging],
        "staging_owner_mismatch": mismatched_owners,
        "catalog_equal": not (missing_staging or extra_staging or mismatched_owners),
        "pop_pre070_catalog_ready": ready,
        "column_fk_index_definition_parity_proven": False,
        "production_compatibility_verified": False,
        "backup_restore_verified": False,
        "mutation_performed": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", required=True, help="non-sensitive production catalog JSON")
    parser.add_argument("--staging", required=True, help="non-sensitive staging catalog JSON")
    args = parser.parse_args()
    report = compare(load(args.production), load(args.staging))
    print(json.dumps(report, sort_keys=True, indent=2))
    if not report["pop_pre070_catalog_ready"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
