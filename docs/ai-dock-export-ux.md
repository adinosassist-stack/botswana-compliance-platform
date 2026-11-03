# AI Dock export UX

Status: proposed, not deployed. Keep document export disabled until server authorization and tests pass.

Place a compact Export action below eligible assistant messages. Opening it shows PDF, Word and PowerPoint choices. Do not add preset questions or a persistent export toolbar.

States: preparing with cancel; ready with download; failed with retry; expired with regenerate; unauthorized with no download. Prevent duplicate requests. Keep the composer usable while rendering.

On mobile, use touch targets at least 44px and avoid keyboard overlap. On desktop, Escape closes the menu and restores focus. Announce status changes accessibly and honor reduced motion.

Use the authenticated message identity for exports, never a client-provided tenant identity. Download only through authorized same-origin endpoints. Do not show public storage links.

Validate keyboard, screen reader, mobile, slow network, expiration, duplicate clicks and tenant isolation before activation.

## Implementation acceptance matrix (launch batch)

| Case | Expected behavior |
| --- | --- |
| Export disabled | No active export request or download endpoint exposed by UI |
| Unauthorized or cross-tenant message | Denied before generation and again before download |
| Duplicate export click | One admitted job; no duplicate rendering |
| Quota exhausted or database unavailable | Fail closed with actionable status; composer stays usable |
| Expired or revoked artifact | No download; offer regenerate only after fresh authorization |
| PDF/DOCX/PPTX malformed payload | Reject before private storage; never return public bucket URLs |
| Mobile keyboard and screen reader | No composer overlap; announced status and reachable 44px targets |
| Renderer supply chain | Independently approve exact locked packages and provenance before activation |

These are required tests, not claims that the export service is live. Track implementation against #1866, #1867, #1870, #1873 and gate #1868.
