"""Offline SQLite qualification of the private AI reconciliation proposal.

No D1 bindings, Cloudflare credentials or production resources are accessed.
Run: python3 -m unittest discover -s tests -p 'ai_reconciliation_sqlite_test.py'
"""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1] / "docs/audits"
BUDGET = (ROOT / "ai-budget-reservation-private-staging.sql").read_text()
RECONCILE = (ROOT / "ai-budget-reconciliation-private-staging.sql").read_text()

class ReconciliationSqliteTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(BUDGET)
        self.db.executescript(RECONCILE)
        self.db.execute("INSERT INTO ai_monthly_budget(tenant_id,period,limit_micro_usd) VALUES ('tenant-a','2026-11',100)")
        self.db.execute("INSERT INTO ai_monthly_budget(tenant_id,period,limit_micro_usd) VALUES ('tenant-b','2026-11',100)")
        self.db.execute("INSERT INTO ai_budget_reservation(tenant_id,period,request_id,amount_micro_usd) VALUES ('tenant-a','2026-11','req-1',60)")

    def tearDown(self):
        self.db.close()

    def reconcile(self, tenant, request, state, cost):
        self.db.execute("INSERT INTO ai_budget_reconciliation(tenant_id,period,request_id,state,actual_micro_usd) VALUES (?,?,?,?,?)",
                        (tenant, "2026-11", request, state, cost))

    def reserved(self):
        return self.db.execute("SELECT reserved_micro_usd FROM ai_monthly_budget WHERE tenant_id='tenant-a' AND period='2026-11'").fetchone()[0]

    def test_completed_records_actual_without_releasing_reservation(self):
        self.reconcile("tenant-a", "req-1", "completed", 20)
        self.assertEqual(self.reserved(), 60)

    def test_uncertain_is_not_zero_and_does_not_release(self):
        self.reconcile("tenant-a", "req-1", "uncertain", None)
        self.assertEqual(self.reserved(), 60)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reconcile("tenant-a", "req-1", "completed", 0)

    def test_cross_tenant_or_missing_reservation_cannot_be_reconciled(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.reconcile("tenant-b", "req-1", "completed", 10)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reconcile("tenant-a", "missing", "completed", 10)

    def test_duplicate_and_invalid_cost_are_rejected(self):
        self.reconcile("tenant-a", "req-1", "completed", 30)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reconcile("tenant-a", "req-1", "completed", 30)
        self.db.execute("INSERT INTO ai_budget_reservation(tenant_id,period,request_id,amount_micro_usd) VALUES ('tenant-a','2026-11','req-2',1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.reconcile("tenant-a", "req-2", "completed", -1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reconcile("tenant-a", "req-2", "uncertain", 0)

if __name__ == "__main__":
    unittest.main()
