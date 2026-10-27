# AI Dock renderer candidate — supply-chain evidence

**Status:** isolated review-only dependency graph. This does NOT approve or install renderer dependencies in the production runtime, nor activate customer exports.

At GitHub Actions run `40554964093`, the workflow `AI export artifact signature qualification` generated and archived an isolated npm package manifest and lockfile in artifact **ai-export-renderer-supply-chain-candidate** (artifact ID `12755588585`). Evidence collected 27 October 2026:

- Exact direct versions: `docx@9.5.1`, `pdf-lib@1.17.1`, `pptxgenjs@3.12.0`.
- Evaluated transitive override: `image-size -> npm:image-size-next@2.1.0`. This is a **third-party fork**, not an upstream patch. License, maintainer identity, security and API-compatibility assessment still require independent sign-off.
- Candidate `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities **at the time of that isolated scan**; a clean audit is not a supply-chain guarantee.
- Artifact `package.json` SHA-256: `27ea20860e200e1f1d8f7b7046bb43213da89f95545be1bf639cd7d724243eba`.
- Artifact `package-lock.json` SHA-256: `ab1c27fb7dc9db4b25abe991b2d2e02826e5fe0f05cb5930b56b59e36d520504`.
- The candidate lockfile contained 32 package entries; the transitive overridden package appeared under `node_modules/image-size` with package name `image-size-next`, version 2.1.0.

The hashes above were verified against the downloaded GitHub Actions artifact, then checked into `docs/ai-export-renderer-review-lock.sha256`. The pull request's qualification workflow now **regenerates the isolated lock and verifies BOTH hashes before `npm ci`**. This fails closed if a registry resolution changes, rather than silently reviewing different dependencies. The workflow also runs the strict audit, actual PDF/DOCX/PPTX file generation tests, and verifies that text-only PPTX generation does not import an image decoder.

## Outstanding gates

1. Reviewer `thusico` independently evaluates the current PR, this artifact and third-party fork provenance. Do not approve an alias on the basis of an audit score alone.
2. Make an explicit production dependency architecture decision. The root `package.json` and `package-lock.json` are **untouched**, and the live Cloudflare Worker must not gain unlocked imports.
3. Only after approval, promote a real production locked dependency graph via a separate reviewed code change, with SBOM/licence/vulnerability review and staging renderer isolation evidence.
4. Complete dedicated private D1/R2 staging, ownership, file download and revocation E2E checks in [export launch gate #1868](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1868). Keep exports OFF until separately authorized.

[GitHub Actions run](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/40554964093).
