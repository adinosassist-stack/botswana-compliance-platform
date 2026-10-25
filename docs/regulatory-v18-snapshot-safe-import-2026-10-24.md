# Botswana foundation pack v1.8 — snapshot-safe import review

Date: 24 October 2026. Code review proposal only; no production import or approval.

## Why this change is necessary

Prior importer behavior reused a previously imported `regulatory_sources` row by registry ID or source URL and replaced the registry seed hash even if the actual `title`, `publication_date`, `notes` or source URL still contained superseded values. This could falsely imply the v1.8 2026 VAT/e-GP metadata correction had reached the governed source record.

## Read-only preflight

An authorised platform editor/reviewer/admin can inspect:

`GET /api/platform/regulatory/foundation-pack?preflight=1`

The response only reads regulatory source metadata, snapshot/review counts and seed-registry associations. It groups each source into:

- `create`: no prior record detected
- `reuse`: persisted metadata matches proposed seed
- `refresh_unreviewed`: source is pending/unverified, has no snapshots, no review, no recorded evidence hashes, and still needs a metadata change
- `source_metadata_drift_requires_review`: protected evidence exists or the source URL differs; human review required

A single protected drift causes the import route to **return 409 before creating/updating pack data**. This is deliberate: a new seed definition hash is not evidence that a reviewed snapshot has been refreshed.

## Governed, guarded import

The existing `POST /api/platform/regulatory/foundation-pack/import` remains editor/admin only. For a `refresh_unreviewed` item, it issues one conditional compare-and-swap `UPDATE` that verifies:

1. The source is still pending/unverified and has `latest_snapshot_version=0`.
2. Neither snapshots nor source reviews exist, including concurrently added records.
3. No content hash, metadata hash, approving identity or approval timestamp was set.
4. Every original metadata column still equals the read-only preflight's version.

If the `UPDATE` affects anything other than one row, the importer returns `source_metadata_changed_during_import` and does not advance that source's registry hash. Successful corrections are separately recorded in `platform_regulatory_audit` with the changed field names. The importer does not edit snapshot content or approval status.

**Important:** D1 importer operations outside this guarded source metadata update are not currently wrapped in a single all-or-nothing transaction. A late race could leave previously completed safe metadata corrections while preventing later imports. The audit record and read-only preflight expose that state for inspection. No automatic retry should bypass this guard.

## VAT historical records

The existing server-side 25-day guard in PR #1787 rejects old VAT-rule approval/publication for current periods. The v1.8 seed's new 28-day rule remains a **draft** until legitimate independent approval. Legacy v1.7 entries must be explicitly reviewed/blocked or superseded through governed rule transitions. This change intentionally does not rewrite legacy evidence or directly mutate any old rule status.

## Tests

- `npm run test:regulatory-source-migration` uses an isolated in-memory SQLite D1-compatible fixture for source metadata preflight, zero-snapshot correction, approval/review/snapshot rejection, compare-and-swap race conditions, repeat import inspection, and URL changes
- `npm run test:release-regressions` includes that test after the existing v180→v181 regulatory audit ordering
- Repository CI must pass before independent code approval
- The narrow SQLite fixture does **not** replace an exact complete D1 schema migration rehearsal or human legal/source review

**Go/no-go:** no live v1.8 foundation import, no approval, and no unrestricted regulatory activation from this PR. Before live import, inspect real preflight data and complete a staging D1 v1.7→v1.8 rehearsal plus independent reviewer acceptance.

Related: #1788, #1392, #1427 and #1786.
