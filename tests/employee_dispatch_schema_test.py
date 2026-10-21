"""Exercise draft employee dispatch schema using real SQLite constraints."""
from pathlib import Path
import sqlite3
import unittest

SCHEMA = Path(__file__).resolve().parents[1] / "db/drafts/employee-dispatch-outbox.sql"

class EmployeeDispatchSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA.read_text())

    def tearDown(self):
        self.db.close()

    def insert(self, tenant="tenant-a", key="key-1", action="internal.task.create", kind="task"):
        self.db.execute(
            """INSERT INTO employee_dispatch_intents
            (id,tenant_id,proposal_id,review_id,action,intent_type,idempotency_key)
            VALUES (?,?,?,?,?,?,?)""",
            (tenant + key, tenant, "proposal-a", "review-a", action, kind, key)
        )

    def test_unique_per_tenant(self):
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert()
        self.insert(tenant="tenant-b")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_intents").fetchone()[0], 2)

    def test_sensitive_actions_denied(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert(action="payroll.run")

    def test_invalid_state_denied(self):
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE employee_dispatch_intents SET state='unknown'")

    def test_nonnegative_attempts(self):
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE employee_dispatch_intents SET attempts=-1")

    def test_transaction_rolls_back_on_audit_failure(self):
        self.db.execute("BEGIN")
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO employee_dispatch_audit
                (id,tenant_id,intent_id,actor_id,proposal_id,review_id,event_type)
                VALUES (?,?,?,?,?,?,?)""",
                ("audit-1", "tenant-a", "missing-intent", "actor-1",
                 "proposal-a", "review-a", "employee.dispatch.admitted"))
        self.db.rollback()
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_intents").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_audit").fetchone()[0], 0)

    def test_intent_and_audit_commit_together(self):
        self.db.execute("BEGIN")
        self.insert()
        self.db.execute(
            """INSERT INTO employee_dispatch_audit
            (id,tenant_id,intent_id,actor_id,proposal_id,review_id,event_type)
            VALUES (?,?,?,?,?,?,?)""",
            ("audit-1", "tenant-a", "tenant-akey-1", "actor-1",
             "proposal-a", "review-a", "employee.dispatch.admitted"))
        self.db.commit()
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_intents").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_audit").fetchone()[0], 1)

if __name__ == "__main__":
    unittest.main()
