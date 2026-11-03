# Consolidated launch readiness — POP schema truthfulness

This batch corrects a misleading implication of the production `/api/ready` response without activating a payment feature or changing the existing core readiness gates.

**Observed production mismatch:** release 589 advertised `latestSchemaDelta=071_payment_pop_runtime_compat.sql` even though the production D1 lacked both POP 070/071 tables. In the prior code, that field was a hard-coded intended release tip, not database migration evidence.

## Readiness response after the change

- `schemaReady`, `coreSchemaReady`, `agenticAuthoritySchemaReady` retain their existing meaning and HTTP behavior. A missing optional POP schema must not knock healthy existing core operations offline.
- `latestSchemaDelta` remains for backwards compatibility, with `latestSchemaDeltaMeaning:"declared_release_tip"` to prevent operators interpreting it as proof of actual execution.
- `popSchemaReady` is **true only when fixed, read-only D1 catalog queries** find both POP tables, three required indexes and all expected 070+071 document/request columns.
- `popSchemaStatus` is one of `present`, `missing`, `incomplete`, `unavailable`; no SQL, provider failure detail, tenant contents, or credentials are included.
- No production migration tracker was found in the prior read-only D1 inspection. Table/column presence alone is not independent migration provenance: even `popSchemaReady:true` **does not** permit uploads, scans, subscriptions or production writes.

## Release gates

This is a source/test/documentation proposal; no D1 write, object upload, Worker deploy, feature activation, payment/POP settlement or branch-governance change. Review independently with `thusico`, qualify exact-head CI, and include in ONE consolidated production release scope when recovery provenance, signed-in payment acceptance, BF-07, rollback and separate owner production-write authorization are satisfied.

Do not replay POP 070/071 on already-populated staging. The production D1 still requires independently authorized schema migration if POP ingestion becomes part of a future release. Customer-supplied references and uploads never verify payment receipt; funds must be seen in the company's bank account.
