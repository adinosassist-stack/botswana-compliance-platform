# Thebe Desk unified dock and mobile UX — acceptance matrix (#2157)

This is a verification specification, **not** evidence of passed tests. Run against an exact reviewed PR head and again against a staging deployment. Keep exports, POP ingestion, unqualified voice/transcript persistence, payment activation, and production writes disabled.

## Device and browser matrix

- Chromium desktop: 1024×768, 1280×800, 1440×900, 1920×1080.
- Mobile: 320×700, 360×800, 390×844, 768×1024 and 844×390 (landscape).
- Repeat essential keyboard, focus, navigation and attachment flows in Firefox and WebKit.
- At narrow widths, inspect both open/closed keyboard states where supported, safe-area insets, and 200% zoom.

## Acceptance scenarios

| ID | Surface | Action | Expected result |
| --- | --- | --- | --- |
| M01 | Market desktop | Load with dock closed and open | No false reserved rail; hero/cards remain reachable and no horizontal overflow |
| M02 | Market mobile | Open/close dock launcher and scroll | Launcher does not obscure CTA, cards or navigation; layout restores after closing |
| M03 | Market | Open and close dock by keyboard | Focus moves to dock and returns to triggering control on close |
| W01 | Workspace desktop | Navigate People, Finance, Property, Analytics | Charcoal dock maintains consistent geometry and does not overlap controls |
| W02 | Workspace desktop | Drag resize to min/max then reset | Size is bounded, usable and correctly restored on navigation/reload |
| W03 | Workspace/mobile | Rotate viewport and use soft keyboard | Composer/send remain reachable; no clipped overlay or horizontal scroll |
| D01 | Both docks | Type draft, navigate away/back, change tenant | Draft survives appropriate navigation without leaking across tenants |
| D02 | Both docks | Attach/remove file, try invalid and oversized file | Clear accessible feedback; invalid attachment never silently submitted |
| D03 | Both docks | Activate mic, then voice | Distinct controls; truthful status and accessible button labels |
| D04 | Voice failure | Deny mic access, simulate disconnect/timeout | Recoverable, accurate error; no permanent spinner or fake connected state |
| D05 | Dock | Rapidly open/close and switch contexts | One composer and one listener set, no duplicate submit or stale overlay |
| D06 | Dock | Submit with Enter, Shift+Enter and send button | Correct sending/newline semantics; no duplicate requests |
| P01 | Property | Open calculator and change inputs | Compact layout, no gradients, visible validation, no obscured controls |
| A01 | Accessibility | Keyboard-only navigation, Escape, reduced motion | Visible focus, expected close behavior, no motion dependency |
| A02 | Accessibility | Inspect roles, announcements, contrast and targets | Labels are descriptive, errors announced, text legible, touch targets usable |
| R01 | Runtime | Navigate repeatedly and reconnect after offline | No freeze, duplicate listeners or leaked pending state; failure surfaced |

## Evidence checklist

For each tested scenario record **exact commit SHA**, browser/version, viewport, page/route, operating system, test method, pass/fail, screenshot/video location, and sanitized console/network errors. Never include secrets, customer documents, transaction data or personal transcripts in artifacts.

Required sequence:
1. Inventory active CSS/JS injectors, existing #1861 behavior, #1898 completion plan and competing dock styles before changes.
2. Capture *before* screenshots and baseline errors.
3. Implement cohesive fixes on a single feature branch, with focused Playwright assertions and reusable accessibility checks.
4. Run `npm test`, `npm run check`, focused Playwright suite and protected required CI on exact head; document failures rather than claiming success.
5. Obtain independent review from `thusico`; do not merge around `main-production-governance`.
6. Validate deployed release SHA and authenticated staging smoke before calling the fixes delivered.

## Exclusions

This document authorizes no Cloudflare deployments, schema migrations, payment activation, POP uploads, advanced AI exports, customer-data reads, or production writes. Reviewer and release approvals remain independent.
