"""Actual SQLite race test against isolated conversation rehearsal DDL; no Cloudflare access."""
import sqlite3
import tempfile
import threading
from pathlib import Path

sql=(Path(__file__).resolve().parents[1]/"docs/rehearsals/conversation-storage-schema.sql").read_text()
with tempfile.TemporaryDirectory() as temp:
    database=str(Path(temp)/"conversation-test.db")
    connection=sqlite3.connect(database)
    connection.executescript(sql)
    connection.execute("INSERT INTO thebe_conversations_rehearsal(tenant_id,id,created_by_user_id) VALUES ('A','chat','owner')")
    connection.commit()
    connection.close()
    gate=threading.Barrier(2)
    results=[]
    lock=threading.Lock()
    def append(index):
        db=sqlite3.connect(database,timeout=5)
        gate.wait()
        try:
            result=db.execute(
                "INSERT INTO thebe_conversation_messages_rehearsal "
                "(tenant_id,conversation_id,id,role,source_kind,content_redacted,idempotency_key) "
                "VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id,conversation_id,idempotency_key) DO NOTHING",
                ("A","chat",f"msg{index}","user","voice_final","Show invoices","same-final-event"))
            db.commit()
            with lock: results.append(result.rowcount)
        finally:
            db.close()
    threads=[threading.Thread(target=append,args=(i,)) for i in range(2)]
    for thread in threads: thread.start()
    for thread in threads: thread.join(timeout=10)
    assert not any(thread.is_alive() for thread in threads), "SQLite concurrent writers must terminate"
    assert sorted(results)==[0,1], f"Expected exactly one insert: {results}"
    db=sqlite3.connect(database)
    assert db.execute("SELECT COUNT(*) FROM thebe_conversation_messages_rehearsal").fetchone()[0]==1
    rows=db.execute("SELECT tenant_id,conversation_id,content_redacted FROM thebe_conversation_messages_rehearsal").fetchall()
    assert rows==[("A","chat","Show invoices")]
    db.close()
print("Actual SQLite concurrent idempotent insert: PASS")
