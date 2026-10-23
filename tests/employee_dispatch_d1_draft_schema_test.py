"""Offline SQLite checks for nonexecuting D1 draft schema. No migrations applied."""
import pathlib
import sqlite3
import unittest

SQL = pathlib.Path("db/drafts/employee-dispatch-d1-intent.sql").read_text()
TENANT = "tenant-1"
KEY = '["employee-proposal-v2","tenant-1","author","workflow","' + "a"*64 + '","employee","onboarding_checklist","2026-11-01","' + "b"*64 + '"]'

def setup():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
        CREATE TABLE employee_ai_proposal_reviews(
          tenant_id TEXT,proposal_key TEXT,PRIMARY KEY(tenant_id,proposal_key));
        CREATE TABLE employee_ai_proposal_provenance(
          tenant_id TEXT,proposal_key TEXT,PRIMARY KEY(tenant_id,proposal_key),
          FOREIGN KEY(tenant_id,proposal_key) REFERENCES employee_ai_proposal_reviews(tenant_id,proposal_key));
    """)
    db.execute("INSERT INTO employee_ai_proposal_reviews VALUES(?,?)",(TENANT,KEY))
    db.execute("INSERT INTO employee_ai_proposal_provenance VALUES(?,?)",(TENANT,KEY))
    db.executescript(SQL)
    return db

def intent(db,dispatch="dispatch-id-00000001",idem="idempotency-00000001"):
    db.execute("""INSERT INTO employee_dispatch_d1_intents
       (tenant_id,dispatch_id,proposal_key,proposal_revision,workflow_revision,idempotency_key,action)
       VALUES(?,?,?,?,?,?,?)""",(TENANT,dispatch,KEY,"b"*64,"a"*64,idem,"internal.task.create"))

def audit(db,dispatch="dispatch-id-00000001"):
    db.execute("""INSERT INTO employee_dispatch_d1_audit
      (tenant_id,dispatch_id,event_type,actor_id) VALUES(?,?,?,?)""",
      (TENANT,dispatch,"employee.dispatch.admitted","manager"))

class DraftSchemaTests(unittest.TestCase):
    def test_atomic_pair(self):
        db=setup()
        with db:
            intent(db)
            audit(db)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM employee_dispatch_d1_intents").fetchone()[0],1)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM employee_dispatch_d1_audit").fetchone()[0],1)

    def test_audit_failure_rolls_back_intent(self):
        db=setup()
        with self.assertRaises(sqlite3.IntegrityError):
            with db:
                intent(db)
                audit(db,"wrong-dispatch-id")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM employee_dispatch_d1_intents").fetchone()[0],0)

    def test_duplicate_idempotency_rejected(self):
        db=setup()
        intent(db)
        with self.assertRaises(sqlite3.IntegrityError):
            intent(db,"dispatch-id-00000002")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM employee_dispatch_d1_intents").fetchone()[0],1)

    def test_audit_immutable(self):
        db=setup()
        with db:
            intent(db)
            audit(db)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM employee_dispatch_d1_audit")

if __name__=="__main__":
    unittest.main()
