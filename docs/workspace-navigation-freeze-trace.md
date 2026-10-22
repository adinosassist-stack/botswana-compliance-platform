# Workspace freeze: authenticated browser trace procedure

Tracking: #1701. Production release 564 passed smoke tests, but owner still observes a freeze on every workspace page.

## Capture (Chrome, authenticated user)
1. Open https://thebedesk.com, sign in normally, and open Chrome DevTools > Performance.
2. Enable screenshots and Web Vitals. Start recording; navigate dashboard -> People -> Work -> dashboard, waiting for each page to become responsive. Stop recording.
3. Repeat with DevTools Network > Disable cache and Preserve log for cold navigation. Repeat once with cache enabled for warm navigation.
4. In the trace, identify main-thread tasks exceeding 50ms; record their function names, self-time, scripting/style/layout breakdown, and click-to-next-paint duration. Record network requests for lazy fragments, duplicate fetches, and hydration timing.
5. Compare desktop and mobile throttling; capture console errors and the active user role. Redact tokens, user information and company data before sharing any trace.
6. Test whether the long task occurs before or after the destination view first paints. Distinguish placeholder waiting on network from JS event-loop blocking.

## Suspected code paths to confirm or eliminate
- `showView` synchronously removes `active` from every `.view` and updates navigation controls.
- `scheduleWorkspaceNavigationRender` defers `renderAll` by animation frame and timer; deferred work may still block interaction.
- `renderAll` computes `applicable()` and `scoreData()` for every navigation, even when dashboard is hidden.
- `applyRoleUi()` executes on each `renderAll`.
- Lazy hydration inserts markup before `showView`; large fragments can cause parse/layout work.
- `renderCompanies()` already skips unchanged selectors; measure before changing.
- PR #1688 deduplicates speculative prefetch, but is not proof of a fix.

## Exit criteria
- Capture at least three cold and three warm authenticated navigations for representative pages, with before/after traces.
- Fix the dominant measured long task rather than removing security/role enforcement.
- Add a reproducible automated browser responsiveness assertion (not only DOM presence), with representative data.
- Obtain independent review and required CI; follow BF-07 release governance.
- Verify the deployed site interactively with the reporting user; keep #1701 open until verified.
