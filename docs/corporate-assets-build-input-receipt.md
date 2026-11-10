# Corporate Assets: checkout-bound offline build-input receipt

This receipt helps reviewers audit **which exact source inputs and pinned Wrangler version** were present in a CI checkout. It does **not** prove the Worker bundle uploaded to Cloudflare is byte-for-byte identical, and cannot authorize staging or production deployment.

The script `scripts/corporate-assets-build-input-receipt.mjs` checks the exact `git rev-parse HEAD` against the explicit `EXPECTED_MAIN_SHA`, verifies the isolated D1/disabled-write config, requires Wrangler `4.135.0` in both package and lock file, and hashes each relevant source/config/toolchain file using SHA-256. The manifest itself is SHA-256 hashed using deterministic field order. No secrets, GitHub tokens or Cloudflare mutations are needed.

The PR workflow emits an offline receipt for the **pull request checkout** (which may be a synthetic merge SHA), not for a protected production or staging release. Reviewers must not interpret the PR merge SHA as independently qualified `main`.

**To inspect after an exact reviewed main checkout:**

```bash
EXPECTED_MAIN_SHA="$(git rev-parse HEAD)" node scripts/corporate-assets-build-input-receipt.mjs
```

Before a new staging candidate is eligible for release, a separate independently reviewed protected version-only workflow must create the candidate from this exact source, verify the actual uploaded Cloudflare artifact's digest and its exact source/build receipt, preserve staging secrets and isolation, and re-run independent private exposure checks. If the stored v3 cannot be linked to an authenticated upload/build receipt, it stays undeployed; source labels or ETag continuity are insufficient.

No script in this batch deploys a Worker, rotates credentials, turns on staging writes, or changes production.
