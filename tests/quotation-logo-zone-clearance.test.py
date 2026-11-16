#!/usr/bin/env python3
"""Synthetic PDF clearance tests; no Lovely customer document in repository."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import fitz

CHECKER = Path(__file__).resolve().parents[1] / "scripts" / "check_quotation_logo_zones.py"


class ClearanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.zones = self.base / "zones.json"
        self.zones.write_text(json.dumps({"pages": [
            {"logoZone": {"x": 10, "y": 10, "width": 80, "height": 70}},
            {"logoZone": {"x": 10, "y": 10, "width": 80, "height": 70}},
        ]}))

    def run_pdf(self, add_content=None):
        doc = fitz.open()
        for index in range(2):
            page = doc.new_page(width=200, height=300)
            if add_content:
                add_content(index, page)
        target = self.base / "template.pdf"
        doc.save(target)
        proc = subprocess.run([sys.executable, str(CHECKER), str(target), str(self.zones)],
                              capture_output=True, text=True, check=False)
        return proc.returncode, json.loads(proc.stdout or proc.stderr)

    def test_blank_two_page_pdf_passes_collision_preflight(self):
        code, report = self.run_pdf()
        self.assertEqual(code, 0)
        self.assertTrue(report["collision_free"])
        self.assertFalse(report["approved"])  # No automatic approval.

    def test_embedded_text_collision_is_detected(self):
        def draw(index, page):
            if index == 1:
                page.insert_text((20, 35), "Original terms header", fontsize=12)
        code, report = self.run_pdf(draw)
        self.assertEqual(code, 2)
        self.assertFalse(report["pages"][1]["clear"])
        self.assertGreater(report["pages"][1]["overlapping_text_count"], 0)

    def test_vector_or_image_ink_collision_is_detected(self):
        def draw(index, page):
            if index == 0:
                page.draw_rect(fitz.Rect(20, 20, 50, 40),
                               fill=(1, 0, 0), color=(1, 0, 0))
        code, report = self.run_pdf(draw)
        self.assertEqual(code, 2)
        self.assertFalse(report["pages"][0]["raster_clear"])

    def test_rejects_zone_outside_page(self):
        self.zones.write_text(json.dumps({"pages": [
            {"logoZone": {"x": 190, "y": 10, "width": 80, "height": 70}},
            {"logoZone": {"x": 10, "y": 10, "width": 80, "height": 70}},
        ]}))
        code, _ = self.run_pdf()
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
