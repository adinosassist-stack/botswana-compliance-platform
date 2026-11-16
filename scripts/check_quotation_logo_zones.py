#!/usr/bin/env python3
"""Fail-closed visual clearance audit for proposed 2-page quotation PDF logo zones.

Usage:
  python scripts/check_quotation_logo_zones.py TEMPLATE.pdf ZONES.json [REPORT.json]
ZONES.json must have {"pages":[{"logoZone":{"x":..,"y":..,"width":..,
"height":..}},...]} in TOP-LEFT PDF points.

This is an offline preflight that checks extracted text intersections AND raster
ink in the proposed rectangles. Raster checks catch embedded logo images, rules
and vector content that text extraction cannot see. A negative check is NOT
permission to deploy or evidence that a template is customer-safe; separate
human review and operator approval of a SHA-256-pinned logo-free PDF is required.
No files are sent to GitHub or a network service.
"""
import hashlib
import json
import sys
from pathlib import Path

import fitz

SCALE = 2
MIN_CHANNEL = 250  # effectively white, with slight antialias allowance
MAX_INK_FRACTION = 0.0001
MAX_JSON_BYTES = 64 * 1024


def audit(pdf_path: Path, zones_path: Path):
    if zones_path.stat().st_size > MAX_JSON_BYTES:
        raise ValueError("zones_file_too_large")
    zones = json.loads(zones_path.read_text(encoding="utf-8"))
    if not isinstance(zones, dict) or not isinstance(zones.get("pages"), list) or len(zones["pages"]) != 2:
        raise ValueError("exactly_two_pages_required")
    pdf_bytes = pdf_path.read_bytes()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise ValueError("template_too_large")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if doc.page_count != 2:
        raise ValueError("pdf_must_have_two_pages")
    report = {
        "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
        "page_count": doc.page_count,
        "pages": [],
        "approved": False,
        "note": "Offline collision evidence only. Human logo-free template review and independent approval still required.",
    }
    clear = True
    for index, (page, entry) in enumerate(zip(doc, zones["pages"])):
        zone = entry.get("logoZone") if isinstance(entry, dict) else None
        if not isinstance(zone, dict) or not all(
            isinstance(zone.get(name), (int, float)) and not isinstance(zone.get(name), bool)
            for name in ("x", "y", "width", "height")
        ):
            raise ValueError("invalid_logo_zone")
        x, y, w, h = (float(zone[name]) for name in ("x", "y", "width", "height"))
        rect = fitz.Rect(x, y, x + w, y + h)
        if not rect.is_valid or rect.is_empty or not page.rect.contains(rect):
            raise ValueError("logo_zone_outside_page")
        # Extracted text includes content that may be covered by a white overlay.
        hits = []
        for word in page.get_text("words"):
            word_rect = fitz.Rect(word[:4])
            if word_rect.intersects(rect):
                hits.append({"text": str(word[4])[:80], "bbox": [round(v, 2) for v in word[:4]]})
        pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE),
                              clip=rect, colorspace=fitz.csRGB, alpha=False)
        pixel_count = pix.width * pix.height
        samples = memoryview(pix.samples)
        ink_count = sum(
            1 for offset in range(0, len(samples), 3)
            if any(channel < MIN_CHANNEL for channel in samples[offset:offset + 3])
        )
        ink_fraction = ink_count / pixel_count if pixel_count else 1
        safe = not hits and ink_fraction <= MAX_INK_FRACTION
        clear &= safe
        report["pages"].append({
            "page": index + 1,
            "size_pt": [round(page.rect.width, 2), round(page.rect.height, 2)],
            "logo_zone": {"x": x, "y": y, "width": w, "height": h},
            "overlapping_text_count": len(hits),
            "overlapping_text_examples": hits[:12],
            "nonwhite_pixel_fraction": round(ink_fraction, 6),
            "raster_clear": ink_fraction <= MAX_INK_FRACTION,
            "clear": safe,
        })
    report["collision_free"] = bool(clear)
    return report


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("usage: check_quotation_logo_zones.py TEMPLATE.pdf ZONES.json [REPORT.json]")
    try:
        output = audit(Path(sys.argv[1]), Path(sys.argv[2]))
        encoded = json.dumps(output, indent=2)
        print(encoded)
        if len(sys.argv) == 4:
            Path(sys.argv[3]).write_text(encoded + "\n", encoding="utf-8")
        raise SystemExit(0 if output["collision_free"] else 2)
    except (ValueError, fitz.FileDataError) as exc:
        print(json.dumps({"collision_free": False, "error": str(exc)}), file=sys.stderr)
        raise SystemExit(2)
