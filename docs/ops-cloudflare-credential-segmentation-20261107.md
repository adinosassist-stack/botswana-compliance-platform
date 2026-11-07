# Thebe Desk — Cloudflare recovery credential segmentation review (7 Nov 2026)

**Status: HIGH-PRIORITY ACCESS REVIEW / NO CREDENTIAL MUTATION / NO RESTORE AUTHORITY.**

## Direct live Cloudflare readback

- Account: `ddd23cab31928a4bb3d4998df9b26d1d`; protected main inspected `4bea712702a70d8d1c86e6107aea5e3e2c9ee2b5`.
- Account-members endpoint returned **1 accepted Super Administrator** (does not encompass all API principals).
- Account-token list returned **5 active account-scoped tokens**, total count 5. No token values were read.
- `Thebe Desk GitHub Production Deploy v2` is active; an **account-scoped allow** policy includes `D1 Write`, `Workers R2 Storage Write`, `Workers Scripts Write`, `Workers KV Storage Write`, `Workers AI Write`, `Workers Containers Write`, `Workers CI Write`, and other permissions. This is a material broad-privilege finding. The original `Thebe Desk GitHub Production Deploy` token also has write permissions in a **zone-scoped** policy; do not conflate its zone scope with the v2 account-wide policy.
- `/user/tokens` returned HTTP 403; personal API tokens were **not** enumerated. R2 S3/API access keys, operator laptops, GitHub secret-value equivalence, historical versions and alternate identities were **not** proven.
- Currently listed Worker settings for five scripts lack any D1 binding to isolated target `be15acba-ba16-4704-9498-e296a164b3a2`. Three most recent production Worker versions (of 583) and three most recent General AI staging versions were sampled; these also had no such binding. Sampling **does not** establish all historical-version or alternative access isolation.
- R2 backup candidate `candidates/42293276778/1/production-d1.sql` still matches independent byte-qualified SHA-256 `4e1674e65b7cae766ba07f1c009550b0aee60bca6fc08121ce91928d55f04a1a` by protected verifier run 42375623870. The candidate 30-day policy is enabled, but actual object-level delete-protection enforcement is **not independently accepted**.

## Source-authorized production deployment dependency

`.github/workflows/deploy-production.yml` uses `secrets.CLOUDFLARE_API_TOKEN` inside a protected deploy job. Its preflight GET probes verify account, Workers service and scripts, production D1, evidence R2 bucket, Workers AI search and custom-domain visibility; the release step executes pinned Wrangler `deploy --secrets-file`, which requires deployment capability. The workflow is not proof that the GitHub secret value corresponds to either named Cloudflare token: **do not assert a token-to-secret mapping without authenticated metadata or a controlled qualification**. Do not remove a permission simply because it is not used by the preflight GET endpoints; establish the actual deploy permission set with a dedicated *staging/test-only* dry-run first.

## Controlled remediation plan (separate owner-approved operations)

1. Inventory Cloudflare account and user principals, active account tokens, S3/R2 keys, GitHub environment/repository secret *names*, Cloudflare Worker settings/routes, all currently deployable and historical Worker versions, and unknown external integrations. Gather metadata only; never paste secret values to issues or source.
2. Separate **production Workers deployment**, **read-only backup integrity**, **backup candidate creation/export**, and **isolated D1 restore** credentials. Each role should have only permissions that its actual API operations demonstrably require. Determine whether Cloudflare token scope supports per-resource restrictions for the exact service and data operations; do not promise unsupported D1/R2 resource-level restriction.
3. Prepare dedicated replacement credentials with explicit expiry, clear operator custody and required independent approval. Store only through designated protected GitHub secret stores. Do not duplicate production deploy credentials into recovery environment. Ensure token create-time metadata and approval records are maintained privately.
4. Test a new production-deploy credential in a **separate non-production Worker/D1/R2 environment**, using the exact reviewed deploy operations where safely reproducible. Test read-only and failure cases. Keep live production deployment and backup functioning.
5. Perform a reviewed, reversible **cutover with dual controls** for GitHub secret routing. Verify protected release and backup paths, audit metadata, and rollback controls. Revoke old broad tokens only after verified replacement, monitoring, and independent sign-off. Token rotation has not been authorized by this PR.
6. Recheck isolated restore target emptiness, all relevant current/historical identity paths and exclusive-writer assurance. Independently accept retention and access. Then obtain separate owner and `thusico` authenticated exact-main `THEBE_VERSIONED_RESTORE_APPROVAL` issue #1950 records. PR approval alone **does not** authorize a restore.

## Offline risk assessor scope

`scripts/assess-cloudflare-credential-segmentation-offline.mjs` takes *sanitized* token names, `active/disabled/expired` status, allow/deny permission names and resource keys, current SHA, and inventory-completeness booleans. It does **not** call Cloudflare or GitHub, inspect secrets, or authenticate provided records. It identifies dangerous **account-wide** capabilities only; a passing reduced-token example **never** establishes least privilege or exclusive restore access, and the tool always returns `restoreAuthorized=false`, `retentionAndAccessAccepted=false`, and `credentialRotationAuthorized=false`. The pull-request-only CI uses fully synthetic fixtures.

No R2/D1 mutation, token creation/revocation, production deployment, SQL import, secret access, payment enablement, POP migration, or AI activation occurs in this review change. Track #1950 and #2187.

## Authenticated local Chrome continuation — 7 November 2026

Dashboard sign-in succeeded by reusing the owner's existing local Chrome session.
This supersedes the earlier statement that user-token metadata could not be
inspected through any authorized view. Connector user-token enumeration was not
retried. The dashboard lists 12 user tokens; the following policy summaries were
inspected without viewing any secret values. This is a partial principal-policy
review, not a complete inventory of R2 S3 keys, historical Workers or external uses.

| Principal / token name | Observed allow policy | Expiry / IP restriction | Review consequence |
| --- | --- | --- | --- |
| User / Thebe Desk GitHub User Deploy | Entire target account: Workers Scripts, D1, R2 Storage and Workers AI Edit; thebedesk.com: Workers Routes Edit | No expiry; all IPs | Candidate deploy principal only; GitHub secret equivalence remains unproven. Account-wide data writes require segmentation review. |
| User / Thebe Desk GitHub Production Deploy | All accounts: Workers Scripts Edit | No expiry; all IPs | Distinct from the same-named account token. Cross-account deployment exposure; do not revoke without custody/use review. |
| User / PRIVATE_BACKUP_CLOUDFLARE_TOKEN | All accounts: D1 Read + Edit, R2 Storage Edit, Workers Scripts Read | No expiry; all IPs | Neither its name nor this policy proves a read-only backup or isolated restore credential. |
| User / Thebe POP Staging Schema Initialization | All accounts: D1 Edit | No expiry; all IPs | Staging label does not isolate database writes. |
| User / Thebe Operations Preflight Read Only 2026-10-31 | Entire target account: D1, R2 Storage and Workers Scripts Read | No expiry; all IPs | Read permissions observed; mapping to protected environment still requires attestation. |
| User / Thebe General AI Private Staging | Entire target account: Workers Scripts Edit | No expiry; all IPs | Staging label does not limit deployment to one Worker. |
| Account / Thebe Desk GitHub Production Deploy | Zone resource: Workers AI, D1, Pages, R2 Storage, Workers Scripts and Workers Routes Write | API omits expiry | Account-scoped capability is not established from a zone policy. Effective scope needs service-specific validation. |
| Account / Thebe Desk GitHub Production Deploy v2 | Entire target account: 14 permission entries including broad writes; zone: Workers Routes Write (15 total entries) | Dashboard: no expiry | Agents, Containers, CI, Observability, Pages and KV writes have no established need in the reviewed production workflow. |

The all-account resource key was directly observed in the backup token's
dashboard JSON policy as `com.cloudflare.api.account.*`. This is broader than
the fixed target-account resource; a zone wildcard must not be interpreted as
an account wildcard. Policy allow entries are exposure evidence, not a complete
effective-permission calculation including deny precedence and provider resource support.

### Deployment requirements: distinguish probes from actual deployment

Source inspected at `d3d33d00e015d970ab2d3a485f4543b5cf2b823e`;
continuation base `9bb07eb4fb1ab9c2aafe43a564a00ff37176b681`.
Cloudflare OpenAPI was consulted through the connected documentation/spec tool.

| Operation in the production path | Minimum demonstrated requirement | Qualification still needed |
| --- | --- | --- |
| Upload Worker code and secret bindings | Workers Scripts Write (or appropriate Workers editor/admin capability) | Exact Wrangler deploy sequence, static assets, binding validation and custom-domain registration in isolated staging. |
| Read D1 database metadata | D1 Read is accepted; D1 Write is not required by this GET | Do not infer write-free deployment compatibility from a successful metadata GET. |
| Search AI model metadata | Workers AI Read is accepted; AI Write is not required by this GET | Runtime AI execution permissions and actual deploy operations are separate. |
| List Worker domains | Workers Scripts Read or Write accepted | Domain mutation may require additional zone-specific capability. |
| Read account details | Existing Workers Scripts capability is among accepted groups | An additional Account Settings permission is not justified solely by this GET. |
| Read R2 bucket metadata | Workflow needs bucket metadata visibility | Spec does not enumerate accepted groups on this operation; validate least privilege in staging before removing R2 rights. |

Account-wide D1/R2 writes should be separated from deployment wherever supported.
Provider resource-scope support must be established for the exact operation.
Do not promise database-level or bucket-level control through a general token
when only account scope has been demonstrated. Unrestricted IPs are exposure
metadata; fixed IP restrictions require an appropriate runner egress design,
not a blind allowlist that could interrupt GitHub-hosted runners.

### Audit-tool correction and review boundaries

The offline segmentation assessor previously inspected only the named v2
token and recognized only the fixed account resource. It could omit
`com.cloudflare.api.account.*` and broad permissions on other input tokens.
The consolidated change reports both all-account and target-account allow
capabilities for every validated input token, while retaining the original
selected-token fields and every false authority flag. Account inventory
completeness must not be used as evidence that user/S3 inventories are complete.
Inputs remain sanitized permission-group **names** (for example `D1 Write`),
not raw dashboard JSON group IDs, credentials or unnormalized UI labels.

Fresh offline regression cases fail against the old implementation and pass
after correction: wildcard detection, exposure on a non-selected token,
inactive credentials, zone/foreign-account scopes and deny-only entries.
This only corrects audit evidence; it changes no provider permissions.

### Fresh live state and remaining holds

Read-only Worker settings show production D1 `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`
and R2 `bw-compliance-evidence`; General AI, AI exports, POP and evidence
uploads remain false, payment provider is none. Billing staging remains
`billing-staging-readonly` with separate D1
`9d1b8852-4424-46e9-ba24-cdad5ced215f` and R2
`bw-billing-staging-pop`, uploads/POP off and provider none.
General AI staging has separate D1 `ff229eef-7724-49ae-9d68-d3a1db669b63`
and General AI false. These metadata checks are not functional acceptance,
full schema checks or proof that manual subscription activation is unavailable.

Issue #1950's 620 accessible comments contained no exact-prefix
`THEBE_VERSIONED_RESTORE_APPROVAL\n` records from owner or thusico.
Retention/access and exclusive-writer acceptance remain required. No restore,
POP migration, payment activation, production deployment, credential rotation
or protected-policy change is authorized by this review. Existing billing
handoff requirements still include independently provisioned staging values,
preservation of the original session/audit secrets, protected preflight,
independent approval and functional acceptance.

**Human/security-owner actions:** establish the exact GitHub production
secret's named principal through trusted custody metadata; independently review
these scopes; approve any separately designed replacement/cutover only after
staging verification and rollback planning. No secret values belong in chat,
source, logs or issue comments. Do not repeat the denied self-detail probe or
expand token-management access merely to make the audit pass.
