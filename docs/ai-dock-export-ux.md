# AI Dock export UX

Status: proposed, not deployed. Keep document export disabled until server authorization and tests pass.

Place a compact Export action below eligible assistant messages. Opening it shows PDF, Word and PowerPoint choices. Do not add preset questions or a persistent export toolbar.

States: preparing with cancel; ready with download; failed with retry; expired with regenerate; unauthorized with no download. Prevent duplicate requests. Keep the composer usable while rendering.

On mobile, use touch targets at least 44px and avoid keyboard overlap. On desktop, Escape closes the menu and restores focus. Announce status changes accessibly and honor reduced motion.

Use the authenticated message identity for exports, never a client-provided tenant identity. Download only through authorized same-origin endpoints. Do not show public storage links.

Validate keyboard, screen reader, mobile, slow network, expiration, duplicate clicks and tenant isolation before activation.
