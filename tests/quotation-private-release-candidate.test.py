#!/usr/bin/env python3
"""Offline synthetic test: no customer PDFs, Cloudflare calls or real account numbers."""

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

import fitz

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_quotation_private_release_candidate.py"
spec = importlib.util.spec_from_file_location("quotation_private_checker", SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class QuotationPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "synthetic.pdf"

    def make_pdf(self, footer="MAHALAPYE - GABORONE - PALAPYE\nMAUN - FRANCISTOWN",
                 review=False, placeholder=False, pages=2):
        document = fitz.open()
        p1 = document.new_page(width=612.24, height=858.96)
        p1.insert_text((35, 190), "Lovely Tombstones\nBank: First National Bank\nBranch: Riverwalk Plaza\n"
                                    "lovelystones26@gmail.com", fontsize=11)
        if review:
            p1.insert_text((35, 255), "LEGAL REVIEW DRAFT - NOT FOR CUSTOMER ISSUE", fontsize=9)
        if placeholder:
            p1.insert_text((35, 290), "Target: [AGREED START EVENT]", fontsize=10)
        p2 = document.new_page(width=841.92, height=1190.64)
        p2.insert_text((32, 230), "General terms and conditions\n" +
                       "\n".join("This is only synthetic contract test data, with no private details."
                                 for _ in range(12)), fontsize=10)
        p2.insert_text((32, 1020), "ORDER NOW", fontsize=10)
        p2.insert_text((32, 1080), footer, fontsize=10)
        if pages == 3:
            document.new_page()
        document.save(self.path)
        document.close()
        return hashlib.sha256(self.path.read_bytes()).hexdigest()

    def test_approved_office_list_and_hash_pass_static_only(self):
        sha = self.make_pdf()
        result = checker.audit(self.path, sha)
        self.assertTrue(result["static_preflight_passed"], result)
        self.assertFalse(result["template_upload_authorized"])
        self.assertFalse(result["owner_full_pdf_accepted"])
        self.assertTrue(result["legal_review_required"])

    def test_sha_pin_detects_mutation(self):
        self.make_pdf()
        result = checker.audit(self.path, "0" * 64)
        self.assertFalse(result["static_preflight_passed"])
        self.assertFalse(result["static_checks"]["exact_pdf_sha256"])

    def test_legacy_footer_is_rejected(self):
        sha = self.make_pdf("GABORONE - PALAPYE - SEROWE\nFRANCISTOWN - PHIKWE - MAUN")
        result = checker.audit(self.path, sha)
        self.assertFalse(result["static_preflight_passed"])
        self.assertFalse(result["static_checks"]["old_office_names_absent"])

    def test_review_draft_and_unresolved_terms_are_denied(self):
        sha = self.make_pdf(review=True, placeholder=True)
        result = checker.audit(self.path, sha)
        self.assertFalse(result["static_checks"]["no_review_draft_labels"])
        self.assertFalse(result["static_checks"]["no_unresolved_bracket_fields"])
        self.assertFalse(result["template_upload_authorized"])

    def test_unknown_embedded_file_is_rejected(self):
        self.make_pdf()
        doc = fitz.open(self.path)
        doc.embfile_add("unknown.data", b"synthetic", filename="unknown.data")
        doc.saveIncr()
        doc.close()
        sha = hashlib.sha256(self.path.read_bytes()).hexdigest()
        result = checker.audit(self.path, sha)
        self.assertFalse(result["static_checks"]["only_expected_provenance_attachment"])

    def test_three_pages_fail_closed(self):
        sha = self.make_pdf(pages=3)
        result = checker.audit(self.path, sha)
        self.assertFalse(result["static_checks"]["exactly_two_pages"])
        self.assertFalse(result["static_preflight_passed"])

    def test_legal_risks_are_flags_not_authority(self):
        sha = self.make_pdf()
        result = checker.audit(self.path, sha)
        self.assertTrue(result["legal_review_required"])
        self.assertFalse(result["independent_r2_upload_approved"])


if __name__ == "__main__":
    unittest.main()
