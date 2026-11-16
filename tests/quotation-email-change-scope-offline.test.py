"""Synthetic, offline regression tests: only the approved contact email may change."""
import sys
import tempfile
import unittest
from pathlib import Path
import fitz

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_quotation_email_change_scope import audit

class QuotationEmailScopeTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        self.before=self.root/"prior-clean.pdf"
        self.after=self.root/"corrected-clean.pdf"

    def make(self,path,email="lovelystones26@gmail",price="100.00",
             terms="General terms and conditions",logo=False):
        doc=fitz.open()
        first=doc.new_page(width=612.24,height=858.96)
        first.insert_text((457,88),email,fontsize=8)
        first.insert_text((60,400),"Tombstone",fontsize=9)
        first.insert_text((300,400),price,fontsize=9)
        first.insert_text((55,720),"Terms summary",fontsize=9)
        if logo:
            first.draw_rect(fitz.Rect(25,25,90,65),color=(1,0,0),fill=(1,0,0))
        second=doc.new_page(width=841.92,height=1190.64)
        second.insert_text((300,120),"General terms",fontsize=12)
        second.insert_text((60,300),terms,fontsize=10)
        second.insert_text((60,800),"Customer Declaration",fontsize=10)
        doc.save(path)
        doc.close()

    def test_only_full_email_replacement_is_accepted_not_template_approved(self):
        self.make(self.before)
        self.make(self.after,email="lovelystones26@gmail.com")
        result=audit(self.before,self.after)
        self.assertTrue(result["technical_check_passed"],result)
        self.assertTrue(result["complete_email_verified"])
        self.assertEqual(result["changed_pixels_outside_approved_email_region"],[0,0])
        self.assertGreater(result["changed_pixels_by_page"][0],0)
        self.assertEqual(result["changed_pixels_by_page"][1],0)
        self.assertFalse(result["private_template_approved"])
        self.assertFalse(result["template_upload_authorized"])
        self.assertFalse(result["deployment_authorized"])

    def test_rejects_unrelated_price_change_even_when_email_fixed(self):
        self.make(self.before)
        self.make(self.after,email="lovelystones26@gmail.com",price="900.00")
        result=audit(self.before,self.after)
        self.assertFalse(result["technical_check_passed"])
        self.assertFalse(result["all_other_first_page_words_preserved"])
        self.assertGreater(result["changed_pixels_outside_approved_email_region"][0],0)

    def test_rejects_nontext_logo_or_graphic_added_outside_email(self):
        self.make(self.before)
        self.make(self.after,email="lovelystones26@gmail.com",logo=True)
        result=audit(self.before,self.after)
        self.assertFalse(result["technical_check_passed"])
        self.assertGreater(result["changed_pixels_outside_approved_email_region"][0],0)

    def test_rejects_changed_terms_page(self):
        self.make(self.before)
        self.make(self.after,email="lovelystones26@gmail.com",terms="Different terms")
        result=audit(self.before,self.after)
        self.assertFalse(result["technical_check_passed"])
        self.assertFalse(result["second_page_words_preserved"])
        self.assertGreater(result["changed_pixels_outside_approved_email_region"][1],0)

    def test_rejects_wrong_or_missing_complete_email(self):
        self.make(self.before)
        for wrong in ["lovelystones26@gmail","lovelystones26@example.com",""]:
            with self.subTest(wrong=wrong):
                self.make(self.after,email=wrong)
                result=audit(self.before,self.after)
                self.assertFalse(result["technical_check_passed"])
                self.assertFalse(result["complete_email_verified"])

    def test_rejects_wrong_page_geometry(self):
        self.make(self.before)
        self.make(self.after,email="lovelystones26@gmail.com")
        changed=fitz.open(self.after)
        changed[0].set_cropbox(fitz.Rect(0,0,600,840))
        output=self.root/"bad-geometry.pdf"
        changed.save(output)
        changed.close()
        with self.assertRaisesRegex(ValueError,"quotation_page_geometry_mismatch"):
            audit(self.before,output)

if __name__=="__main__":
    unittest.main()
