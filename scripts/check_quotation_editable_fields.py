#!/usr/bin/env python3
"""Read-only Lovely quotation field-clearance inspection.

Usage: python scripts/check_quotation_editable_fields.py CLEAN_TEMPLATE.pdf [REPORT.json]

Checks fixed page-one editable areas using extracted text and PDF raster ink.
The original quote-number/date placeholders are intentionally covered by
reviewed rectangle overlays; only their expected words may be underneath.
Never approves a template, source terms, customer data or deployment.
"""
import hashlib
import json
import sys
from pathlib import Path
import fitz

PAGE1=(612.24,858.96)
PAGE2=(841.92,1190.64)
THRESHOLD=250
MAX_INK=.01

def fields():
    items=[
       ("customer_header",(42,195,202,206),"blank"),
       ("customer_name",(42,214,367,226),"blank"),
       ("customer_contact",(42,231,367,243),"blank"),
       ("subtotal_amount",(506,644,591,658),"blank"),
       ("discount_amount",(506,671,591,685),"blank"),
       ("grand_total_amount",(503,700,586,714),"solid"),
       ("payment_method",(140,691,370,704),"blank"),
       ("quote_number_placeholder",(447,200,589,220),"overpaint"),
       ("date_placeholder",(464,234,591,260),"overpaint"),
    ]
    for index in range(8):
        baseline=337+index*40
        for col,x,width in [
            ("description_primary",42,226),("quantity",292,48),
            ("unit_price",376,101),("line_total",502,89)
        ]:
            items.append((f"row_{index+1}_{col}",
                          (x,baseline-9,x+width,baseline+1),"blank"))
        # Second line at baseline + 10; horizontal separators begin at +12.
        items.append((f"row_{index+1}_description_second",
                      (42,baseline+1,268,baseline+11),"blank"))
    return items

def check(path):
    data=Path(path).read_bytes()
    if not 5<=len(data)<=10*1024*1024 or data[:5]!=b"%PDF-":
        raise ValueError("invalid_template_pdf")
    doc=fitz.open(stream=data,filetype="pdf")
    if len(doc)!=2:
        raise ValueError("two_pages_required")
    for index,(width,height) in enumerate((PAGE1,PAGE2)):
        page=doc[index]
        if abs(page.rect.width-width)>.2 or abs(page.rect.height-height)>.2:
            raise ValueError("page_geometry_mismatch")
    page=doc[0]
    words=page.get_text("words")
    expected={"quote_number_placeholder":{"QUOTE","NO:","__________"},
              "date_placeholder":{"Date:","__________"}}
    results=[]
    safe=True
    for name,coords,kind in fields():
        rect=fitz.Rect(coords)
        if not page.rect.contains(rect):
            raise ValueError("field_outside_page")
        hits=[word for word in words if fitz.Rect(word[:4]).intersects(rect)]
        content=[w[4] for w in hits]
        if kind in ("blank","solid"):
            pix=page.get_pixmap(matrix=fitz.Matrix(2,2),clip=rect,
                                colorspace=fitz.csRGB,alpha=False)
            n=sum(1 for i in range(0,len(pix.samples),3)
                  if min(pix.samples[i:i+3])<THRESHOLD)
            ink=n/(pix.width*pix.height)
            clear=not hits and (ink<=MAX_INK if kind=="blank" else ink>.95)
        else:
            ink=None
            # Every source glyph under the future overlay must be expected
            # placeholder text and entirely contained in the cover region.
            clear=bool(hits) and all(
                w[4] in expected[name] and rect.contains(fitz.Rect(w[:4]))
                for w in hits
            )
        safe &= clear
        results.append({"field":name,"type":kind,"clear":bool(clear),
                        "overlapping_text":content[:12],
                        "ink_fraction":None if ink is None else round(ink,5)})
    return {"sha256":hashlib.sha256(data).hexdigest(),
            "page_count":2,"field_checks":results,
            "all_fields_safe":bool(safe),
            "template_approved":False,"deployment_authorized":False,
            "limitations":"Only static field clearance. Logo zones, final legal terms, complete visual design and independent human approval require separate review."}

if __name__=="__main__":
    if len(sys.argv) not in (2,3):
        raise SystemExit("usage: check_quotation_editable_fields.py TEMPLATE.pdf [REPORT.json]")
    try:
        report=check(sys.argv[1])
    except (OSError,ValueError,fitz.FileDataError) as exc:
        report={"all_fields_safe":False,"error":str(exc)}
    encoded=json.dumps(report,indent=2)+"\n"
    print(encoded,end="")
    if len(sys.argv)==3:
        Path(sys.argv[2]).write_text(encoded,encoding="utf-8")
    raise SystemExit(0 if report.get("all_fields_safe") else 2)
