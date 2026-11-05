# General AI staging: independently protected read-only live audit

**Review scope:** this is not deployment authority or production AI activation. It is an **opt-in**, main-only, independently approved GitHub Actions workflow.

## Protection and prerequisites
- Review and merge the script, tests and workflow under the repository's existing `main-production-governance` with independent `thusico` review.
- The protected `general-ai-private-staging` GitHub environment must retain independent review, prevent self-review, and restrict to `main`. A successful staging audit does **not** authorize production approval.
- An authorized human must create a **separate** Cloudflare token, `GENERAL_AI_STAGING_AUDIT_TOKEN`, scoped to the exact reviewed account and zone with **read-only** Workers script/settings, Worker routes, DNS inventory, D1 schema/query permissions as required. D1 query is an API POST and must be constrained by this reviewed, fixed-query script; do not grant unnecessary deployment, R2, DNS-edit or database-admin rights. Review actual token policy/expiry independently. A read-only audit token *cannot* substitute for the independently authorized deployment credential.
- Add it as a protected GitHub environment secret. Never place the value in GitHub issues, chat or logs. If scoped permissions cannot support fixed D1 read queries without broader write authority, **stop** and use a separately approved read-only alternative rather than expanding rights.
- A human may explicitly dispatch workflow `General AI staging read-only Cloudflare audit` from `main`, entering `AUDIT_PRIVATE_GENERAL_AI_STAGING_READONLY`; protected environment reviewer must approve independently.

## What is checked
The audit reads only metadata from `bw-general-ai-staging`, the active `thebedesk.com` Cloudflare zone, and the isolated auth D1 `ff229eef-7724-49ae-9d68-d3a1db669b63`. It checks disabled General AI/research flags, required secret *binding type only*, correct D1 and limiter bindings, disabled workers.dev/preview URLs, no custom Worker domain, no public Worker zone route or staging DNS, the required tenant/session schema and foreign key, and that no unreviewed staging fixtures exist. GETs inspect cloud settings, and D1 query POSTs contain only fixed SELECT/PRAGMA statements. Any token error, missing table, public route, unexpected provider binding, or nonempty test identities fails closed.

The script does not retrieve secrets, issue AI provider requests, mutate Cloudflare, publish public URLs or start Workers. It does **not** prove least-privilege policy by itself, since the requested token's independent dashboard policy and expiry are separate evidence. An empty fixture store is **not** evidence of authenticated end-to-end acceptance.

## Next after read-only acceptance
The separate, independently reviewed private invocation channel and synthetic fixture lifecycle described in `docs/general-ai-private-staging-access-acceptance.md` remain unimplemented. A no-route Worker service binding alone is not remotely invokable. Do not create real test identities, enable providers or activate General AI until those gates and a hard cost budget are approved. All customer-facing AI flags remain OFF.
