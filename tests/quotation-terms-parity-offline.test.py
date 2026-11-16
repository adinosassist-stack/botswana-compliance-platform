"""Private Lovely template parity audit — synthetic-only CI regression."""
import sys
import tempfile
import unittest
from pathlib import Path

import fitz

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.check_quotation_terms_parity import audit

class QuotationTermsParityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.original=self.root/"source.pdf"
        self.candidate=self.root/"candidate.pdf"

    def pdf(self,path,source=False,terms="General terms and conditions",
            extra_ink=False,page2_shift=0,email="lovelystones26@gmail.com"):
        doc=fitz.open()
        p=doc.new_page(width=612.24,height=858.96)
        p.insert_text((375,90),"Contact only",fontsize=11)
        p.insert_text((340,145),email,fontsize=8)
        if source:
            p.draw_rect(fitz.Rect(30,32,180,95),
                        fill=(1,0,0),color=(1,0,0))
        elif extra_ink:
            p.draw_rect(fitz.Rect(30,32,180,95),
                        fill=(0,0,0),color=(0,0,0))
        p2=doc.new_page(width=841.92,height=1190.64)
        if source:
            p2.insert_text((50,70),"Lovely",fontsize=26)
        p2.insert_text((320,115),"General terms",fontsize=12)
        p2.insert_text((100,350+page2_shift),terms,fontsize=11)
        p2.insert_text((100,650),"Customer Declaration",fontsize=11)
        doc.save(path)
        doc.close()

    def test_preserved_words_and_clear_zones_pass_without_approval(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate)
        result=audit(self.original,self.candidate)
        self.assertTrue(result["technical_check_passed"])
        self.assertEqual(result["logo_zone_clear"],[True,True])
        self.assertTrue(result["page2_words_and_positions_preserved"])
        self.assertFalse(result["human_approved"])
        self.assertFalse(result["deployment_authorized"])
        self.assertFalse(result["template_upload_authorized"])
        self.assertTrue(result["complete_contact_email_verified"])


    def test_shortened_contact_email_fails_even_with_valid_terms(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate,email="lovelystones26@gmail")
        result=audit(self.original,self.candidate)
        self.assertFalse(result["technical_check_passed"])
        self.assertFalse(result["complete_contact_email_verified"])

    def test_missing_contact_email_fails_closed(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate,email="")
        result=audit(self.original,self.candidate)
        self.assertFalse(result["technical_check_passed"])

    def test_changed_terms_are_not_accepted(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate,terms="Different terms and conditions")
        result=audit(self.original,self.candidate)
        self.assertFalse(result["technical_check_passed"])
        self.assertFalse(result["page2_words_and_positions_preserved"])

    def test_moved_terms_are_not_accepted(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate,page2_shift=15)
        result=audit(self.original,self.candidate)
        self.assertFalse(result["technical_check_passed"])

    def test_raster_logo_ink_on_page_one_is_rejected(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate,extra_ink=True)
        result=audit(self.original,self.candidate)
        self.assertFalse(result["technical_check_passed"])
        self.assertEqual(result["logo_zone_clear"],[False,True])

    def test_page_geometry_mismatch_rejected(self):
        self.pdf(self.original,source=True)
        self.pdf(self.candidate)
        doc=fitz.open(self.candidate)
        doc[1].set_cropbox(fitz.Rect(0,0,800,1100))
        changed=self.root/"wrong-size.pdf"
        doc.save(changed)
        doc.close()
        with self.assertRaisesRegex(ValueError,"page_geometry_mismatch"):
            audit(self.original,changed)

if __name__=="__main__":
    unittest.main()
