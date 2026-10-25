"""Real SQLite lease/retry tests for the nonproduction reference adapter."""
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "db/drafts"))
from employee_dispatch_sqlite_reference import (
    insert_approved_dispatch, claim_dispatch, complete_dispatch, retry_dispatch,
)

SCHEMA = (ROOT / "db/drafts/employee-dispatch-outbox.sql").read_text()


class DispatchLeaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA)
        self.db.execute("BEGIN IMMEDIATE")
        with self.db:
            self.intent_id = insert_approved_dispatch(
                self.db, tenant_id="t1", proposal_id="p1", review_id="r1",
                actor_id="author", action="internal.task.create",
                idempotency_key="k1")["intent_id"]

    def tearDown(self):
        self.db.close()

    def transact(self, fn, **kwargs):
        self.db.execute("BEGIN IMMEDIATE")
        with self.db:
            return fn(self.db, **kwargs)

    def claim(self, **kwargs):
        return self.transact(claim_dispatch, tenant_id="t1", actor_id="worker", **kwargs)

    def finish(self, lease, fn=complete_dispatch, **overrides):
        args = dict(tenant_id="t1", intent_id=self.intent_id, actor_id="worker",
                    lease_token=lease["lease_token"])
        args.update(overrides)
        return self.transact(fn, **args)

    def row(self):
        cursor = self.db.execute("SELECT * FROM employee_dispatch_intents WHERE id=?", (self.intent_id,))
        return dict(zip([c[0] for c in cursor.description], cursor.fetchone()))

    def expire(self):
        with self.db:
            self.db.execute("UPDATE employee_dispatch_intents SET lease_expires_at=unixepoch('now')-1 WHERE id=?", (self.intent_id,))

    def test_lease_and_completion_are_durable_and_audited(self):
        lease = self.claim()
        self.assertEqual(lease["state"], "leased")
        self.assertEqual(lease["attempts"], 1)
        self.assertTrue(lease["lease_token"])
        self.assertIsInstance(lease["lease_expires_at"], int)
        self.assertIsNone(self.claim())
        self.assertTrue(self.finish(lease))
        self.assertFalse(self.finish(lease))
        self.assertIsNone(self.claim())
        self.assertEqual(self.row()["state"], "completed")
        self.assertIsNone(self.row()["lease_token"])
        events = [r[0] for r in self.db.execute("SELECT event_type FROM employee_dispatch_audit ORDER BY rowid")]
        self.assertEqual(events, ["employee.dispatch.admitted", "employee.dispatch.leased", "employee.dispatch.completed"])

    def test_expired_worker_cannot_complete_or_release_a_new_lease(self):
        first = self.claim()
        self.expire()
        self.assertFalse(self.finish(first))
        self.assertFalse(self.finish(first, retry_dispatch))
        second = self.claim()
        self.assertNotEqual(first["lease_token"], second["lease_token"])
        self.assertEqual(second["attempts"], 2)
        self.assertFalse(self.finish(first))
        self.assertFalse(self.finish(first, retry_dispatch))
        self.assertTrue(self.finish(second))

    def test_tenant_and_token_must_match(self):
        self.assertIsNone(self.transact(claim_dispatch, tenant_id="t2", actor_id="worker"))
        lease = self.claim()
        for fn in [complete_dispatch, retry_dispatch]:
            self.assertFalse(self.finish(lease, fn, tenant_id="t2"))
            self.assertFalse(self.finish(lease, fn, lease_token="wrong-token"))
        self.assertEqual(self.row()["state"], "leased")
        self.assertTrue(self.finish(lease))

    def test_retry_limit_survives_worker_restarts(self):
        with self.db:
            self.db.execute("UPDATE employee_dispatch_intents SET max_attempts=2")
        first = self.claim()
        self.assertTrue(self.finish(first, retry_dispatch))
        self.assertEqual(self.row()["state"], "pending")
        second = self.claim()
        self.assertEqual(second["attempts"], 2)
        self.assertTrue(self.finish(second, retry_dispatch))
        self.assertEqual(self.row()["state"], "dead_letter")
        self.assertIsNone(self.claim())
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_audit WHERE event_type='employee.dispatch.dead_letter'").fetchone()[0], 1)

    def test_expired_final_attempt_is_dead_lettered_once(self):
        with self.db:
            self.db.execute("UPDATE employee_dispatch_intents SET max_attempts=1")
        lease = self.claim()
        self.expire()
        self.assertIsNone(self.claim())
        self.assertIsNone(self.claim())
        self.assertFalse(self.finish(lease))
        self.assertEqual(self.row()["state"], "dead_letter")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_audit WHERE event_type='employee.dispatch.dead_letter'").fetchone()[0], 1)

    def test_claim_audit_failure_rolls_back_attempt_and_lease(self):
        self.db.execute("CREATE TRIGGER fail_lease_audit BEFORE INSERT ON employee_dispatch_audit WHEN NEW.event_type='employee.dispatch.leased' BEGIN SELECT RAISE(ABORT,'audit outage'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim()
        row = self.row()
        self.assertEqual((row["state"], row["attempts"], row["lease_token"]), ("pending", 0, None))

    def test_completion_audit_failure_rolls_back_side_effect_and_transition(self):
        lease = self.claim()
        self.db.execute("CREATE TABLE synthetic_internal_effect(id TEXT PRIMARY KEY)")
        self.db.execute("CREATE TRIGGER fail_complete_audit BEFORE INSERT ON employee_dispatch_audit WHEN NEW.event_type='employee.dispatch.completed' BEGIN SELECT RAISE(ABORT,'audit outage'); END")
        self.db.execute("BEGIN IMMEDIATE")
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("INSERT INTO synthetic_internal_effect VALUES ('task-1')")
                complete_dispatch(self.db, tenant_id="t1", intent_id=self.intent_id,
                                  actor_id="worker", lease_token=lease["lease_token"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM synthetic_internal_effect").fetchone()[0], 0)
        self.assertEqual(self.row()["state"], "leased")
        self.assertEqual(self.row()["lease_token"], lease["lease_token"])

    def test_missing_transaction_and_malformed_inputs_are_rejected(self):
        with self.assertRaises(RuntimeError):
            claim_dispatch(self.db, tenant_id="t1", actor_id="worker")
        for value in [0, -1, 3601, True, "60", None]:
            with self.assertRaises(ValueError):
                self.claim(lease_seconds=value)
        for tenant in ["", "bad tenant", None]:
            with self.assertRaises(ValueError):
                self.transact(claim_dispatch, tenant_id=tenant, actor_id="worker")
        self.assertEqual(self.row()["attempts"], 0)

    def test_lease_survives_reopening_and_can_be_completed(self):
        lease = self.claim()
        with tempfile.TemporaryDirectory() as tmp:
            filename = str(Path(tmp) / "restart.sqlite")
            with sqlite3.connect(filename) as saved:
                self.db.backup(saved)
            with sqlite3.connect(filename) as reopened:
                reopened.execute("PRAGMA foreign_keys=ON")
                row = reopened.execute("SELECT lease_token,attempts FROM employee_dispatch_intents").fetchone()
                self.assertEqual(row, (lease["lease_token"], 1))
                reopened.execute("BEGIN IMMEDIATE")
                self.assertTrue(complete_dispatch(
                    reopened, tenant_id="t1", intent_id=self.intent_id,
                    actor_id="worker", lease_token=lease["lease_token"]))
            with sqlite3.connect(filename) as verified:
                self.assertEqual(verified.execute("SELECT state FROM employee_dispatch_intents").fetchone()[0], "completed")

    def test_retry_audit_failure_keeps_current_lease(self):
        lease = self.claim()
        self.db.execute("CREATE TRIGGER fail_retry_audit BEFORE INSERT ON employee_dispatch_audit WHEN NEW.event_type='employee.dispatch.retry' BEGIN SELECT RAISE(ABORT,'audit outage'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.finish(lease, retry_dispatch)
        self.assertEqual(self.row()["state"], "leased")
        self.assertEqual(self.row()["lease_token"], lease["lease_token"])

    def test_dead_letter_audit_failure_rolls_back_recovery(self):
        with self.db:
            self.db.execute("UPDATE employee_dispatch_intents SET max_attempts=1")
        lease = self.claim()
        self.expire()
        self.db.execute("CREATE TRIGGER fail_dead_letter_audit BEFORE INSERT ON employee_dispatch_audit WHEN NEW.event_type='employee.dispatch.dead_letter' BEGIN SELECT RAISE(ABORT,'audit outage'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim()
        self.assertEqual(self.row()["state"], "leased")
        self.assertEqual(self.row()["lease_token"], lease["lease_token"])

    def test_schema_requires_consistent_lease_state_and_retry_bound(self):
        for statement in [
            "UPDATE employee_dispatch_intents SET state='leased'",
            "UPDATE employee_dispatch_intents SET lease_token='token'",
            "UPDATE employee_dispatch_intents SET max_attempts=0",
            "UPDATE employee_dispatch_intents SET attempts=4",
        ]:
            with self.assertRaises(sqlite3.IntegrityError):
                with self.db:
                    self.db.execute(statement)

    def test_exhausted_recovery_is_bounded_and_still_claims_eligible_work(self):
        with self.db:
            self.db.executemany("""INSERT INTO employee_dispatch_intents
                (id,tenant_id,proposal_id,review_id,action,intent_type,idempotency_key,max_attempts,attempts)
                VALUES (?,'t1','p1','r1','internal.task.create','task',?,1,1)""",
                [(f"exhausted-{i}", f"exhausted-key-{i}") for i in range(65)])
        lease = self.claim()
        self.assertEqual(lease["id"], self.intent_id)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_intents WHERE state='dead_letter'").fetchone()[0], 64)
        self.assertIsNone(self.claim())
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_dispatch_intents WHERE state='dead_letter'").fetchone()[0], 65)

    def test_two_workers_cannot_hold_the_same_intent(self):
        with tempfile.TemporaryDirectory() as tmp:
            filename = str(Path(tmp) / "dispatch.sqlite")
            with sqlite3.connect(filename) as seed:
                self.db.backup(seed)
            barrier = threading.Barrier(2)
            results, errors = [], []
            lock = threading.Lock()

            def worker(index):
                try:
                    with sqlite3.connect(filename, timeout=5) as db:
                        db.execute("PRAGMA foreign_keys=ON")
                        barrier.wait(timeout=5)
                        db.execute("BEGIN IMMEDIATE")
                        result = claim_dispatch(db, tenant_id="t1", actor_id=f"worker-{index}")
                    with lock:
                        results.append(result)
                except Exception as error:
                    with lock:
                        errors.append(error)

            threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=10)
                self.assertFalse(thread.is_alive(), "worker claim deadlocked")
            self.assertEqual(errors, [])
            self.assertEqual(sum(result is not None for result in results), 1)
            with sqlite3.connect(filename) as reopened:
                self.assertEqual(reopened.execute("SELECT attempts FROM employee_dispatch_intents").fetchone()[0], 1)
                self.assertEqual(reopened.execute("SELECT COUNT(*) FROM employee_dispatch_audit WHERE event_type='employee.dispatch.leased'").fetchone()[0], 1)

    def test_concurrent_completion_commits_one_synthetic_internal_effect(self):
        lease = self.claim()
        with tempfile.TemporaryDirectory() as tmp:
            filename = str(Path(tmp) / "completion.sqlite")
            with sqlite3.connect(filename) as seed:
                self.db.backup(seed)
                seed.execute("CREATE TABLE synthetic_internal_effect(id TEXT PRIMARY KEY)")
            barrier = threading.Barrier(2)
            results, errors = [], []
            lock = threading.Lock()

            def worker(index):
                try:
                    with sqlite3.connect(filename, timeout=5) as db:
                        db.execute("PRAGMA foreign_keys=ON")
                        barrier.wait(timeout=5)
                        db.execute("BEGIN IMMEDIATE")
                        completed = complete_dispatch(
                            db, tenant_id="t1", intent_id=self.intent_id,
                            actor_id=f"worker-{index}", lease_token=lease["lease_token"])
                        if completed:
                            db.execute("INSERT INTO synthetic_internal_effect VALUES (?)", (self.intent_id,))
                    with lock:
                        results.append(completed)
                except Exception as error:
                    with lock:
                        errors.append(error)

            threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=10)
                self.assertFalse(thread.is_alive(), "completion worker deadlocked")
            self.assertEqual(errors, [])
            self.assertCountEqual(results, [True, False])
            with sqlite3.connect(filename) as verified:
                self.assertEqual(verified.execute("SELECT COUNT(*) FROM synthetic_internal_effect").fetchone()[0], 1)
                self.assertEqual(verified.execute("SELECT COUNT(*) FROM employee_dispatch_audit WHERE event_type='employee.dispatch.completed'").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
