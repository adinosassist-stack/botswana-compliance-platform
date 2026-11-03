# People Locations & Branches — stale navigation focus guard

This is a narrow additive People UX fix. The existing Locations shortcut may schedule a focus after the form is revealed. A pending focus callback now checks the request epoch, currently visible People view, still-open reporting setup and connected input before focusing.

It prevents a delayed focus callback from stealing focus after the user switches pages, opens another location shortcut, closes the form or rerenders the form. Existing save error/plan-limit guidance, draft preservation, duplicate POST prevention and responsive layout remain unchanged.

**Qualification:** `node --test tests/people-locations-stale-focus.test.mjs tests/people-location-save-feedback.test.mjs`, People UX CI and all required checks. Independent `thusico` review required. No DB write, user data changes, new API, payment activation, feature flag changes or deployment.
