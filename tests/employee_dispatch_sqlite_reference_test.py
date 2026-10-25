"""Integration tests for nonproduction SQLite outbox reference adapter."""
from pathlib import Path
import sqlite3
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "db/drafts"))
from employee_dispatch_sqlite_reference import insert_approved_dispatch

SCHEMA = (ROOT / "db/drafts/employee-dispatch-outbox.sql").read_text()

class SQLiteReferenceTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA)
        self.kw = dict(tenant_id="t1", proposal_id="p1", review_id="r1",
                       actor_id="a1", action="internal.task.create", idempotency_key="k1")

    def tearDown(self):
        self.db.close()

    def test_missing_explicit_transaction_denied(self):
        with self.assertRaises(RuntimeError):
            insert_approved_dispatch(self.db, **self.kw)

    def test_one_intent_and_audit_on_retry(self):
        self.db.execute("BEGIN IMMEDIATE")
        with self.db:
            first = insert_approved_dispatch(self.db, **self.kw)
            second = insert_approved_dispatch(self.db, **self.kw)
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["intent_id"], second["intent_id"])
        for table in ("employee_dispatch_intents", "employee_dispatch_audit"):
            self.assertEqual(self.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 1)

    def test_conflicting_reuse_fails(self):
        self.db.execute("BEGIN IMMEDIATE")
        with self.db:
            insert_approved_dispatch(self.db, **self.kw)
            with self.assertRaises(ValueError):
                insert_approved_dispatch(self.db, **{**self.kw, "proposal_id": "p2"})

    def test_audit_failure_rolls_back_intent(self):
        self.db.execute("""CREATE TRIGGER force_audit_failure BEFORE INSERT
                           ON employee_dispatch_audit BEGIN SELECT RAISE(ABORT, 'audit outage'); END""")
        self.db.execute("BEGIN IMMEDIATE")
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                insert_approved_dispatch(self.db, **self.kw)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_intents").fetchone()[0], 0)

if __name__ == "__main__":
    unittest.main()
