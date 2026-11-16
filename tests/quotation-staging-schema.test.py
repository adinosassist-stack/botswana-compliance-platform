"""Offline staging D1 schema contract; NEVER connects to Cloudflare or production.

Exercises the *exact* checked-in SQL using SQLite, with foreign keys enabled.
No private customer logos, IDs, tokens or network access are needed.
"""
import sqlite3
import unittest
from pathlib import Path

SCHEMA = (Path(__file__).resolve().parents[1] /
          "docs/sql/quotation-logo-staging-candidate.sql").read_text(encoding="utf-8")
ASSET_INSERT = (
    "INSERT INTO quotation_logo_assets "
    "(id,tenant_id,object_key,mime_type,width,height,aspect_ratio) "
    "VALUES (?,?,?,?,?,?,?)"
)
SETTINGS_UPSERT = (
    "INSERT INTO quotation_logo_settings "
    "(tenant_id,asset_id,x_percent,y_percent,width_percent,updated_at) "
    "VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) "
    "ON CONFLICT(tenant_id) DO UPDATE SET "
    "asset_id=excluded.asset_id,x_percent=excluded.x_percent,"
    "y_percent=excluded.y_percent,width_percent=excluded.width_percent,"
    "updated_at=CURRENT_TIMESTAMP"
)


def database():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    if db.execute("PRAGMA foreign_keys").fetchone()[0] != 1:
        raise AssertionError("offline_schema_tests_require_foreign_keys")
    db.executescript(SCHEMA)
    return db


def logo(tenant="tenantA", asset="logo1", **overrides):
    fields = dict(id=asset, tenant_id=tenant,
                  object_key=f"quotation-logos/{tenant}/{asset}",
                  mime_type="image/png", width=200, height=100,
                  aspect_ratio=2.0)
    fields.update(overrides)
    return tuple(fields[k] for k in
                 ("id", "tenant_id", "object_key", "mime_type",
                  "width", "height", "aspect_ratio"))


class QuotationStagingSchemaContract(unittest.TestCase):
    def test_exact_two_tables_and_composite_tenant_fk(self):
        with database() as db:
            names = [r[0] for r in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
                " AND name NOT LIKE 'sqlite_%' ORDER BY name")]
            self.assertEqual(names, ["quotation_logo_assets",
                                     "quotation_logo_settings"])
            refs = [r for r in db.execute(
                "PRAGMA foreign_key_list('quotation_logo_settings')")]
            self.assertEqual({(r[3], r[4]) for r in refs},
                             {("tenant_id", "tenant_id"), ("asset_id", "id")})
        self.assertNotIn("IF NOT EXISTS", SCHEMA.upper().replace(
            "NO IF NOT EXISTS:", "NO EXISTING TABLE:"))
        self.assertNotIn("DROP TABLE", SCHEMA.upper())
        self.assertNotIn("ALTER TABLE", SCHEMA.upper())

    def test_preexisting_tables_abort_instead_of_being_silently_accepted(self):
        db = database()
        self.addCleanup(db.close)
        with self.assertRaises(sqlite3.OperationalError):
            db.executescript(SCHEMA)

    def test_valid_logo_saves_settings_and_upserts_per_tenant(self):
        with database() as db:
            db.execute(ASSET_INSERT, logo("tenantA", "sameId"))
            db.execute(ASSET_INSERT, logo("tenantB", "sameId"))
            db.execute(SETTINGS_UPSERT, ("tenantA", "sameId", 4, 2, 20))
            db.execute(SETTINGS_UPSERT, ("tenantB", "sameId", 8, 3, 18))
            db.execute(SETTINGS_UPSERT, ("tenantA", "sameId", 10, 2, 25))
            rows = db.execute(
                "SELECT tenant_id,asset_id,x_percent,width_percent "
                "FROM quotation_logo_settings ORDER BY tenant_id"
            ).fetchall()
            self.assertEqual(rows, [
                ("tenantA", "sameId", 10, 25),
                ("tenantB", "sameId", 8, 18)
            ])

    def test_cross_tenant_logo_reference_rejected(self):
        with database() as db:
            db.execute(ASSET_INSERT, logo("tenantA", "belongsToA"))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(SETTINGS_UPSERT,
                           ("tenantB", "belongsToA", 4, 2, 20))
            self.assertEqual(db.execute(
                "SELECT count(*) FROM quotation_logo_settings").fetchone()[0], 0)

    def test_invalid_private_logo_records_rejected(self):
        invalid = [
            ("nested_asset_id", dict(asset="bad/id")),
            ("wrong_tenant_key", dict(object_key="quotation-logos/other/logo1")),
            ("untrusted_prefix", dict(object_key="../quotation-logos/tenantA/logo1")),
            ("bad_tenant_format", dict(tenant="tenant/other")),
            ("unsafe_image_type", dict(mime_type="image/svg+xml")),
            ("width_too_small", dict(width=29, aspect_ratio=0.29)),
            ("height_too_large", dict(height=5001, aspect_ratio=200/5001)),
            ("fractional_width", dict(width=200.5, aspect_ratio=2.005)),
            ("mismatched_aspect", dict(aspect_ratio=3.0)),
            ("zero_aspect", dict(aspect_ratio=0)),
        ]
        for label, kwargs in invalid:
            with self.subTest(case=label), database() as db:
                tenant = kwargs.pop("tenant", "tenantA")
                asset = kwargs.pop("asset", "logo1")
                with self.assertRaises(sqlite3.IntegrityError):
                    db.execute(ASSET_INSERT, logo(tenant, asset, **kwargs))

    def test_duplicate_object_keys_and_overwide_layout_rejected(self):
        with database() as db:
            db.execute(ASSET_INSERT, logo())
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(ASSET_INSERT, logo(
                    "tenantB", "logo2",
                    object_key="quotation-logos/tenantA/logo1"))
            for x, width in ((90, 20), (60, 60)):
                with self.subTest(x=x, width=width):
                    with self.assertRaises(sqlite3.IntegrityError):
                        db.execute(SETTINGS_UPSERT,
                                   ("tenantA", "logo1", x, 2, width))
            db.execute(SETTINGS_UPSERT, ("tenantA", "logo1", 4, 2, 20))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(SETTINGS_UPSERT,
                           ("tenantA", "logo1", 99, 2, 20))
            self.assertEqual(db.execute(
                "SELECT x_percent,width_percent FROM quotation_logo_settings"
            ).fetchone(), (4, 20))

    def test_height_limit_is_explicitly_service_enforced_not_claimed_by_sql(self):
        # Height depends on the referenced asset's aspect ratio. The current
        # SQL does not claim to enforce it across a foreign key. The staging
        # service must retain its independent height/zone validations.
        with database() as db:
            db.execute(ASSET_INSERT, logo())
            db.execute(SETTINGS_UPSERT, ("tenantA", "logo1", 4, 99, 20))
            self.assertEqual(db.execute(
                "SELECT y_percent FROM quotation_logo_settings"
            ).fetchone()[0], 99)


if __name__ == "__main__":
    unittest.main()
