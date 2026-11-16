#!/usr/bin/env python3
"""Read-only, local quotation PDF preflight. Never confers approval or uploads files.

Usage:
    python scripts/check_quotation_private_release_candidate.py PRIVATE.pdf --expected-sha256 64HEX

Do not pass a customer PDF to public CI. Logs contain no input text, financial
account digits, names of customers, paths or page images; only boolean checks.
The script cannot establish legal validity or independently verify signatures.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path

import fitz

MAX_BYTES = 10 * 1024 * 1024
PAGE_SIZES = ((612.24, 858.96), (841.92, 1190.64))
FOOTER_LINES = (
    "MAHALAPYE - GABORONE - PALAPYE",
    "MAUN - FRANCISTOWN",
)
LEGACY_FOOTER_SITES = ("SEROWE", "PHIKWE")
REQUIRED_P1_PHRASES = (
    "LOVELY TOMBSTONES",
    "FIRST NATIONAL BANK",
    "RIVERWALK PLAZA",
    "LOVELYSTONES26@GMAIL.COM",
)
DRAFT_MARKERS = (
    "LEGAL REVIEW DRAFT", "NOT FOR CUSTOMER ISSUE", "NOT FOR ISSUE",
)
# Only surface categories, never quote legal/customer/banking source text.
LEGAL_ATTENTION_PATTERNS = {
    "fixed_layby_forfeiture": r"refund of 80%|30% of the amount paid",
    "automatic_memorial_disposal": r"stone will be destroyed or recycled",
    "ambiguous_refund_timing": r"refunds will be given within 3 days",
    "installation_date_conflict": r"cannot guarantee the erection date",
    "broad_liability_exclusion": r"exempts? lovely tombstone from any civil or legal liability",
}


def audit(path, expected_sha256):
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256 or ""):
        raise ValueError("expected_sha256_required")
    file = Path(path)
    if not file.is_file() or file.stat().st_size > MAX_BYTES:
        raise ValueError("invalid_or_oversized_private_pdf")
    raw = file.read_bytes()
    if len(raw) < 5 or raw[:5] != b"%PDF-":
        raise ValueError("invalid_private_pdf_header")

    actual = hashlib.sha256(raw).hexdigest()
    checks = {"exact_pdf_sha256": actual == expected_sha256.lower()}
    legal_flags = []
    document = fitz.open(stream=raw, filetype="pdf")
    try:
        checks["unencrypted"] = not document.needs_pass
        checks["exactly_two_pages"] = document.page_count == 2
        # Existing operator PDFs may carry a bounded C2PA Content Credentials
        # manifest. Deny all other attachments, including oversized or nameless.
        checks["only_expected_provenance_attachment"] = all(
            (info := document.embfile_info(i)).get("name") == "Content Credentials"
            and info.get("filename") == "Content Credentials"
            and isinstance(info.get("length"), int)
            and 0 <= info["length"] <= 65536
            for i in range(document.embfile_count())
        )
        if checks["exactly_two_pages"] and checks["unencrypted"]:
            checks["expected_page_sizes"] = all(
                abs(page.rect.width - width) <= 0.2
                and abs(page.rect.height - height) <= 0.2
                for page, (width, height) in zip(document, PAGE_SIZES)
            )
            p1 = document[0].get_text().upper()
            p2 = document[1].get_text().upper()
            checks["page_one_identity_fields"] = all(s in p1 for s in REQUIRED_P1_PHRASES)
            checks["page_two_terms_present"] = (
                "GENERAL TERMS AND CONDITIONS" in p2 and len(p2) >= 400
            )
            footer = p2.rsplit("ORDER NOW", 1)[-1] if "ORDER NOW" in p2 else ""
            checks["five_office_footer_exact"] = all(s in footer for s in FOOTER_LINES)
            checks["old_office_names_absent"] = not any(s in footer for s in LEGACY_FOOTER_SITES)
            content = p1 + "\n" + p2
            checks["no_review_draft_labels"] = not any(s in content for s in DRAFT_MARKERS)
            checks["no_unresolved_bracket_fields"] = not bool(
                re.search(r"\[[^\]\n]{4,180}\]", content)
            )
            for label, pattern in LEGAL_ATTENTION_PATTERNS.items():
                if re.search(pattern, p2, re.IGNORECASE):
                    legal_flags.append(label)
        else:
            for key in ("expected_page_sizes", "page_one_identity_fields",
                        "page_two_terms_present", "five_office_footer_exact",
                        "old_office_names_absent", "no_review_draft_labels",
                        "no_unresolved_bracket_fields"):
                checks[key] = False
    finally:
        document.close()

    return {
        "sha256": actual,
        "static_checks": checks,
        "static_preflight_passed": all(checks.values()),
        "legal_attention_flags": sorted(legal_flags),
        "legal_review_required": True,
        "owner_full_pdf_accepted": False,
        "independent_r2_upload_approved": False,
        "template_upload_authorized": False,
        "worker_deployment_authorized": False,
        "production_activation_authorized": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="Private/local PDF only; never upload to public CI")
    parser.add_argument("--expected-sha256", required=True)
    args = parser.parse_args()
    try:
        result = audit(args.pdf, args.expected_sha256)
    except (OSError, ValueError, fitz.FileDataError) as error:
        result = {
            "static_preflight_passed": False,
            "error_code": str(error) if isinstance(error, ValueError) else "unreadable_private_pdf",
            "template_upload_authorized": False,
            "production_activation_authorized": False,
        }
    print(json.dumps(result, sort_keys=True, indent=2))
    raise SystemExit(0 if result["static_preflight_passed"] else 2)


if __name__ == "__main__":
    main()
