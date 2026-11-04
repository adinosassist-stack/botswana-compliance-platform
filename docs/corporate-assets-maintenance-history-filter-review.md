# Corporate Assets maintenance history date filtering

Status: review-only, not deployed or activated.

The existing tenant-scoped `listMaintenance` reader now accepts optional `fromDate` and `toDate` (inclusive ISO `YYYY-MM-DD`) and preserves the existing no-filter query shape. A strict calendar-date validator rejects invalid dates and reversed ranges. Values are bound query parameters, and the company ID remains server-derived `m.company_id=$1`.

There is no new endpoint, no client-controlled company selection, no changes to table permissions, no migration, and no production write. UI/API exposure needs a separate independently reviewed integration, RLS proof, staging qualification and tenant isolation tests. Existing production release and recovery HOLD remain unchanged.

Run `node --test tests/corporate-assets-maintenance-history-filters.test.mjs tests/corporate-assets-list-readers.test.mjs` and required repository CI. Obtain independent thusico review before any protected merge.
