"""Isolated SQLite rehearsal qualification; never connects to Cloudflare or production."""
import sqlite3
from pathlib import Path
schema=(Path(__file__).resolve().parents[1]/"docs/rehearsals/conversation-storage-schema.sql").read_text()
db=sqlite3.connect(":memory:")
db.executescript(schema)
db.execute("PRAGMA foreign_keys=ON")
assert db.execute("PRAGMA foreign_keys").fetchone()[0] == 1
db.execute("INSERT INTO thebe_conversations_rehearsal(tenant_id,id,created_by_user_id) VALUES ('A','t','uA'),('B','t','uB')")
db.execute("INSERT INTO thebe_conversation_members_rehearsal(tenant_id,conversation_id,user_id,role) VALUES ('A','t','uA','owner'),('B','t','uB','viewer')")
insert="INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,role,source_kind,content_redacted,idempotency_key) VALUES (?,?,?,?,?,?,?)"
db.execute(insert,("A","t","m1","user","voice_final","Final speech","k1"))
db.execute("SAVEPOINT qualification_rollback")
db.execute(insert,("B","t","m1","user","typed","Tenant B test","k1"))
assert db.execute("SELECT count(*) FROM thebe_conversation_messages_rehearsal").fetchone()[0]==2
db.execute("ROLLBACK TO qualification_rollback")
db.execute("RELEASE qualification_rollback")
assert db.execute("SELECT count(*) FROM thebe_conversation_messages_rehearsal").fetchone()[0]==1
assert db.execute("SELECT count(*) FROM thebe_conversation_messages_rehearsal WHERE tenant_id='B'").fetchone()[0]==0
try:
 db.execute(insert,("C","t","x","user","typed","Foreign tenant","k2"))
 raise AssertionError("Cross-tenant orphan write accepted")
except sqlite3.IntegrityError:
 pass
try:
 db.execute(insert,("A","t","dup","user","typed","Duplicate","k1"))
 raise AssertionError("Duplicate idempotency key accepted")
except sqlite3.IntegrityError:
 pass
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
print("Staging rehearsal SQLite tenant isolation and savepoint rollback PASS")
