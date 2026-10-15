# Main governance provenance bridge — 2026-10-15

## Purpose

This change records a governance-only recovery boundary after merge `62e6b236a5a7d3748fff9567e3666584e8c23b6a` failed the post-merge Main Governance Guard because the merged PR retained an older stored base SHA after its head was refreshed onto a later `main`.

The merge itself was GitHub-signed, changed only the two synthetic marketing-hero contract lines, and completed Recovery CI including the Postgres migration/API lifecycle. GitHub subsequently associated it with PR #1441, but the PR metadata still records an historical base SHA rather than the exact first parent of the merge, so rerunning the exact-main guard cannot make that merge satisfy the parent/base provenance rule.

## Recovery boundary

This documentation-only PR is created directly from current `main` at `62e6b236a5a7d3748fff9567e3666584e8c23b6a`. It intentionally changes no application code, deployment configuration, release manifest, regulatory policy, authentication, data model, or production runtime.

Merging this PR through the normal protected PR path establishes a new exact-current-main two-parent merge with unambiguous base/head provenance. Required CI and post-merge Main Governance Guard must pass normally; no force push, ruleset bypass, direct-main write, or deployment shortcut is authorized.

## Production status

Production release 517 remains the deployed customer build. Its source is `3788268acc5fc7027b9f4fd2d2d97f00b8e07b2d` and its release merge is `ffa4f01d9f69f3368452cd57f6943a9deff03b8b`. The Cloudflare deployment and live Gemini dock, client-runtime, mobile, general post-deploy, and WhatsApp public-entry checks passed on that release.

This provenance bridge does not advance `release/production.json` and must not trigger or be represented as a new customer-facing production release.

## Launch authority

The regulatory maker-checker independence gate remains fail-closed. This bridge does not authorize unrestricted regulatory activation or weaken any maker-checker, approval, tenant-isolation, security, release, or deployment control.
