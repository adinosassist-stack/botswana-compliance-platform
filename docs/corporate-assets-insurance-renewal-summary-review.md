# Corporate Assets insurance renewal summary — review-only

Adds a bounded, read-only insurance classification summary to the existing server-side insurance reader. The response preserves `policies` and adds `summary: {shown, expired, due, current}`. Counts describe **only the returned page of up to 100 rows**, not the company's complete portfolio. An optional server-configured `warningDays` integer (0–365; default 30) changes the classification horizon without changing the tenant-scoped SQL or performing writes.

Invalid dates, invalid warning windows, and unauthenticated contexts are rejected before querying. The existing HTTP adapter still supplies the server-derived Gaborone-local `asOfDate`; this batch adds no client input parsing, endpoint, UI switch, migration, notification delivery, deployment, production write, or activation.

Qualification: `node --test tests/corporate-assets-insurance-summary.test.mjs tests/corporate-assets-insurance-reader.test.mjs`, repository-required CI, independent `thusico` review. Later full-portfolio totals require a separately reviewed aggregate SQL query, not an inference from page data. Release and backup/restore gates remain unchanged.
