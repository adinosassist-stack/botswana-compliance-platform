"""Synthetic Lovely template field-collision regressions, no customer data."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import fitz

CHECKER=Path(__file__).resolve().parents[1]/"scripts"/"check_quotation_editable_fields.py"

class QuotationEditableFieldTests(unittest.TestCase):
    def setUp(self):
        self.dir=tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path=Path(self.dir.name)/"synthetic.pdf"

    def run_fixture(self,overlay=None):
        doc=fitz.open()
        page=doc.new_page(width=612.24,height=858.96)
        doc.new_page(width=841.92,height=1190.64)
        page=doc[0]
        page.insert_text((455,214),"QUOTE NO: __________",fontsize=8)
        page.insert_text((471,251),"Date: __________",fontsize=8)
        page.draw_rect(fitz.Rect(399,692,591,720),fill=(1,0,0),color=(1,0,0))
        for index in range(8):
            y=349.5+index*40
            page.draw_line(fitz.Point(40,y),fitz.Point(591,y),
                           color=(.85,.85,.85),width=.7)
        if overlay:
            overlay(page)
        doc.save(self.path)
        completed=subprocess.run(
            [sys.executable,str(CHECKER),str(self.path)],
            capture_output=True,text=True,check=False
        )
        return completed.returncode,json.loads(completed.stdout)

    def test_synthetic_blank_field_zones_pass_without_template_approval(self):
        status,report=self.run_fixture()
        self.assertEqual(status,0,[r for r in report.get("field_checks",[]) if not r["clear"]])
        self.assertTrue(report["all_fields_safe"])
        self.assertEqual(len(report["field_checks"]),49)
        self.assertFalse(report["template_approved"])
        self.assertFalse(report["deployment_authorized"])

    def test_rejects_hidden_text_in_line_item_price(self):
        status,report=self.run_fixture(
            lambda p:p.insert_text((505,337),"9999.99",fontsize=8))
        self.assertEqual(status,2)
        item=next(x for x in report["field_checks"] if x["field"]=="row_1_line_total")
        self.assertFalse(item["clear"])

    def test_rejects_raster_ink_in_blank_customer_field(self):
        status,report=self.run_fixture(
            lambda p:p.draw_rect(fitz.Rect(50,216,90,223),fill=(0,0,0)))
        self.assertEqual(status,2)
        item=next(x for x in report["field_checks"] if x["field"]=="customer_name")
        self.assertFalse(item["clear"])

    def test_rejects_unexpected_text_hidden_by_quote_number_overlay(self):
        status,report=self.run_fixture(
            lambda p:p.insert_text((561,214),"SECRET",fontsize=7))
        self.assertEqual(status,2)
        item=next(x for x in report["field_checks"] if x["field"]=="quote_number_placeholder")
        self.assertFalse(item["clear"])

    def test_rejects_missing_red_total_band(self):
        status,report=self.run_fixture(
            lambda p:p.draw_rect(fitz.Rect(399,692,591,720),
                                 fill=(1,1,1),color=(1,1,1)))
        self.assertEqual(status,2)
        item=next(x for x in report["field_checks"] if x["field"]=="grand_total_amount")
        self.assertFalse(item["clear"])

if __name__=="__main__":
    unittest.main()
