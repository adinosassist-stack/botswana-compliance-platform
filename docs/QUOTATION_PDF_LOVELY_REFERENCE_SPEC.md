# Quotation PDF — Lovely Tombstones reference fidelity specification

**Issue:** #2477  
**Source:** user-supplied 2-page PDF `Lovely_Qoute-..Mahalapye.. stone1..pdf`, sample quotation #80 dated 10 NOV 26.  
**Scope:** design and implementation specification only; this document does not activate any feature or approve source terms for customers.

## Non-negotiable rendering rule

The issued PDF must visually match the supplied **two-page reference**, not just include approximately the same information. Keep the actual Lovely scripted red logo, no substitute font or generated logo. White background, vivid red accents, charcoal table total header, narrow crisp grey dividers, same type hierarchy, spacing, section positioning and footer organization. Use the original PDF as a **visual gold master** during implementation; it is not checked into the repository in this documentation PR.

Do not use a different template, an alternate business quotation mockup or generic A4 invoice style. Correct accidental data typos only through an explicitly versioned template decision; by default faithfully retain source headings (including printed 'QOUTE' and 'Unite Price') in the Lovely template.

## Page geometry and mapping

Source page image is portrait 768 × 1024 pixels (aspect 3:4). Render at the source page size/aspect, retaining print-safe margins; **measure actual PDF media box and element coordinates from original source** before committing rendering constants. Coordinates below are rough normalized anchors, **not measured ground truth**:

| Region | Reference placement | Content | Source and editability |
|---|---|---|---|
| Logo + divider | Page 1, upper left, roughly x=4–61%, y=3–20% | Oversized red handwritten Lovely logo, diagonal thin black separator | Original vector/high-quality company asset; admin managed by company |
| Identity details | Page 1, near top right beside logo | +267 74 583 606; lovelystones26@gmail (source appears truncated at image width, use verified company settings for actual value) | Active company settings |
| Quote label | Page 1, x≈73–93%, y≈24% | Small dark block: `QOUTE NO: #80` | Issued quote number; template copy static |
| Date | Page 1, right, y≈29% | Date 10 NOV 26 | Quote issue date |
| Table header | Page 1, y≈33–37%, x≈4–96% | Red region for blank description heading, **Quantity**, **Unite Price**; charcoal block for **Total Price** | Template labels |
| Line items | Page 1, y≈37–71% | Thin grey horizontal lines, left aligned descriptions, aligned quantity / unit price / total | Quote rows |
| Subtotal/discount | Page 1 lower right, y≈73–78% | `Sub Total`, `Discount` with price values aligned right | Calculated server-side |
| Grand total | Page 1 lower right, y≈79–82% | Solid bright red bar with `Grand Total` and amount | Calculated server-side |
| Payment method | Page 1 lower left, y≈79–85% | Bank, branch, account text | Company settings; do not globally hardcode |
| Short terms | Page 1 lower left, y≈86–94% | **Terms & Conditions** and installation, materials, warranty, foundation and equipment requirements | Admin-approved quote-type terms snapshot |
| Footer | Page 1 near bottom | Contact/Email/Map icon and contact labels | Company settings |
| Page 2 heading | Top left | Red Lovely logo, bold black **General terms and conditions** | Logo and static heading |
| Page 2 terms | Upper/middle page | Salutation and numbered general terms, Roman numeral subclauses | Admin-approved *versioned* text snapshot |
| Declaration | Lower page | **Customer Declaration:** and text | Approved terms |
| Page 2 footer | Bottom | Red `ORDER NOW` rectangle, branch lines at left, `Call/APP` plus red phone and weekday hours at right | Company locations/contact configuration |

## Sample item-row fixture (must reproduce visually)

| Description in source | Quantity | Unit price | Total price | Representation |
|---|---:|---:|---:|---|
| Tombstone | 01 | 14,000.00 | 14,000.00 | Paid sale |
| Cement | 2 | 0.00 | 0.00 | Client-supplied material (as specified under source short terms) |
| Wheel barrow (river sand) | 8 | 0.00 | 0.00 | Client-supplied |
| 20 KG Adhesive | 5 | 0.00 | 0.00 | Client-supplied |
| 600*600 Black floor tiles | 7 | 0.00 | 0.00 | Client-supplied |
| Bricks | 60 | 0.00 | 0.00 | Client-supplied |
| Concrete,Grout2kg | 1 | 0.00 | 0.00 | Client-supplied |
| Labour/Transport (source label appears run together) | 1 | free | free | Free service |

Expected visible totals: `Sub Total 14,000.00`, `Discount 0.00`, `Grand Total 14,000.00`. Internal numeric values use decimal-safe BWP money arithmetic, not locale string arithmetic. Format numbers with 2 decimals as sample, without adding currency symbols to cells when absent from the source. Distinguish truly free services vs items supplied by client even when displayed at zero price.

## Data contract / source of truth

- **Company profile:** tenant/company ID, original logo asset version, quote template version, trading and legal identity, contact phone/email, office/location, bank and branch details, approved quote-specific terms, approved general terms, footer branches, business hours.
- **Customer:** customer ID, name and optional phone/contact, location/grave/installation address. The sample visually omits customer name; **do not rearrange the sample to insert extra boxes**. Provide customer data in record metadata or an approved visually measured extension, preserving exact template when strict fidelity is selected.
- **Quote:** draft ID, issued number (tenant-unique), issue date, expiration/validity only if approved for template, rows, quantities, unit prices and supplied-by role, discount, optional tax policy (no unapproved visible tax field), total, status, issued revision, actor/audit timestamps.
- **Terms:** explicit tenant approval/version and immutable snapshot at issue time. Source page 2 includes cancellation percentages, refunds, weather, installation delays, storage/destruction, transport P50/km, permits and natural stone variance. These clauses require legal/admin review; never silently activate globally across businesses.
- **Conversion:** issue → invoice / installation job only by authorized explicit user action with idempotent linkage. No payment authorization or activation.

## UI workflow

In company workspace, show **Quotations → New Quote → Customer → Items → Preview → Issue/Download PDF**. Mobile UI may be modern and compact, but **PDF must be identical to source**. Support draft, review, duplicate, revision and retrieval; company-specific branded templates. WhatsApp sharing is user-triggered and carries the finalized quote file/link. Staff permissions and tenant isolation are enforced server-side.

## Acceptance tests / gates

1. Capture raster images of **both source and generated PDF** at the same DPI. Compare dimensions, actual source logo, content boxes, baseline alignment, table colors, red total bar, page separation, footer positions and text clipping. Specify explicit tolerances only after measuring gold master. No generic substitute logo.
2. Exactly two pages for fixture quote #80; visual compare each page, not page 1 only.
3. Totals fixture P14,000.00; free row renders `free`, client-provided 0.00 renders `0.00`, each quantity matches.
4. Long company names / customer data / localized content cannot overlap totals, footer or second-page terms; reject/paginate rather than silently shrink entire template.
5. Unique numbering under concurrency; issued PDF cannot change after an admin edits logo, bank details, terms or items; revisions preserve original.
6. Wrong-tenant access and unauthorized issue/download/update denied; no untrusted HTML injection.
7. Snapshot exact issued data and visual-renderer/template version for reproducing PDFs.
8. Require exact-main CI, code review by independent **thusico**, separate production deployment decision. **No deploy or public enablement from this documentation change.**

## Source fidelity limitations to resolve during coding

The uploaded PDF is a document reference, not a repository asset. Developers need the approved original logo artwork and the PDF binary in the authorized secure workflow to measure actual coordinates and generate test snapshots. The source's apparent contact email is truncated in the rendered preview and should be verified from company settings, not copied blindly. Preserve the exact source's full terms as private admin-managed reference data; do not publish customer legal text or banking details in test fixtures without approval.
