import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("baseline", ROOT / "scripts/prepare-pop-pre070-baseline.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def inventory(db):
    return list(db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"))


class BaselineTests(unittest.TestCase):
    def test_ordered_migrations_restore_entire_original_schema_and_seeds(self):
        baseline, report = module.prepare()
        with sqlite3.connect(":memory:") as original, sqlite3.connect(":memory:") as candidate:
            # Seed DEFAULT CURRENT_TIMESTAMP values must share the same clock;
            # sequential schema loads may otherwise cross a second boundary.
            for db in [original, candidate]:
                db.create_function("current_timestamp", 0, lambda: "2026-01-01 00:00:00")
            original.executescript((ROOT / "cloudflare/schema.sql").read_text())
            candidate.executescript(baseline)
            self.assertIsNone(candidate.execute("SELECT 1 FROM sqlite_master WHERE name='payment_pop_documents'").fetchone())
            candidate.executescript((ROOT / "cloudflare/migrations/070_payment_pop_documents.sql").read_text())
            self.assertEqual(inventory(original), inventory(candidate))
            for (table,) in original.execute("SELECT name FROM sqlite_master WHERE type='table'"):
                name = '"' + table.replace('"', '""') + '"'
                self.assertEqual(original.execute(f"SELECT * FROM {name}").fetchall(), candidate.execute(f"SELECT * FROM {name}").fetchall())
            original.executescript((ROOT / "cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text())
            candidate.executescript((ROOT / "cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text())
            self.assertEqual(inventory(original), inventory(candidate))
            self.assertEqual(candidate.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertTrue(report["ordered_rehearsal_passed"])
        for key in ["production_contacted", "production_compatibility_verified", "backup_verified", "staging_write_authorized", "production_write_authorized"]:
            self.assertIs(report[key], False)

    def test_every_pinned_source_rejects_drift_before_sql_execution(self):
        for changed in module.PINS:
            with self.subTest(path=changed), tempfile.TemporaryDirectory() as folder:
                root = pathlib.Path(folder)
                for path in module.PINS:
                    target = root / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes((ROOT / path).read_bytes() + (b"\n-- drift" if path == changed else b""))
                with self.assertRaisesRegex(ValueError, "source_mismatch"):
                    module.prepare(root)

    def test_fixture_survives_ordered_migration_and_071_replay_fails(self):
        baseline, _ = module.prepare()
        with sqlite3.connect(":memory:") as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript(baseline)
            db.execute("INSERT INTO tenants(id,name) VALUES('synthetic-baseline-tenant','Synthetic baseline')")
            db.commit()
            for path in ["070_payment_pop_documents.sql", "071_payment_pop_runtime_compat.sql"]:
                db.executescript((ROOT / "cloudflare/migrations" / path).read_text())
            self.assertEqual(db.execute("SELECT name FROM tenants WHERE id='synthetic-baseline-tenant'").fetchone(), ("Synthetic baseline",))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            with self.assertRaisesRegex(sqlite3.OperationalError, "duplicate column"):
                db.executescript((ROOT / "cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text())


    def test_pending_pop_metadata_survives_071_without_payment_activation(self):
        """Only pending document metadata changes; no payment settlement is inferred."""
        with sqlite3.connect(":memory:") as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript("""
                CREATE TABLE tenants(id TEXT PRIMARY KEY);
                CREATE TABLE payment_orders(id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending');
                CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY);
                INSERT INTO tenants(id) VALUES('synthetic-tenant');
                INSERT INTO payment_orders(id,status) VALUES('synthetic-order','pending');
            """)
            db.executescript((ROOT / "cloudflare/migrations/070_payment_pop_documents.sql").read_text())
            db.execute("""
                INSERT INTO payment_pop_documents(
                  id,tenant_id,payment_order_id,source,object_key,display_name,content_type,bytes
                ) VALUES(?,?,?,?,?,?,?,?)
            """, ('synthetic-pop','synthetic-tenant','synthetic-order','web',
                  'private/synthetic-pop','sample.pdf','application/pdf',1024))
            db.commit()
            db.executescript((ROOT / "cloudflare/migrations/071_payment_pop_runtime_compat.sql").read_text())
            self.assertEqual(db.execute(
                "SELECT scan_status,content_sha256 FROM payment_pop_documents WHERE id='synthetic-pop'"
            ).fetchone(), ('pending', None))
            self.assertEqual(db.execute(
                "SELECT status FROM payment_orders WHERE id='synthetic-order'"
            ).fetchone(), ('pending',))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM payment_pop_upload_requests").fetchone()[0],0)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_070_is_pending_metadata_only_and_replay_safe(self):
        """Replaying the CREATE IF NOT EXISTS migration cannot settle an order."""
        with sqlite3.connect(":memory:") as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript("""
                CREATE TABLE tenants(id TEXT PRIMARY KEY);
                CREATE TABLE payment_orders(id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending');
                CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY);
                INSERT INTO tenants(id) VALUES('synthetic-tenant');
                INSERT INTO payment_orders(id,status) VALUES('synthetic-order','pending');
            """)
            sql = (ROOT / "cloudflare/migrations/070_payment_pop_documents.sql").read_text()
            db.executescript(sql)
            db.executescript(sql)
            self.assertEqual(db.execute(
                "SELECT status FROM payment_orders WHERE id='synthetic-order'"
            ).fetchone(), ('pending',))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])


if __name__ == "__main__":
    unittest.main()
