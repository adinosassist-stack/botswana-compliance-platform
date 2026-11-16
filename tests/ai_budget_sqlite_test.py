"""SQLite integration qualification for proposed private AI budget schema.

Run: python3 -m unittest discover -s tests -p 'ai_budget_sqlite_test.py'
No Cloudflare D1 or production resources are accessed.
"""
import pathlib
import sqlite3
import tempfile
import threading
import unittest

SCHEMA = (pathlib.Path(__file__).resolve().parents[1] /
          "docs/audits/ai-budget-reservation-private-staging.sql").read_text()

class BudgetSqliteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(pathlib.Path(self.tmp.name) / "budget.sqlite")
        with sqlite3.connect(self.path) as db:
            db.executescript(SCHEMA)
            db.execute("INSERT INTO ai_monthly_budget(tenant_id,period,limit_micro_usd) VALUES (?,?,?)",
                       ("tenant-a", "2026-11", 100))
            db.execute("INSERT INTO ai_monthly_budget(tenant_id,period,limit_micro_usd) VALUES (?,?,?)",
                       ("tenant-b", "2026-11", 50))

    def tearDown(self):
        self.tmp.cleanup()

    def reserve(self, tenant, request, amount):
        with sqlite3.connect(self.path, timeout=5) as db:
            db.execute("INSERT INTO ai_budget_reservation(tenant_id,period,request_id,amount_micro_usd) VALUES (?,?,?,?)",
                       (tenant, "2026-11", request, amount))

    def budget(self, tenant):
        with sqlite3.connect(self.path) as db:
            return db.execute("SELECT reserved_micro_usd FROM ai_monthly_budget WHERE tenant_id=? AND period=?",
                              (tenant, "2026-11")).fetchone()[0]

    def test_budget_limit_and_atomic_rollback(self):
        self.reserve("tenant-a", "first", 60)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve("tenant-a", "second", 50)
        self.assertEqual(self.budget("tenant-a"), 60)

    def test_duplicate_request_does_not_reserve_twice(self):
        self.reserve("tenant-a", "same", 20)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve("tenant-a", "same", 20)
        self.assertEqual(self.budget("tenant-a"), 20)

    def test_tenant_isolation_and_missing_budget(self):
        self.reserve("tenant-a", "shared-id", 40)
        self.reserve("tenant-b", "shared-id", 40)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve("tenant-c", "missing", 1)
        self.assertEqual(self.budget("tenant-a"), 40)
        self.assertEqual(self.budget("tenant-b"), 40)

    def test_concurrent_requests_never_overspend(self):
        barrier = threading.Barrier(8)
        outcomes = []
        lock = threading.Lock()
        def attempt(i):
            try:
                barrier.wait(timeout=5)
                self.reserve("tenant-a", f"parallel-{i}", 30)
                result = "accepted"
            except sqlite3.IntegrityError:
                result = "denied"
            with lock:
                outcomes.append(result)
        threads = [threading.Thread(target=attempt, args=(i,)) for i in range(8)]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=10)
        self.assertTrue(all(not t.is_alive() for t in threads))
        self.assertEqual(outcomes.count("accepted"), 3)
        self.assertEqual(outcomes.count("denied"), 5)
        self.assertEqual(self.budget("tenant-a"), 90)

if __name__ == "__main__":
    unittest.main()
