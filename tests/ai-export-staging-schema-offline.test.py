#!/usr/bin/env python3
"""Review-only, in-memory SQLite contract for the AI-export candidate schema.

Does not connect to Cloudflare, create a remote database, or authorize activation.
"""
from pathlib import Path
import sqlite3
import unittest

DDL = Path(__file__).resolve().parents[1] / "docs" / "ai-export-d1-schema-candidate.sql"

class CandidateSchemaQualification(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(DDL.read_text(encoding="utf8"))

    def tearDown(self):
        self.db.close()

    def add(self, **override):
        row = dict(
            id="job-1", tenant_id="tenant-a", actor_id="actor-a",
            conversation_id="conversation-a", message_id="message-a",
            content_hash="sha256-fixture", format="pdf",
            document_type="report", status="queued",
            object_key=None, created_at=1000, expires_at=2000,
        )
        row.update(override)
        columns = ",".join(row)
        placeholders = ",".join("?" for _ in row)
        self.db.execute(
            f"INSERT INTO ai_document_export_jobs ({columns}) VALUES ({placeholders})",
            tuple(row.values()),
        )

    def test_schema_and_exact_index_presence(self):
        names = {r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertTrue({"idx_ai_export_tenant_actor", "idx_ai_export_expiry"} <= names)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ai_document_export_jobs").fetchone()[0], 0)

    def test_all_supported_formats(self):
        for fmt in ("pdf", "docx", "pptx"):
            with self.subTest(fmt=fmt):
                self.add(id="job-"+fmt, format=fmt)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ai_document_export_jobs").fetchone()[0], 3)

    def test_unknown_format_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(format="html")

    def test_expiry_must_follow_creation(self):
        for expires in (1000, 999):
            with self.subTest(expires=expires):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.add(expires_at=expires)

    def test_completed_requires_object_key(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(status="completed", object_key=None)

    def test_queued_may_have_no_object_key(self):
        self.add()
        self.assertEqual(self.db.execute("SELECT status FROM ai_document_export_jobs").fetchone()[0], "queued")

    def test_tenant_actor_required(self):
        for name in ("tenant_id", "actor_id"):
            with self.subTest(name=name):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.add(**{name: None})

    def test_no_network_or_remote_data_dependency(self):
        self.assertEqual(str(self.db.execute("PRAGMA database_list").fetchone()[2]), "")
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0], "ok")

if __name__ == "__main__":
    unittest.main(verbosity=2)
