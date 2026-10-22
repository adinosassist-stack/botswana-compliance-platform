"""Reference SQLite adapter for draft dispatch outbox only.

Not wired to production. Only demonstrates atomic intent + audit insertion;
review authority, actor permissions, and proposal revision must be checked by
the actual server transaction before calling this helper.
"""
import sqlite3
from uuid import uuid4

ALLOWED = {"internal.task.create": "task", "internal.report.draft": "report"}

def insert_approved_dispatch(db: sqlite3.Connection, *, tenant_id: str,
                             proposal_id: str, review_id: str, actor_id: str,
                             action: str, idempotency_key: str):
    """Call inside a trusted BEGIN IMMEDIATE transaction; never commit here."""
    if not db.in_transaction:
        raise RuntimeError("dispatch transaction required")
    if not all(isinstance(v, str) and 0 < len(v) <= 200 for v in
               (tenant_id, proposal_id, review_id, actor_id, idempotency_key)):
        raise ValueError("invalid dispatch identifiers")
    if action not in ALLOWED:
        raise ValueError("unsupported dispatch action")
    existing = db.execute(
        """SELECT id, proposal_id, review_id, action FROM employee_dispatch_intents
           WHERE tenant_id=? AND idempotency_key=?""",
        (tenant_id, idempotency_key)).fetchone()
    if existing:
        if tuple(existing[1:]) != (proposal_id, review_id, action):
            raise ValueError("idempotency conflict")
        return {"created": False, "intent_id": existing[0]}
    intent_id = str(uuid4())
    db.execute(
        """INSERT INTO employee_dispatch_intents
        (id, tenant_id, proposal_id, review_id, action, intent_type, idempotency_key)
        VALUES (?,?,?,?,?,?,?)""",
        (intent_id, tenant_id, proposal_id, review_id, action,
         ALLOWED[action], idempotency_key))
    db.execute(
        """INSERT INTO employee_dispatch_audit
        (id, tenant_id, intent_id, actor_id, proposal_id, review_id, event_type)
        VALUES (?,?,?,?,?,?,?)""",
        (str(uuid4()), tenant_id, intent_id, actor_id, proposal_id,
         review_id, "employee.dispatch.admitted"))
    return {"created": True, "intent_id": intent_id}
