# Corporate Assets owner attention — review-only UI batch

## Scope
Extend the existing default-off native Corporate Assets Workspace panel instead of creating another Owner Dashboard shell. It continues to show total assets, book value (BWP), maintenance due and insurance due, and now displays an at-a-glance attention cue using the **existing trusted server summary counts**. Counts are due *records*, not deduplicated assets. The host can provide an optional `onOpenInsurance` callback; the component never creates a route or invokes an API write.

## Safety and release boundary
- Component still requires `enabled===true`, `authenticated===true` and `tenantAuthorized===true` from the host.
- Missing/malformed data clears both the metrics and attention state (no fabricated zero values).
- Existing refresh, role status and all injected navigation actions remain unchanged. No auto-navigation.
- Scoped flat CSS; responsive four-to-two-column grid; no gradients, overlays, duplicated shell or AI dock.
- No production feature flag, new endpoint, data migration, R2/D1 write, customer activation or deployment.

## Qualification
Run `node --test tests/corporate-assets-native-panel.test.mjs tests/corporate-assets-owner-attention-panel.test.mjs`, the Corporate Assets CI suite and required branch checks. Obtain independent review by `thusico`. Deployment remains separately blocked by the core-first launch recovery/authorization gates.
