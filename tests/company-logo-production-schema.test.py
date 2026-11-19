"""Offline production-shaped SQLite rehearsal for #2672. No Cloudflare access."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "cloudflare/migrations/20261119_company_logo_private_storage.sql").read_text(encoding="utf-8")
TENANT_A = "11111111-2222-4333-8444-555555555555"
TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
LOGO_A = "logoA"
LOGO_B = "logoB"

class CompanyLogoSchemaContract(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("CREATE TABLE tenants(id TEXT NOT NULL PRIMARY KEY, name TEXT)")
        self.db.execute("INSERT INTO tenants(id,name) VALUES(?,?)", (TENANT_A, "Tenant A synthetic"))
        self.db.execute("INSERT INTO tenants(id,name) VALUES(?,?)", (TENANT_B, "Tenant B synthetic"))
        self.db.executescript(MIGRATION)
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def tearDown(self):
        self.db.close()

    def asset(self, tenant=TENANT_A, asset=LOGO_A, **updates):
        row = {
            "id":asset,"tenant_id":tenant,
            "object_key":f"quotation-logos/{tenant}/{asset}",
            "mime_type":"image/png","width":240,"height":120,"aspect_ratio":2.0
        }
        row.update(updates)
        cols=tuple(row)
        self.db.execute(
            "INSERT INTO quotation_logo_assets("+",".join(cols)+") VALUES("+",".join("?" for _ in cols)+")",
            tuple(row.values())
        )

    def settings(self, tenant=TENANT_A, asset=LOGO_A, **updates):
        row = {
            "tenant_id":tenant,"asset_id":asset,
            "x_percent":4.0,"y_percent":2.0,"width_percent":30.0
        }
        row.update(updates)
        cols=tuple(row)
        self.db.execute(
            "INSERT INTO quotation_logo_settings("+",".join(cols)+") VALUES("+",".join("?" for _ in cols)+")",
            tuple(row.values())
        )

    def test_exact_tables_foreign_keys_and_index(self):
        names={r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'quotation_logo_%'"
        )}
        self.assertEqual(names, {"quotation_logo_assets","quotation_logo_settings"})
        indexes={r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='quotation_logo_assets_created_idx'"
        )}
        self.assertEqual(indexes,{"quotation_logo_assets_created_idx"})
        asset_fk=list(self.db.execute("PRAGMA foreign_key_list(quotation_logo_assets)"))
        settings_fk=list(self.db.execute("PRAGMA foreign_key_list(quotation_logo_settings)"))
        self.assertTrue(any(r[2]=="tenants" for r in asset_fk))
        self.assertTrue(any(r[2]=="tenants" for r in settings_fk))
        self.assertEqual(
            {r[3] for r in settings_fk if r[2]=="quotation_logo_assets"},
            {"tenant_id","asset_id"}
        )
        self.assertEqual(list(self.db.execute("PRAGMA foreign_key_check")),[])

    def test_two_tenants_can_save_their_own_logos_and_settings(self):
        self.asset()
        self.asset(TENANT_B,LOGO_B)
        self.settings()
        self.settings(TENANT_B,LOGO_B)
        rows=list(self.db.execute(
            "SELECT s.tenant_id,s.asset_id,a.object_key FROM quotation_logo_settings s "+
            "JOIN quotation_logo_assets a ON a.id=s.asset_id AND a.tenant_id=s.tenant_id "+
            "ORDER BY s.tenant_id"
        ))
        self.assertEqual(len(rows),2)
        self.assertEqual({r[0] for r in rows},{TENANT_A,TENANT_B})
        self.assertEqual(list(self.db.execute("PRAGMA foreign_key_check")),[])

    def test_cross_tenant_asset_reference_is_denied(self):
        self.asset()
        self.asset(TENANT_B,LOGO_B)
        with self.assertRaises(sqlite3.IntegrityError):
            self.settings(TENANT_B,LOGO_A)
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM quotation_logo_settings").fetchone()[0],0
        )

    def test_unknown_tenant_and_forged_r2_object_key_are_denied(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.asset("cccccccc-dddd-4eee-8fff-111111111111","fake")
        with self.assertRaises(sqlite3.IntegrityError):
            self.asset(object_key="quotation-logos/"+TENANT_B+"/"+LOGO_A)
        with self.assertRaises(sqlite3.IntegrityError):
            self.asset(asset="../escape")

    def test_duplicate_assets_and_cross_company_keys_are_denied(self):
        self.asset()
        with self.assertRaises(sqlite3.IntegrityError):
            self.asset()
        with self.assertRaises(sqlite3.IntegrityError):
            self.asset(TENANT_B,LOGO_A,
                object_key="quotation-logos/"+TENANT_A+"/"+LOGO_A)

    def test_only_png_and_bounded_valid_dimensions_are_stored(self):
        for ext in ("image/jpeg","image/webp","image/svg+xml"):
            with self.subTest(mime=ext),self.assertRaises(sqlite3.IntegrityError):
                self.asset(mime_type=ext)
        for changes in (
            {"width":29},
            {"height":19},
            {"width":5001},
            {"height":5001},
            {"width":240,"height":120,"aspect_ratio":1.0}
        ):
            with self.subTest(changes=changes),self.assertRaises(sqlite3.IntegrityError):
                self.asset(**changes)
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM quotation_logo_assets").fetchone()[0],0
        )

    def test_logo_settings_geometry_and_missing_reference_are_denied(self):
        self.asset()
        for changes in (
            {"asset_id":"never_uploaded"},
            {"x_percent":80.0,"width_percent":30.0},
            {"width_percent":61.0},
            {"y_percent":101.0},
            {"width_percent":0.0}
        ):
            with self.subTest(changes=changes),self.assertRaises(sqlite3.IntegrityError):
                self.settings(**changes)
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM quotation_logo_settings").fetchone()[0],0
        )

    def test_account_deletion_cascades_metadata_not_r2_bytes(self):
        self.asset()
        self.settings()
        self.db.execute("DELETE FROM tenants WHERE id=?",(TENANT_A,))
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM quotation_logo_assets").fetchone()[0],0
        )
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM quotation_logo_settings").fetchone()[0],0
        )
        # R2 garbage-collection still needs its own separately qualified flow.

    def test_existing_legacy_schema_is_not_silently_accepted(self):
        with self.assertRaises(sqlite3.OperationalError):
            self.db.executescript(MIGRATION)  # No IF NOT EXISTS / silent reuse.
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM quotation_logo_assets").fetchone()[0],0
        )

if __name__ == "__main__":
    unittest.main()
