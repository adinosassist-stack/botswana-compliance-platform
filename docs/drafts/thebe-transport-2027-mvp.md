# Thebe Transport — 2027 five-operator pilot (DRAFT)

**Status: planning/prototype only, NOT merged, NOT deployed or enabled.**
Owner direction: prepare the draft in 2026; consider deployment **in 2027** after a separate owner launch decision and independent \`thusico\` review. No 2026 deployment, live URL, production database migration, payment activation, customer onboarding or route changes are authorized.

## 1. Decision and market assumptions

Thebe Transport is a **module/workspace inside Thebe Desk**, not a separate app, fleet company, passenger booking marketplace or operator of vehicles. Botswana market. Launch objective: **5 paying transport companies**, which may include bus, combi, school or employee-shuttle operators, but the pilot should start with adult passenger/intercity or employee-fleet operators so child data is **out of scope**.

- Proposed pilot list price: **P499/company/month** (not a quoted market rate); 5 companies = **P2,495 monthly recurring revenue** and **P29,940 annualised recurring revenue** if all five retain service for 12 months.
- Pilot acquisition targets: 10 discovery interviews; at least 3 evidence-backed written pilot commitments before implementation; 5 paying/renewing companies is the commercial success target, **not** a prerequisite to shipping a trial.
- No per-seat/ticket processing charge at pilot; charge a separately disclosed setup fee only after customer validation.
- Variable-cost scenario: P100/company/month; fixed incremental cost scenario: P1,000/month -> **P995 monthly contribution** for 5 payers, before build amortisation, travel, tax, compliance and any extra support. **This is an assumption, not a forecast.**
- A subscription-only product for 5 operators is small. Do not fund substantial hardware, custom maps, mass-SMS, a separate AI model, a GPS service, a payment gateway or custom passenger app before demand is proven.
- Prioritise operators with 2–10 buses, but avoid hardcoding a fleet size limit until discovery validates pricing.

## 2. Pilot outcomes and acceptance

Each operator can independently answer:
1. Which bus / conductor / shift was assigned to each trip?
2. What was **declared** in fares and what cash was **physically submitted**?
3. Which exceptions remain unresolved, by whom and since when?
4. What diesel, trip expense and maintenance costs were recorded for each vehicle and route?
5. Which routes had positive **recorded contribution**, with a clearly disclosed exclusion list?

Pilot KPIs: daily shift report completion rate, time to reconcile cash, number/value/age of unresolved exceptions, number of days of missing cost records, weekly active owner/manager usage and paid renewal. Never advertise "verified revenue" or "profit" when entries are only self-reported. Show **Recorded contribution / unverified** when settlements, actual costs or reconciliations have not been checked.

## 3. Phase-one MVP (smallest usable module)

### Owner dashboard
- Five KPIs: active vehicles, scheduled trips, *recorded* fare total, cash variance awaiting review, pending services; show stale/unavailable explicitly.
- Daily and weekly route/vehicle/driver breakdowns with branch/location.
- Only show business-specific, tenant-scoped data after session authorisation.

### Trips and dispatch
- One dispatch record per operator/vehicle/date/departure, driver, optional conductor, route label, shift and status draft/assigned/departed/completed/cancelled.
- Routes are **company-defined labels**, no authoritative public timetable, geolocation or availability assertions.
- Capture simple passenger count and fare collections; *no passenger names, IDs or phone numbers* in MVP.

### Cash and fares
- Conductor's declared fare count, amount, incident/missing ticket note; manager's independently entered physical cash received.
- Always calculate variance = **cash received – declared fares**, not proof of theft. Explain variance and require independent manager review.
- Immutable cash submission after reconciliation; correct mistakes through append-only adjustment records and audit events, never overwrite a closed shift.
- Not a payment processor. No bank account credentials, card capture, mobile-money initiation or customer funds held by Thebe.

### Fleet and costs
- Reuse Corporate Assets' **fleet** category, service/renewal history and owner/manager permissions if that module is independently qualified and active in the future.
- Where Corporate Assets is not enabled, display "Fleet integration unavailable" rather than silently claiming live vehicles.
- Record fuel purchase litres/amount, odometer optional, repairs and trip expenses by vehicle/route; validation in BWP minor units.
- Distinguish cost **recorded** vs cost **missing**, and never convert a missing fuel cost into zero.

### People
- Reference existing employee records by tenant-owned employee ID, never duplicate payroll or make employee account changes.
- Start with attendance/shift association and licence/permit renewal reminders **in-app only**.
- No autonomous staff penalties, deductions, employment compliance decisions, GPS tracking or notification fan-out.

## 4. Out of scope until separate approvals

Passenger web/mobile booking, online ticket sales, card/mobile money, third-party transport networks, live GPS/geofencing/hardware, route optimisation, public timetable feeds, live seat inventory, schoolchild profiles, school pickups, parent notifications, bulk messaging, AI performing changes, SMS charges, insurer partnerships and payroll deductions.

Read-only AI *summaries* may be considered later only with bounded data access, attribution, privacy controls and a separate cost budget. The first pilot must work without AI.

## 5. Roles & authorisation

- Owner: all tenant records and configuration, shift variance approval, corrections and exports.
- Transport manager: dispatch, assignment, cash review and service scheduling within the tenant's authorised locations.
- Conductor: create/edit own open shift declarations only; cannot record "manager cash received", approve a variance or modify another person's shift.
- Driver: read own assigned shifts and file a basic trip incident; cannot approve finance.
- Accountant: read and export reconciled entries, not approve their own cash submission.

Never trust tenant_id, actor_id, role or branch permissions supplied by request JSON/query parameters. Tenant scope must come from authenticated server context, including foreign-key integrity checks. Object-level permissions and CSRF checks required for every mutation. A user who is both conductor and approver for the same shift is prohibited. Revoked or changed permission must be rechecked at commit.

## 6. Proposed data records (design, no migration)

Core logical entities: transport_vehicles (reference Corporate Assets or explicit quarantined stub), transport_routes, transport_shifts, transport_fare_declarations, transport_cash_handover, transport_cost_entries, transport_shift_adjustments, transport_audit_events.

Required fields: id, tenant scope, creator/updater audit actor, amount_minor integer for all money, monotonically increasing revision, UTC created/updated timestamps, business-local service date (Botswana), and optional location scope. Use idempotency keys and database transactions for shift submission, cash handover and audit seal. Do not cross-tenant reference vehicles, routes, staff or costs.

Candidate status transitions:
- Shift draft → assigned → departed → completed → reconciled.
- Cancel allowed only with an auditable reason; closed/reconciled shifts cannot revert to editable.
- Cash handover submitted → manager-reviewed → discrepancy-resolved, with append-only adjustment documentation.

Reconciliation formula:
- declared_fares_minor = SUM(valid fare declarations) or explicit conductor total, with *source type labelled*.
- cash_variance_minor = physically_received_minor - declared_fares_minor.
- route_recorded_contribution_minor = recorded_fares_minor - SUM(recorded diesel/crew/repairs/fees explicitly allocated to route).
- Route contribution is **not accounting profit**, and incomplete costs result in "incomplete data" state.

## 7. Technical boundaries in current Thebe source

Existing implementation to **reuse after separate qualification**, not override:
- Corporate Assets public/js/corporate-assets.js offers fleet categories, service records and maintenance; production flag currently **off** and staging staging-write prerequisites remain independent.
- Money/Finance source uses provider-neutral reconciliation and evidence integrity; do not imply bank statement verification.
- Employee reporting and location management have existing governance; this draft does not change their routes, permissions or deployment.
- Shared charcoal AI dock, white/blue/charcoal palette, mobile-first compact cards, **no gradients**, no overlapping buttons, no false "live" labels.

No production code, feature flag, Worker, route, database, secrets, migrations, payment action or public preview is touched by this draft.

## 8. Pilot security, legal and audit acceptance before 2027 deployment

- Complete privacy / Botswana legal review of driver and conductor data collection, retention, export and access.
- Tenant separation tests (including cross-tenant IDs, stale sessions and multi-branch access) and CSRF/role revocation tests.
- Offline/weak-network plan: pilot may be online-only initially; if offline is later added, include deduplication, server-issued conflict resolution and authenticated replay controls.
- Test financial audit immutability, duplicate cash submissions, idempotent corrections, race conditions, negative amounts, numeric overflow, stale totals and owner-versus-conductor approval separation.
- Recovery evidence: test backup, restore and failed D1 write reconciliation in an isolated synthetic environment before enabling real records.
- No child transport profile until child safety/privacy review, consent design and dedicated verification.
- Independent reviewer \`thusico\` reviews exact source SHA and all protected CI; require a future explicit owner-authorised 2027 deployment, **then** separate activation and first-live-customer acceptance.

## 9. Delivery stages

**Draft now (2026)**: requirements, static synthetic UI prototype, mock data contracts and discovery interview script; no deployment.

**Early 2027 discovery**: interview >=10 operators, identify 3 willing paid pilot clients, measure feasibility of using existing finance/assets/employee endpoints. Adjust price from evidence.

**2027 build behind default-OFF flag**: tests, tenant-scoped backend, audits, safe cash workflows, accessible mobile UX. Build only once pilot interest warrants it.

**2027 isolated synthetic staging**: independent qualification; approval of any D1 migration, credentials, backups, error/recovery and offline risks.

**2027 private pilot / public activation (date TBD)**: separately authorised owner launch, independent \`thusico\` approval and verified deployment/rollback; stop on unsafe reconciliation or privacy failures.

## 10. Kill criteria

Do not move to development if fewer than 3 qualified operators commit, if operators cannot explain operational value, or if projected incremental operating cost exceeds verified revenue at 5 accounts. Reassess if integration demands production Assets activation or a new payment-provider integration just to run the pilot.

**Decision:** approve *draft preparation only*. No production, staging, public previews or customer activation in 2026.
