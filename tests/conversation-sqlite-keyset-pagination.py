"""Run keyset pagination queries against real isolated SQLite rehearsal schema."""
import sqlite3
from pathlib import Path

schema=(Path(__file__).resolve().parents[1]/"docs/rehearsals/conversation-storage-schema.sql").read_text()
db=sqlite3.connect(":memory:")
db.executescript(schema)
for tenant in ("A","B"):
    db.execute("INSERT INTO thebe_conversations_rehearsal(tenant_id,id,created_by_user_id) VALUES (?,?,?)",(tenant,"chat","owner"))
for tenant,items in (("A",[("m1","2026-10-30 10:00:00"),("m2","2026-10-30 10:00:00"),("m3","2026-10-30 10:01:00"),("m4","2026-10-30 10:02:00")]),("B",[("other","2026-10-30 10:04:00")])):
    for mid,stamp in items:
        db.execute("INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,role,source_kind,content_redacted,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?)",(tenant,"chat",mid,"user","typed","message","key_"+mid,stamp))

def page(tenant,limit,boundary=None):
    if boundary:
        rows=db.execute("SELECT id,created_at FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? AND (created_at < ? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?",(tenant,"chat",boundary[1],boundary[1],boundary[0],limit+1)).fetchall()
    else:
        rows=db.execute("SELECT id,created_at FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? ORDER BY created_at DESC,id DESC LIMIT ?",(tenant,"chat",limit+1)).fetchall()
    return rows[:limit],len(rows)>limit

first,has_more=page("A",2)
assert [r[0] for r in first]==["m4","m3"] and has_more
second,more=page("A",2,first[-1])
assert [r[0] for r in second]==["m2","m1"] and not more
assert not set(first).intersection(second)
assert page("B",2)[0]==[("other","2026-10-30 10:04:00")]
# A new, more recent message cannot mutate the already issued earlier-page boundary.
db.execute("INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,role,source_kind,content_redacted,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?)",("A","chat","new","user","typed","new","key_new","2026-10-30 10:05:00"))
again,_=page("A",2,first[-1])
assert again==second
print("Real SQLite keyset ordering, ties, tenant isolation and stable paging PASS")
