"""Offline SQLite validation of the review-only quotation drafts candidate.

Uses a disposable in-memory DB. Never connects to Cloudflare or staging.
"""
import pathlib
import sqlite3
import unittest

SQL = (pathlib.Path(__file__).resolve().parents[1] /
       "docs/sql/quotation-drafts-staging-candidate.sql").read_text()

class DraftSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SQL)

    def tearDown(self):
        self.db.close()

    def insert(self, tenant="companyA", draft="draft01", revision=1,
               payload='{"quoteNumber":"QT-001"}'):
        self.db.execute(
            "INSERT INTO quotation_drafts(tenant_id,id,revision,draft_json) VALUES (?,?,?,?)",
            (tenant, draft, revision, payload))

    def test_tenant_compound_key_and_update_isolation(self):
        self.insert()
        self.insert(tenant="companyB")
        self.db.execute(
            "UPDATE quotation_drafts SET revision=revision+1 WHERE tenant_id=? AND id=? AND revision=?",
            ("companyA", "draft01", 1))
        rows = self.db.execute(
            "SELECT tenant_id,revision FROM quotation_drafts ORDER BY tenant_id").fetchall()
        self.assertEqual(rows, [("companyA", 2), ("companyB", 1)])
        self.assertEqual(self.db.execute(
            "UPDATE quotation_drafts SET revision=revision+1 WHERE tenant_id=? AND id=? AND revision=?",
            ("companyA", "draft01", 1)).rowcount, 0)

    def test_rejects_invalid_ids_and_revisions(self):
        for kwargs in [
            {"tenant":"../outside"},
            {"draft":"x/y"},
            {"tenant":""},
            {"revision":0},
            {"revision":2147483648},
            {"revision":1.5}
        ]:
            with self.subTest(kwargs=kwargs), self.assertRaises(sqlite3.IntegrityError):
                self.insert(**kwargs)

    def test_invalid_json_and_duplicate_are_rejected(self):
        for payload in ["not-json", "{", ""]:
            with self.subTest(payload=payload), self.assertRaises(sqlite3.IntegrityError):
                self.insert(payload=payload)
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert()

    def test_reapply_fails_instead_of_silently_accepting_preexisting_tables(self):
        with self.assertRaises(sqlite3.OperationalError):
            self.db.executescript(SQL)

if __name__ == "__main__":
    unittest.main()
