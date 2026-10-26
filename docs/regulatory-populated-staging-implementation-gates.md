# Populated regulatory staging rehearsal — implementation acceptance plan

**Status: specification only. No staging write, remote import, approval, or activation is authorized by this document.**

Tracks #1788 and #1793. Complements [the authorization contract](regulatory-remote-populated-rehearsal-authorization.md); it does not replace it.

## Release gates and evidence

| Gate | Required evidence | Fail-closed decision |
| --- | --- | --- |
| G0 Legal separation | Regulatory source review remains pending; no live rule publication coupled to rehearsal | Refuse any production or publication step |
| G1 Immutable revision | Fresh 40-hex exact `main` SHA equals dispatch SHA and checked-out HEAD, rechecked immediately before write | Refuse stale revision |
| G2 Target segregation | Exact named staging database UUID and Cloudflare account, nonmatching production UUID, least-privilege short-lived dedicated credentials | Refuse absent/mismatched target |
| G3 Independent permission | Protected `regulatory-staging` reviewer approval of **separate** default-off staging-write workflow, bounded fixture manifest, operator, rollback decision and no concurrent writer | Refuse missing/ambiguous authorization |
| G4 Baseline | Independently obtained fresh read-only attestation and full expected-state match; unknown existing records are blockers | Do not alter unexpected data |
| G5 Fixture provenance | Deterministic locally tested synthetic tenant/obligation/source manifest with exact IDs, counts, cryptographic digest and zero real tenant records | Refuse fixture drift |
| G6 Controlled upgrade | Reviewed fixture-only staging writer and real guarded v1.7→v1.8 importer; source snapshots/approvals immutable and pending-only metadata corrections conditional | Stop on drift before mutation |
| G7 Historical preservation | Compare full identity, tenant, schedule, due date, status, approvals and hashes before/after; old 25-day VAT and new 28-day draft remain explicitly distinguished | Refuse altered histories or automatic publication |
| G8 Retry / forensic proof | One bounded retry, idempotent zero-diff evidence, foreign-key integrity and sanitized before/after/retry artifacts | Fail without promotion |
| G9 Review closure | Independent checker signs off redacted evidence and rollback/stop results separately; production remains its own go/no-go | No implicit production clearance |

## Proposed architecture (NOT IMPLEMENTED)

1. Retain existing `regulatory-populated-rehearsal-readiness.yml` as offline tests only; never introduce Cloudflare tokens, writes or dispatches to it.
2. Implement fixture-builder and bounded writer in a **new independently reviewed PR** with a new separate protected environment workflow, initially default-off. A code path for database mutations must not be usable through the existing read-only attestor.
3. Use an explicit new typed confirmation unique to the staging-write rehearsal, and verify protected environment review *and* exact current revision at execution time.
4. Keep the before/after attestation reader independent of the writer; require two fictional tenants with distinct schedules, historical VAT obligations and protected snapshot/reviewer variants.
5. Generate machine-readable, redacted evidence for independent reviewer decisions without secrets, tenant PII or raw query results.

## Mandatory negative tests

- Stale SHA; wrong account/UUID; production UUID collision; missing short-lived credentials; concurrent writer; unexpected baseline records.
- Fixture changed after approval; duplicate IDs; extra tenants; real-person data; incomplete source snapshot manifests.
- Snapshot or maker/checker metadata drift; approved or published VAT legacy rule; altered historical due date/status/schedule.
- False-positive identical before/after/retry evidence; non-idempotent retry; failed foreign keys; missing evidence artifact; approval bypass.
- Any new code path in the existing readiness/read-only workflows that accesses remote staging write APIs.

## Current evidence and limitations (26 October 2026)

- Synthetic offline readiness passed: run #40299950770.
- Staging read-only attestations passed: runs #40303682174 and #40303857530.
- Read-only artifacts indicate 24 proposed source records, zero source drift and no active legacy 25-day VAT rules; this is **not** a populated v1.7 staging upgrade qualification.
- Final authenticated legal instruments, source snapshots and maker/checker approval remain outstanding under #1788.
- No authorized populated staging write rehearsal has been executed.

**Acceptance rule:** Merge of this specification is never permission to dispatch a staging-write workflow. A distinct review and explicit operator authorization are required before any remote mutation.
