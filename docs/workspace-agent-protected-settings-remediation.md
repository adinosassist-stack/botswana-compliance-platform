# Workspace Agent — protected configuration remediation

## Evidence and scope

Protected run [43766828535](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43766828535) on exact main `b476e6cdbf9f5a3a48a2fc69efb9c395c84679a3` passed:
- isolated account and only intended Worker
- pinned inert version `64d9bae9-2ea3-40c1-9a26-83cea97ad71c` allocated 100%
- workers.dev and previews disabled
- no cron triggers or Worker custom domains
- dedicated D1 `fa317ccc-683d-4466-9e3a-e296872d58ba` has zero tables.

It failed exactly two named checks:
1. `plain_text_only_no_resource_bindings`
2. `advisory_shell_disabled`.

The browser inventory previously showed a `DB` D1 binding and `WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED=true`. These observations must be verified anew from the Cloudflare **read-only API** before a write. Do not infer the full live binding set from a browser screenshot or blindly rewrite the binding list.

## Protected remediation design (not yet executable)

Target only Cloudflare account `b11d872b2660e76ca66323023b45b3ab`, Worker `bw-workspace-agent-staging`. Never operate on Botswana production account or production Worker. Preserve the dedicated D1 database; removing a Worker binding must **never delete D1**.

1. Require a **fresh exact-main SHA**, an explicit owner confirmation naming the two settings changes, and **independent `thusico` GitHub environment approval** with self-review prevention. GitHub permissions default to none; mint no tokens at runtime.
2. Re-run the entire existing `workspace-agent-inert-diagnostics.yml` read-only inventory immediately before the prospective write. Accept only the two named failing gates and require every other gate PASS; fail closed on unexpected changes or missing/ambiguous responses.
3. Obtain the complete current Worker settings metadata and bindings from the Cloudflare API; compare binding names, types and expected values against a pinned allowlist. Halt on any unexpected binding or secret. Avoid logging values or storing secret-bearing JSON as artifacts.
4. Capture a **secure encrypted recovery snapshot** of the complete source configuration in protected storage with documented retrieval and retention. No raw secret values may enter logs, PRs or GitHub artifacts. Validate whether an existing secret binding can survive the settings PATCH without needing to read or re-submit its value. If not demonstrably safe, **do not PATCH**; switch to an isolated version-only upload and independent verification, or require a separately reviewed secret-aware procedure.
5. Propose **only** removal of the unapproved `DB` D1 binding from the Worker and setting `WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED=false`. Leave all other plain-text variables, secret references, source code, routes, schedules, domains and database contents unchanged.
6. Cloudflare's `PATCH /accounts/{account_id}/workers/scripts/{script_name}/settings` is a **settings mutation which can create a Worker version**. A prior deployed inert version at 100% does not prove settings are safe after a PATCH. Validate expected version-binding association and exact API semantics before implementing any mutation. Never automatically activate a newly created version.
7. Immediately re-read the *effective deployed Worker settings* and deployments with a separate read-only credential. Re-run the full existing protected diagnostic. If any gate fails, stop and report `recovery_incomplete` rather than falsely claiming restoration; do not automatically repeat a write.
8. Require a separate owner authorization and fresh independent `thusico` approval for any actual deployment or version promotion. Do not enable the Agent, staging routes, POP uploads, General AI, previews, or production traffic.

## Implementation acceptance gates

- [ ] Reviewer validates exact Cloudflare API payload/secret-preservation semantics.
- [ ] All remaining settings (including secret references) preserved byte-for-byte or by proven equivalent binding identity.
- [ ] Restore plan can undo settings metadata without requiring undisclosed secrets.
- [ ] Offline synthetic regression tests exercise expected `DB` binding, an unexpected second resource binding, unexpected secret, changed SHA, missing token, wrong account, and failed post-write read.
- [ ] No writes permitted from a pull-request event; only protected manual dispatch from fresh main.
- [ ] `thusico` approves the actual remediation implementation, not only this preparatory plan.
- [ ] After implementation and approved execution, protected diagnostics report **all checks PASS**.

**This PR is intentionally a non-deploying remediation safety specification.** The two real settings changes are NOT made by this PR. Do not interpret merge or CI success as restored Cloudflare configuration.

## API references

- Cloudflare Worker script settings PATCH: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/edit/
- Existing protected inspection: `.github/workflows/workspace-agent-inert-diagnostics.yml`
- Existing deployment-only rollback: `.github/workflows/workspace-agent-protected-inert-recovery.yml`
