"""Reference SQLite adapter for draft dispatch outbox only.

Not wired to production. Demonstrates atomic intent/audit and lease transitions;
review authority, actor permissions, and proposal revision must be checked by
the actual server transaction before calling this helper.
"""
import sqlite3
import re
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


def _lease_request(db, tenant_id, actor_id, *identifiers):
    if not db.in_transaction:
        raise RuntimeError("dispatch transaction required")
    if not all(isinstance(value, str) and re.fullmatch(r"[a-zA-Z0-9_:.\-]{1,200}", value)
               for value in (tenant_id, actor_id, *identifiers)):
        raise ValueError("invalid lease identifiers")


def _changed_rows(db, statement, parameters):
    cursor = db.execute(statement, parameters)
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _lease_audit(db, row, actor_id, event):
    db.execute(
        """INSERT INTO employee_dispatch_audit
        (id,tenant_id,intent_id,actor_id,proposal_id,review_id,event_type)
        VALUES (?,?,?,?,?,?,?)""",
        (str(uuid4()), row["tenant_id"], row["id"], actor_id,
         row["proposal_id"], row["review_id"], event))


def claim_dispatch(db: sqlite3.Connection, *, tenant_id: str, actor_id: str,
                   lease_seconds: int = 60):
    """Claim within the caller's transaction; revalidate authority before effects.

    SQL uses the database UTC clock. Expired tokens never regain authority.
    The first write obtains SQLite's writer lock, including with BEGIN DEFERRED.
    Any failure must roll back the entire caller transaction.
    """
    _lease_request(db, tenant_id, actor_id)
    if type(lease_seconds) is not int or not 1 <= lease_seconds <= 3600:
        raise ValueError("invalid lease duration")
    exhausted = _changed_rows(db, """
        UPDATE employee_dispatch_intents
        SET state='dead_letter',lease_token=NULL,lease_expires_at=NULL,
            updated_at=CURRENT_TIMESTAMP
        WHERE id IN (
            SELECT id FROM employee_dispatch_intents
            WHERE tenant_id=? AND attempts>=max_attempts
              AND (state='pending' OR (state='leased' AND lease_expires_at<=unixepoch('now')))
            ORDER BY created_at,id LIMIT 64
        )
        RETURNING *""", (tenant_id,))
    for row in exhausted:
        _lease_audit(db, row, actor_id, "employee.dispatch.dead_letter")
    claimed = _changed_rows(db, """
        UPDATE employee_dispatch_intents
        SET state='leased',attempts=attempts+1,lease_token=?,
            lease_expires_at=unixepoch('now')+?,updated_at=CURRENT_TIMESTAMP
        WHERE id=(
            SELECT id FROM employee_dispatch_intents
            WHERE tenant_id=? AND attempts<max_attempts
              AND (state='pending' OR (state='leased' AND lease_expires_at<=unixepoch('now')))
            ORDER BY created_at,id LIMIT 1
        ) AND tenant_id=?
        RETURNING *""", (str(uuid4()), lease_seconds, tenant_id, tenant_id))
    if not claimed:
        return None
    row = claimed[0]
    _lease_audit(db, row, actor_id, "employee.dispatch.leased")
    return row


def _release_dispatch(db, tenant_id, intent_id, actor_id, lease_token, *, completed):
    _lease_request(db, tenant_id, actor_id, intent_id, lease_token)
    # Business effects must share this transaction and roll back if this returns
    # False. No task/report executor is implemented by this reference adapter.
    next_state = "'completed'" if completed else "CASE WHEN attempts>=max_attempts THEN 'dead_letter' ELSE 'pending' END"
    rows = _changed_rows(db, f"""
        UPDATE employee_dispatch_intents
        SET state={next_state},lease_token=NULL,lease_expires_at=NULL,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND tenant_id=? AND state='leased' AND lease_token=?
          AND lease_expires_at>unixepoch('now')
        RETURNING *""", (intent_id, tenant_id, lease_token))
    if not rows:
        return False
    row = rows[0]
    event = ("employee.dispatch.completed" if completed else
             "employee.dispatch.dead_letter" if row["state"] == "dead_letter" else
             "employee.dispatch.retry")
    _lease_audit(db, row, actor_id, event)
    return True


def complete_dispatch(db: sqlite3.Connection, *, tenant_id: str, intent_id: str,
                      actor_id: str, lease_token: str):
    """Fence completion with a current token, in the business-effect transaction."""
    return _release_dispatch(db, tenant_id, intent_id, actor_id, lease_token, completed=True)


def retry_dispatch(db: sqlite3.Connection, *, tenant_id: str, intent_id: str,
                   actor_id: str, lease_token: str):
    """Release a current lease for retry, or dead-letter its final attempt."""
    return _release_dispatch(db, tenant_id, intent_id, actor_id, lease_token, completed=False)
