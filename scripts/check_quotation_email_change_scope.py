#!/usr/bin/env python3
"""Offline, read-only audit of a narrowly scoped email correction in a private PDF.

Usage:
    python scripts/check_quotation_email_change_scope.py PREVIOUS_CLEAN.pdf CORRECTED.pdf [REPORT.json]

The previous and corrected PDFs must remain operator-private. This tool never
uploads them or logs their text, image bytes or bank details. A structural match
does not constitute human/legal review, template registration or deployment.
"""
import hashlib
import json
import sys
from pathlib import Path

import fitz

MAX_BYTES = 10 * 1024 * 1024
PAGE_SIZES = ((612.24, 858.96), (841.92, 1190.64))
EMAIL_OLD = "lovelystones26@gmail"
EMAIL_NEW = "lovelystones26@gmail.com"
# The previously inspected contact-email line only, in top-left PDF points.
EMAIL_REGION = fitz.Rect(442, 72, 584, 98)
SCALE = 2


def _load(path):
    path = Path(path)
    if not path.is_file() or not 5 <= path.stat().st_size <= MAX_BYTES:
        raise ValueError("invalid_private_candidate_size")
    raw = path.read_bytes()
    if not raw.startswith(b"%PDF-"):
        raise ValueError("invalid_private_pdf")
    document = fitz.open(stream=raw, filetype="pdf")
    if document.page_count != 2:
        document.close()
        raise ValueError("two_pages_required")
    for page, (width, height) in zip(document, PAGE_SIZES):
        if abs(page.rect.width - width) > .2 or abs(page.rect.height - height) > .2:
            document.close()
            raise ValueError("quotation_page_geometry_mismatch")
    return document, hashlib.sha256(raw).hexdigest()


def _signature(page, exclude_email=False):
    words = []
    for word in page.get_text("words"):
        bbox = fitz.Rect(word[:4])
        if exclude_email and word[4] in (EMAIL_OLD, EMAIL_NEW):
            if not EMAIL_REGION.contains(bbox):
                raise ValueError("email_outside_approved_region")
            continue
        words.append((word[4], tuple(round(float(x), 2) for x in word[:4])))
    return words


def _pixels(page):
    pixels = page.get_pixmap(
        matrix=fitz.Matrix(SCALE, SCALE), colorspace=fitz.csRGB, alpha=False
    )
    return pixels.width, pixels.height, memoryview(pixels.samples).tobytes()


def audit(previous_clean_path, corrected_path):
    old_doc, old_sha = _load(previous_clean_path)
    try:
        new_doc, new_sha = _load(corrected_path)
    except Exception:
        old_doc.close()
        raise
    try:
        old_email = [w for w in old_doc[0].get_text("words") if w[4] == EMAIL_OLD]
        new_email = [w for w in new_doc[0].get_text("words") if w[4] == EMAIL_NEW]
        old_tokens = [w[4] for w in old_doc[0].get_text("words")]
        new_tokens = [w[4] for w in new_doc[0].get_text("words")]
        complete_email = (
            len(old_email) == len(new_email) == 1
            and EMAIL_NEW not in old_tokens
            and EMAIL_OLD not in new_tokens
            and EMAIL_REGION.contains(fitz.Rect(old_email[0][:4]))
            and EMAIL_REGION.contains(fitz.Rect(new_email[0][:4]))
        )
        first_page_other_words_unchanged = (
            _signature(old_doc[0], True) == _signature(new_doc[0], True)
        )
        second_page_words_unchanged = _signature(old_doc[1]) == _signature(new_doc[1])
        changed_pixels = [0, 0]
        outside_pixels = [0, 0]
        changed_boxes = []
        for index in range(2):
            left_w, left_h, left = _pixels(old_doc[index])
            right_w, right_h, right = _pixels(new_doc[index])
            if left_w != right_w or left_h != right_h:
                raise ValueError("raster_dimensions_mismatch")
            minx, miny, maxx, maxy = left_w, left_h, -1, -1
            # Compare full RGB pixels rather than only extracted text. Raster
            # equality catches invisible-text overlays, altered lines/images
            # and changes to the printed terms outside approved email area.
            for pos in range(0, len(left), 3):
                if left[pos:pos+3] == right[pos:pos+3]:
                    continue
                pixel = pos // 3
                x, y = pixel % left_w, pixel // left_w
                changed_pixels[index] += 1
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
                if index != 0 or not EMAIL_REGION.contains(
                    fitz.Point((x + .5) / SCALE, (y + .5) / SCALE)
                ):
                    outside_pixels[index] += 1
            changed_boxes.append(
                None if maxx < 0 else
                [minx / SCALE, miny / SCALE, (maxx+1) / SCALE, (maxy+1) / SCALE]
            )
        passed = (
            complete_email
            and first_page_other_words_unchanged
            and second_page_words_unchanged
            and changed_pixels[0] > 0
            and outside_pixels == [0, 0]
        )
        return {
            "previous_clean_sha256": old_sha,
            "corrected_sha256": new_sha,
            "page_count": 2,
            "complete_email_verified": complete_email,
            "all_other_first_page_words_preserved": first_page_other_words_unchanged,
            "second_page_words_preserved": second_page_words_unchanged,
            "changed_pixels_by_page": changed_pixels,
            "changed_pixels_outside_approved_email_region": outside_pixels,
            "changed_bounds_pt": changed_boxes,
            "technical_check_passed": passed,
            "private_template_approved": False,
            "template_upload_authorized": False,
            "migration_authorized": False,
            "deployment_authorized": False,
        }
    finally:
        old_doc.close()
        new_doc.close()


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit(
            "usage: check_quotation_email_change_scope.py PREVIOUS_CLEAN.pdf CORRECTED.pdf [REPORT.json]"
        )
    try:
        result = audit(sys.argv[1], sys.argv[2])
    except (OSError, ValueError, fitz.FileDataError) as exc:
        result = {
            "technical_check_passed": False,
            "error": str(exc),
            "private_template_approved": False,
            "deployment_authorized": False,
        }
    encoded = json.dumps(result, indent=2) + "\n"
    print(encoded, end="")
    if len(sys.argv) == 4:
        Path(sys.argv[3]).write_text(encoded, encoding="utf-8")
    raise SystemExit(0 if result.get("technical_check_passed") else 2)
