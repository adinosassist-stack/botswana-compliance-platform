import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sql=(root/'docs/rehearsals/conversation-storage-schema.sql').read_text()
db=sqlite3.connect(':memory:')
db.executescript(sql)
db.execute("INSERT INTO thebe_conversations_rehearsal(tenant_id,id,created_by_user_id) VALUES ('A','same','ownerA'),('B','same','ownerB')")
db.execute("INSERT INTO thebe_conversation_members_rehearsal(tenant_id,conversation_id,user_id,role) VALUES ('A','same','alice','owner'),('B','same','bob','viewer')")
db.execute("INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,role,source_kind,content_redacted,idempotency_key) VALUES ('A','same','1','user','voice_final','final speech','turn1')")
assert db.execute("SELECT count(*) FROM thebe_conversation_messages_rehearsal WHERE tenant_id='B' AND conversation_id='same'").fetchone()[0] == 0
def rejects(sql,args):
  try:
    db.execute(sql,args)
  except sqlite3.IntegrityError:
    return
  raise AssertionError('Unsafe write unexpectedly accepted')
insert="INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,role,source_kind,content_redacted,idempotency_key) VALUES (?,?,?,?,?,?,?)"
rejects(insert,('A','same','2','user','voice_final','duplicate','turn1'))
rejects(insert,('C','same','3','user','typed','foreign tenant','turn3'))
rejects(insert,('A','same','4','user','voice_partial','partial','turn4'))
rejects(insert,('A','same','5','assistant','typed','bad role','turn5'))
rejects(insert,('A','same','6','user','typed','','turn6'))
rejects("INSERT INTO thebe_conversation_members_rehearsal(tenant_id,conversation_id,user_id,role) VALUES (?,?,?,?)",('C','same','eve','owner'))
print("SQLite rehearsal: tenant FKs, idempotency, final-only turns and role checks PASS")
