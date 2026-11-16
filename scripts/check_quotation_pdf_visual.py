#!/usr/bin/env python3
"""Offline, read-only quotation PDF structural acceptance.

Usage: python scripts/check_quotation_pdf_visual.py reference.pdf candidate.pdf
Requires PyMuPDF (fitz) in the independent acceptance environment.
No attached customer quotation PDFs or source data are committed to the repo.
This does not certify pixel parity, redaction, logo-free source approval or
production integration.
"""
import json
import sys
from pathlib import Path

import fitz


def evaluate(reference_path, candidate_path):
    ref = fitz.open(reference_path)
    out = fitz.open(candidate_path)
    result = {"reference_pages": len(ref), "candidate_pages": len(out), "page_checks": []}
    result["two_pages"] = len(ref) == len(out) == 2
    all_ok = result["two_pages"]
    for i in range(min(len(ref), len(out))):
        r, c = ref[i], out[i]
        size = abs(r.rect.width - c.rect.width) < .1 and abs(r.rect.height - c.rect.height) < .1
        text = r.get_text(sort=False) == c.get_text(sort=False)
        r_images = len(r.get_images(full=True))
        c_images = len(c.get_images(full=True))
        additional_logo_image = c_images > r_images
        result["page_checks"].append({
            "page": i + 1, "size_preserved": size,
            "extracted_text_preserved": text,
            "reference_image_objects": r_images,
            "candidate_image_objects": c_images,
            "additional_image_object": additional_logo_image,
            "reference_size_pt": [round(r.rect.width, 2), round(r.rect.height, 2)],
            "candidate_size_pt": [round(c.rect.width, 2), round(c.rect.height, 2)],
        })
        all_ok &= size and text and additional_logo_image
    result["checks_passed"] = bool(all_ok)
    result["limitations"] = (
        "Does not prove pixel-perfect visual parity, blank logo zones, live PDF engine integration, "
        "customer editability, correct new quote values, or production deployment."
    )
    return result


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: check_quotation_pdf_visual.py REFERENCE_PDF CANDIDATE_PDF")
    report = evaluate(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report["checks_passed"] else 1)
