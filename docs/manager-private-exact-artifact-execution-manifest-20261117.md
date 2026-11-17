# Manager private staging exact-artifact execution review manifest

**Status: REVIEW ONLY — NOT DEPLOYMENT AUTHORIZATION.**

## Immutable offline build

| Field | Verified value |
| --- | --- |
| GitHub Actions run | `44118970875` — SUCCESS |
| Artifact name / ID | `manager-private-offline-bundle` / `14344097769` |
| Actual CI build checkout SHA (merge-context) | `69785a3d481f9814f200d3b6e893ee32bc8fa311` |
| PR #2601 source head | `83cd09919bf83a3705efd2981ac6e90309fc76fc` |
| PR head vs merge-context | GitHub comparison showed zero changed files |
| GitHub artifact ZIP SHA-256 | `84846e22cd8ac9729accb875093a67d638fb19ad55a5cea4c26669ccc4868ffc` |
| Compiled `worker.js` SHA-256 | `63a7976a24151f2241866e9d682682a40689e38805479dba38b9b956de1c10ca` |
| Source map SHA-256 | `3141308474bd9bf37b044b3ccca13840e8a9eae7243e6b0f258b7e7631a2e17d` |
| `README.md` SHA-256 | `faeb6472d9a757b719420cafa8a8cde4b9593fb4587def43199345d2e59681b6` |
| Checksums | Independently compared 3/3 SHA256SUMS entries; zero mismatches |
| Build mode | `wrangler deploy --dry-run --outdir`; no Cloudflare upload |
| Base main for this manifest | `d14fb0a3a6ec4d0dca431d1a8ad279d7550162c9` |

**Important:** The bundle's SHA-256 only authenticates its bytes. It does not by itself certify runtime bindings or prove browser authentication. No code on this branch is authorized for live deployment by this document.

## Cloudflare boundary — read-only verified

- Account `ddd23cab31928a4bb3d4998df9b26d1d`, zone `thebedesk.com`.
- Access self-hosted application `7934753d-0188-4796-9288-bfd99d3be791` restricted to exact host `manager-staging.thebedesk.com`.
- Only allow policy `3f18551c-b867-4e73-bd7b-a6359297c791`, exact email `banabothem@yahoo.com`. No wildcard/Everyone policy was found.
- **No** manager staging Worker, matching DNS, Worker route or custom domain exists.
- Planned functional Worker: `bw-manager-invitations-functional-private-staging`, with `workers_dev=false` and `preview_urls=false`.
- D1 binding may point **only** to `bw-manager-invitations-synthetic-staging` / `518a9e33-b2ba-4204-ac52-aae4150a7b52`; static assets only. No production D1, R2, payment, AI, cron or other customer binding.
- Current candidate sets `MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED=false`, `MANAGER_INVITATIONS_SCHEMA_READY=false`, `MANAGER_INVITATIONS_ACCESS_READY=false`, `REGISTRATION_MODE=hold`. Maintain fail-closed until actual tests pass.

## Approval and operational checklist

1. Reviewer independently downloads artifact ID `14344097769`, checks SHA-256 against every file and approves **compiled code + source map + Wrangler settings + assets**. Note that the dry-run ZIP contains `worker.js`, `worker.js.map`, `README.md`, `BUILD-REFERENCE.txt` and `SHA256SUMS`; **the Worker binary artifact does NOT package static assets**; these are now separately qualified below and must be reviewed together before any functional Worker deployment.
2. Before any upload, independently verify approved secrets and source/provenance. Create fresh `SESSION_SECRET` only through Cloudflare's approved staging-only secret store; never log/commit value.
3. Verify isolated D1 schema and Time Travel bookmark, dry-run rollback and explicit teardown procedure without touching production.
4. Stage an **inert version only**, with no route, custom domain, preview URL or Worker execution, if separately and explicitly authorized.
5. Independently verify Access intercepts exact ingress **before** any functionality is exposed. Only then introduce a scoped protected hostname. Probe seven unauthenticated paths and deny unknown emails; do not infer protection from app creation.
6. Only after verified Access-negative probes and separate functional-activation approval, test synthetic invitation → one-time activation and replay denial → login → assigned-location dashboard → cross-tenant denial → revocation/suspension → recovery. Redact cookies, OTP, passwords, tokens and secret material.
7. No production deployment or manager-login activation without an entirely separate exact-main release approval.

## Exact reviewer decision

Issue #2599 requires `thusico` to explicitly choose `APPROVE PRIVATE_MANAGER_STAGING_EXECUTION_NO_PRODUCTION` or `REQUEST CHANGES` **referencing the above artifact, the independently verified separate static asset package, secret and recovery/ingress controls**.

PR #2579, #2595, and #2601 approvals are not substitutes: they covered code, documentation and **offline-only** builds, respectively. The two earlier `approve` comments in Issue #2599 did not specify the compiled binary or the execution scope. Do not infer approval to upload from those comments.

No Cloudflare write, staging Worker deployment, routing, or production change is authorized by this manifest.

## Separate static assets package — independently verified

The previously missing `public/` static files were packaged offline under GitHub Actions workflow run `44136585601`, on PR #2603. **No deployment/upload to Cloudflare.**

- Artifact: `manager-private-static-assets-offline`, ID `14351873198`.
- GitHub artifact ZIP SHA-256: `c969624cb793be399431eec2be364e6a4950b38058ecff1ef3cfb5df89ef746f`.
- Deterministic `public.tar` SHA-256: `afdbdd36077449f2bb9cf06e5c2886fd84b11edda00d7a628912321e4d174afc`.
- `ASSETS-SHA256SUMS` SHA-256: `945457a874424cb27af70ff96e0466c10ef27edd3c7ba7c38cab192768b74ced`.
- **276/276 files checked independently against manifest, zero mismatches/missing**.
- Build recorded Actions merge-context SHA `61ba1159f5593968866ef6b9afddc3f41779ea4a`. Comparisons to PR head show only unrelated quotation changes, no change to static public files.

Thus **binary + static asset source-package integrity evidence is available**, but reviewer still must approve both exact artifacts together with the isolated secrets, protected ingress, recovery and synthetic browser E2E rollout; neither offline artifact is a deployment authority.
