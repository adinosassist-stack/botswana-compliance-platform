"""C4 approved quotation staging D1 schema: offline SQLite validation only.

DO NOT call Cloudflare D1, apply migrations or use real customer records.
"""
import hashlib
import pathlib
import sqlite3
import unittest

SCHEMA = pathlib.Path("docs/sql/c4-quotation-approved-publications-STAGING-CANDIDATE.sql")
QUOTE = b"test immutable customer quotation BWP 130.00"
TERMS = b"complete test terms including cancellation and notice"
QHASH = hashlib.sha256(QUOTE).hexdigest()
THASH = hashlib.sha256(TERMS).hexdigest()
STAMP = 1795190400000

class C4ApprovedPublicationSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def insert_publication(self, *, tenant="tenantA", quote="quoteA",
                           customer="customerA", evidence="approvalA"):
        self.db.execute("""
          INSERT INTO c4_quotation_approved_publications (
            tenant_id,quotation_id,customer_id,quotation_reference,
            approval_evidence_id,approved_by_actor_user_id,
            acceptance_version,total_minor,currency,
            quotation_sha256,terms_sha256,
            immutable_quotation_bytes,immutable_terms_bytes,
            state,approved_at_ms
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (tenant, quote, customer, "Q_130", evidence, "ownerA",
              2,13000,"BWP",QHASH,THASH,QUOTE,TERMS,
              "approved-for-issuance",STAMP))

    def insert_assertion(self, *, tenant="tenantA", quote="quoteA",
                         customer="customerA", evidence="approvalA",
                         quote_hash=QHASH):
        self.db.execute("""
          INSERT INTO c4_quotation_approval_assertions
          (tenant_id,quotation_id,customer_id,approval_evidence_id,
           quotation_sha256,terms_sha256,approved_at_ms)
          VALUES(?,?,?,?,?,?,?)
        """, (tenant,quote,customer,evidence,quote_hash,THASH,STAMP))

    def approved_count(self):
        return self.db.execute(
          "SELECT COUNT(*) FROM c4_quotation_approved_publications"
        ).fetchone()[0]

    def test_ddl_schema_installs_and_exact_tables_are_present(self):
        names = {row[0] for row in self.db.execute(
          "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        self.assertTrue({
          "c4_quotation_approved_publications",
          "c4_quotation_approval_assertions",
          "c4_quotation_approval_revocations",
        }.issubset(names))
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0],"ok")
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])

    def test_assertion_requires_exact_parent_scope_and_both_digest_fields(self):
        self.insert_publication()
        for changes in (
            {"customer":"customerB"},{"evidence":"approvalB"},
            {"quote_hash":"a"*64},{"quote":"unknown"},
            {"tenant":"tenantB"}
        ):
            with self.subTest(**changes):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.insert_assertion(**changes)
        self.insert_assertion()
        self.assertEqual(self.db.execute(
          "SELECT COUNT(*) FROM c4_quotation_approval_assertions"
        ).fetchone()[0],1)

    def test_failure_to_insert_assertion_rolls_back_approved_quote(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.insert_publication()
                self.insert_assertion(customer="attacker")
        self.assertEqual(self.approved_count(),0)

    def test_publication_and_assertion_are_append_only(self):
        self.insert_publication()
        self.insert_assertion()
        for sql in (
          "UPDATE c4_quotation_approved_publications SET total_minor=0",
          "DELETE FROM c4_quotation_approved_publications",
          "UPDATE c4_quotation_approval_assertions SET terms_sha256='changed'",
          "DELETE FROM c4_quotation_approval_assertions"
        ):
            with self.subTest(sql=sql), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql)
        self.assertEqual(self.approved_count(),1)

    def test_revocation_requires_asserted_quote_and_is_permanent(self):
        self.insert_publication()
        revocation = (
          "INSERT INTO c4_quotation_approval_revocations "
          "(tenant_id,quotation_id,revoked_by_actor_user_id,"
          "revocation_evidence_id,revoked_at_ms) VALUES (?,?,?,?,?)"
        )
        record=("tenantA","quoteA","ownerA","revokeA",STAMP+100)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(revocation,record)  # No assertion yet
        self.insert_assertion()
        self.db.execute(revocation,record)
        for sql in (
          "UPDATE c4_quotation_approval_revocations SET revoked_at_ms=0",
          "DELETE FROM c4_quotation_approval_revocations"
        ):
            with self.subTest(sql=sql), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(revocation,record)
        self.assertEqual(self.db.execute(
          "SELECT COUNT(*) FROM c4_quotation_approval_revocations"
        ).fetchone()[0],1)

    def test_source_read_filters_customer_tenant_and_revocation(self):
        self.insert_publication()
        self.insert_assertion()
        select = """
          SELECT p.customer_id,p.immutable_quotation_bytes,p.immutable_terms_bytes
          FROM c4_quotation_approved_publications p
          JOIN c4_quotation_approval_assertions a
            ON a.tenant_id=p.tenant_id AND a.quotation_id=p.quotation_id
            AND a.customer_id=p.customer_id
            AND a.approval_evidence_id=p.approval_evidence_id
            AND a.quotation_sha256=p.quotation_sha256
            AND a.terms_sha256=p.terms_sha256
            AND a.approved_at_ms=p.approved_at_ms
          LEFT JOIN c4_quotation_approval_revocations r
            ON r.tenant_id=p.tenant_id AND r.quotation_id=p.quotation_id
          WHERE p.tenant_id=? AND p.customer_id=? AND p.quotation_id=?
            AND p.state='approved-for-issuance' AND p.currency='BWP'
            AND r.tenant_id IS NULL
          LIMIT 1
        """
        self.assertIsNone(self.db.execute(select,("tenantA","customerB","quoteA")).fetchone())
        self.assertIsNone(self.db.execute(select,("tenantB","customerA","quoteA")).fetchone())
        row=self.db.execute(select,("tenantA","customerA","quoteA")).fetchone()
        self.assertEqual(row,("customerA",QUOTE,TERMS))
        self.db.execute(
          "INSERT INTO c4_quotation_approval_revocations VALUES(?,?,?,?,?)",
          ("tenantA","quoteA","ownerA","revokeA",STAMP+1)
        )
        self.assertIsNone(self.db.execute(select,("tenantA","customerA","quoteA")).fetchone())

    def test_reject_malformed_hash_non_bwp_and_reused_ref(self):
        self.insert_publication()
        self.insert_assertion()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
             "UPDATE c4_quotation_approved_publications SET currency='USD'"
            )
        for sql in (
          "INSERT INTO c4_quotation_approved_publications "
          "(tenant_id,quotation_id,customer_id,quotation_reference,"
          "approval_evidence_id,approved_by_actor_user_id,"
          "acceptance_version,total_minor,currency,quotation_sha256,terms_sha256,"
          "immutable_quotation_bytes,immutable_terms_bytes,state,approved_at_ms)"
          " VALUES('tenantA','quoteB','customerA','Q_130','approvalB','ownerA',"
          "2,13000,'BWP',"
          f"'{QHASH}','{THASH}',x'01',x'01','approved-for-issuance',{STAMP})",
          "INSERT INTO c4_quotation_approved_publications "
          "(tenant_id,quotation_id,customer_id,quotation_reference,"
          "approval_evidence_id,approved_by_actor_user_id,"
          "acceptance_version,total_minor,currency,quotation_sha256,terms_sha256,"
          "immutable_quotation_bytes,immutable_terms_bytes,state,approved_at_ms)"
          " VALUES('tenantA','quoteB','customerA','Q_131','approvalB','ownerA',"
          "2,13000,'USD',"
          f"'{QHASH}','{THASH}',x'01',x'01','approved-for-issuance',{STAMP})"
        ):
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql)

if __name__ == "__main__":
    unittest.main()
