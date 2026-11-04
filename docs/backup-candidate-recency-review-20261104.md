# Private R2 backup candidate recency — observational qualification

This adds a strictly **GET-only, opt-in** Cloudflare metadata observation helper and offline adversarial tests. The helper reads the exact private R2 bucket-lock policy and a bounded listing under `candidates/`, rejects drift and truncated or malformed responses, and reports listed SQL-candidate newest age and observed inter-candidate gaps.

A 120-minute age measurement is **only an alert indicator**, not evidence that an export finished, produced independently checked SQL bytes, met a recovery point, had a qualified receipt, or was restorable. Every result withholds `sustainedRpoQualified`, `restoreAuthorized` and `productionWriteAuthorized`, even when fresh. Object `last_modified` metadata is not the source D1 export bookmark/time. An RPO qualification requires sustained point receipts, independently qualified source bookmarks/checksums, actual isolated restore acceptance and monitoring.

No schedule, cloud credential-bound job, production backup export, R2 write, object delete, D1 import, customer read or release grant is introduced by this PR. The existing production candidate preparation is manual-only; enabling a recurring private backup mechanism requires separate design, independent review and operational authority, not silent scheduling of a write-capable token.
