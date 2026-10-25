"""Concurrent SQLite writes must not create duplicate employee dispatch intents."""
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

SCHEMA = (Path(__file__).resolve().parents[1] / "db/drafts/employee-dispatch-outbox.sql").read_text()

class ConcurrentDispatchTests(unittest.TestCase):
    def test_same_tenant_key_only_one_writer_succeeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            dbpath = str(Path(tmp) / "outbox.sqlite")
            with sqlite3.connect(dbpath) as db:
                db.executescript(SCHEMA)
            barrier = threading.Barrier(2)
            results = []
            lock = threading.Lock()

            def writer(index):
                barrier.wait()
                try:
                    with sqlite3.connect(dbpath, timeout=5) as db:
                        db.execute("""INSERT INTO employee_dispatch_intents
                        (id,tenant_id,proposal_id,review_id,action,intent_type,idempotency_key)
                        VALUES (?,?,?,?,?,?,?)""",
                        (f"intent-{index}", "tenant-a", "proposal-a", "review-a",
                         "internal.task.create", "task", "same-key"))
                    outcome = "inserted"
                except sqlite3.IntegrityError:
                    outcome = "duplicate"
                with lock:
                    results.append(outcome)

            threads = [threading.Thread(target=writer, args=(i,)) for i in range(2)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=10)
                self.assertFalse(t.is_alive(), "concurrent writer deadlocked")
            self.assertCountEqual(results, ["inserted", "duplicate"])
            with sqlite3.connect(dbpath) as db:
                self.assertEqual(db.execute(
                    "SELECT COUNT(*) FROM employee_dispatch_intents").fetchone()[0], 1)

if __name__ == "__main__":
    unittest.main()
