# Work page acceptance matrix (development only)

This checklist is not proof of production activation. Verify against exact current main in an independently reviewed isolated staging environment. Keep staff portal default-off until approved.

## P0: Employee task lifecycle
| Scenario | Expected result |
| --- | --- |
| Owner/manager assigns task to active employee | Tenant-scoped assignment visible only to that employee |
| Employee starts task | assigned -> in_progress; immutable audit event |
| Employee submits task | in_progress -> submitted; cannot self-complete |
| Manager returns submission with note | submitted -> in_progress; note visible to employee |
| Manager accepts submission | submitted -> completed; audit event and authorization verified |
| Employee from another tenant requests task | Denied; no task or note disclosure |
| Inactive employee uses existing session | Denied immediately |
| Duplicate/stale transition | Rejected without duplicate audit event |
| Staff portal feature flag off | Staff routes fail closed |
| Missing rate limiter, session secret or CSRF | Authentication/mutations fail closed |

## P0: Mobile usability
- 320px, 375px and 620px viewports: no clipped controls, overlap or horizontal scrolling.
- Buttons and review notes remain accessible with keyboard and screen reader.
- Failed saves and logout never display success.
- Staff and manager roles see only their authorized actions.

## P1: Dashboard and job costing
- Read-only board shows assigned, in progress, submitted, completed; no UI-only status mutations.
- Branch filters and overdue counts are derived from authorized tenant-scoped records.
- Job costing accepts integer thebe, shows Pula formatting and labels all previews as estimates.
- No invoice, payment, payroll, automatic dispatch or inventory write from the preview.

## Release gates
1. Exact-main SHA and migration inventory recorded.
2. Isolated staging D1, routes and bindings confirmed distinct from production.
3. Offline contract tests and authenticated browser lifecycle tests pass.
4. Security, retention, accessibility and mobile evidence reviewed.
5. Owner initiation and independent thusico approval remain separate.
6. Production release requires its own explicit authorization; this checklist grants none.
