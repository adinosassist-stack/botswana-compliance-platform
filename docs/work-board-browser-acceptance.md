# Work board authenticated browser acceptance

**Scope:** Draft PR #2410, employee manager Work board. No production deployment or feature-flag activation.

## Test setup
- Use isolated staging with `THEBE_STAFF_PORTAL_ENABLED` explicitly approved for that environment.
- Use two test tenants (A and B), owner/manager and staff identities, and synthetic task records.
- Keep all credentials, invite links and CSRF tokens out of screenshots and CI logs.

## Required checks
- [ ] Owner/manager in tenant A sees assigned, in-progress, submitted and completed tasks with accurate counts
- [ ] Tenant B task titles and metadata never appear in tenant A, including after workspace navigation and refresh
- [ ] Staff login cannot access the manager API or manager review controls
- [ ] Unauthenticated, expired and revoked sessions fail closed; no cached task data remains visible
- [ ] Manager task approval still requires the existing authenticated POST review action; Work board itself has no write controls
- [ ] Returned task is shown as in-progress after manager return, not completed
- [ ] Missing tenant identifier, malformed dates, duplicate IDs and invalid status produce the safe unavailable state
- [ ] Overdue indicator uses the Africa/Gaborone calendar date near midnight
- [ ] Layout usable at 320, 375, 620 and 1024 CSS px; no horizontal overflow, overlapping controls or unreadable text
- [ ] Keyboard navigation, headings, status announcements and zoom to 200% checked
- [ ] Staff portal disabled flag keeps manager UI unavailable
- [ ] Refresh after assignment or review updates counts without stale cards

## Evidence
Record browser/build SHA, environment, tester, UTC time, screenshot or redacted video reference, outcome and issue for every check. Do not treat source inspection or offline CI as a substitute for browser acceptance.

## Release decision
The board may proceed only after CI, authenticated browser acceptance, independent `thusico` approval and the existing exact-main protected release gates. The reviewer must not approve their own changes. No automatic merge or deployment.
