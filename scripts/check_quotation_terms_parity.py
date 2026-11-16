#!/usr/bin/env python3
"""Offline comparison: source Lovely quotation vs proposed logo-free PDF.

Keep the original and candidate PRIVATE. Both PDF paths are operator-owned local
inputs, never uploaded. This check only establishes structural/logo clearance and
word/position parity outside page-two's removed logo. It does NOT approve legal
terms, payment instructions, final appearance, customer delivery or deployment.

Usage: python scripts/check_quotation_terms_parity.py ORIGINAL.pdf CANDIDATE.pdf [REPORT.json]
"""
import hashlib
import json
import sys
from pathlib import Path

import fitz

PAGE_SIZES=((612.24,858.96),(841.92,1190.64))
LOGO_ZONES=(fitz.Rect(15,15,325,160),fitz.Rect(10,10,285,160))
MAX_FILE=10*1024*1024
SCALE=2
PIXEL_WHITE=250
MAX_INK=.0001
EXPECTED_CONTACT_EMAIL="lovelystones26@gmail.com"

def _word_signature(page,logo_zone=None):
    words=[]
    for entry in page.get_text("words"):
        box=fitz.Rect(entry[:4])
        if logo_zone and box.intersects(logo_zone):
            # Only the removed logo may be excluded. A crossing word is a blocker.
            if not logo_zone.contains(box):
                raise ValueError("source_logo_zone_text_overlaps_contract")
            continue
        words.append((str(entry[4]),tuple(round(float(v),2) for v in entry[:4])))
    return words

def _same_words(left,right):
    return len(left)==len(right) and all(
        l[0]==r[0] and all(abs(a-b)<=.2 for a,b in zip(l[1],r[1]))
        for l,r in zip(left,right)
    )

def _clear_logo_zone(page,zone):
    if not page.rect.contains(zone):
        raise ValueError("logo_zone_outside_page")
    if any(fitz.Rect(word[:4]).intersects(zone) for word in page.get_text("words")):
        return False,1.0
    raster=page.get_pixmap(matrix=fitz.Matrix(SCALE,SCALE),clip=zone,
                          colorspace=fitz.csRGB,alpha=False)
    samples=memoryview(raster.samples)
    dark=sum(1 for p in range(0,len(samples),3)
             if min(samples[p:p+3])<PIXEL_WHITE)
    fraction=dark/max(1,raster.width*raster.height)
    return fraction<=MAX_INK,fraction

def audit(original_path,candidate_path):
    paths=(Path(original_path),Path(candidate_path))
    raw=[]
    for path in paths:
        if not path.is_file() or path.stat().st_size>MAX_FILE:
            raise ValueError("missing_or_oversize_private_pdf")
        data=path.read_bytes()
        if len(data)<5 or data[:5]!=b"%PDF-":
            raise ValueError("invalid_private_pdf")
        raw.append(data)
    docs=[fitz.open(stream=b,filetype="pdf") for b in raw]
    try:
        if any(doc.page_count!=2 for doc in docs):
            raise ValueError("exactly_two_pages_required")
        for doc in docs:
            for page,(w,h) in zip(doc,PAGE_SIZES):
                if abs(page.rect.width-w)>.2 or abs(page.rect.height-h)>.2:
                    raise ValueError("page_geometry_mismatch")
        blank,ink=[],[]
        for i,zone in enumerate(LOGO_ZONES):
            ok,fraction=_clear_logo_zone(docs[1][i],zone)
            blank.append(ok)
            ink.append(round(fraction,7))
        old=_word_signature(docs[0][1],LOGO_ZONES[1])
        new=_word_signature(docs[1][1])
        terms_equal=_same_words(old,new)
        contact_tokens=docs[1][0].get_text().split()
        email_verified=EXPECTED_CONTACT_EMAIL in contact_tokens and \
            "lovelystones26@gmail" not in contact_tokens
        safe=all(blank) and terms_equal and email_verified
        return {
            "original_sha256":hashlib.sha256(raw[0]).hexdigest(),
            "candidate_sha256":hashlib.sha256(raw[1]).hexdigest(),
            "page_count":2,
            "logo_zone_clear":blank,
            "logo_zone_nonwhite_fraction":ink,
            "page2_non_logo_words_source":len(old),
            "page2_non_logo_words_candidate":len(new),
            "page2_words_and_positions_preserved":terms_equal,
            "complete_contact_email_verified":email_verified,
            "technical_check_passed":safe,
            "human_approved":False,
            "template_upload_authorized":False,
            "migration_authorized":False,
            "deployment_authorized":False,
            "remaining":"Requires editable-field audit, visual parity, legal/payment details approval, "
              "independent review and separate private staging authorization."
        }
    finally:
        for doc in docs:doc.close()

if __name__=="__main__":
    if len(sys.argv) not in (3,4):
        raise SystemExit("usage: check_quotation_terms_parity.py ORIGINAL.pdf CANDIDATE.pdf [REPORT.json]")
    try:
        result=audit(sys.argv[1],sys.argv[2])
    except (OSError,ValueError,fitz.FileDataError) as exc:
        result={"technical_check_passed":False,"error":str(exc),
                "human_approved":False,"deployment_authorized":False}
    message=json.dumps(result,indent=2)+"\n"
    print(message,end="")
    if len(sys.argv)==4:
        Path(sys.argv[3]).write_text(message,encoding="utf-8")
    raise SystemExit(0 if result.get("technical_check_passed") else 2)
