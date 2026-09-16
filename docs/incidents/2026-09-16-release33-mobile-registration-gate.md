# Release 33 mobile direct-registration gate incident

## Status
Release 33 remains deployed with customer activation in HOLD. Desktop post-deploy smoke passed; mobile post-deploy smoke failed closed before production audit/lifecycle closure.

## Exact release authority
- Deployed merge SHA: `ff377861bcc2c37da818fe892d7bfba136fc4320`
- Release sequence: 33
- Failing workflow: Mobile post-deploy smoke
- Failure: timeout waiting for `registration-hold` on `/register-direct.html`

## Root cause
`public/register-direct.html` was structurally incomplete and omitted closing `</body></html>` tags. The production release-governance decorator injects `/js/oauth-availability.js` only into HTML containing `</body>`, so the direct-registration page skipped activation-policy UI binding. Server-side `/api/auth/register` remained fail-closed, but the page did not acquire the expected registration mode class or hide the direct registration form during HOLD.

## Remediation
- Make the direct-registration document structurally complete.
- Explicitly load the existing `/js/oauth-availability.js` activation-policy gate on the direct-registration page so safety does not depend on Worker injection.
- Add page-local fail-closed CSS that hides the registration form until the server-proven mode is `open` or `cohort`.
- Add exact-source regression assertions to `tests/v82-audit-remediation-static.mjs`.

## Release control
No failed smoke is waived or reclassified. Release 33 remains activation HOLD. The remediation must pass exact-head Audit remediation CI and current merge-ref Recovery CI, Mobile startup recovery, and Legacy orphan qualification before merge. A new release manifest and BF-07 seal are required after the application fix merges. Exact-SHA deploy, desktop/mobile post-deploy smoke, live provenance, signed synthetic lifecycle, and zero-orphan proof remain mandatory.
