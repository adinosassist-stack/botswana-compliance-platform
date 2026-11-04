# Deployed production core-only binding verification

The production release workflow now performs a **GET-only Cloudflare Worker settings** check *after* its authorized deployment step and *before* API readiness acceptance. A successful rendered config dry-run is not equivalent to verifying active Worker bindings.

The checker requires exactly one plain-text binding for `APP_ENV=production`, `PAYMENT_PROVIDER=none`, and `POP_UPLOAD_STAGING_ENABLED=false`, `THEBE_AI_EXPORTS_ENABLED=false`, `THEBE_GENERAL_AI_ENABLED=false`. Missing, duplicated, secret-typed, enabled or inaccessible values fail the release closed. It reports only a safe pass/fail summary and never logs the response body, account token, other bindings or credentials. Tests use a fake in-memory HTTP response; CI performs **no Cloudflare writes or live GET**.

This is a **postdeploy release acceptance improvement**, not permission to deploy. It does not establish runtime feature endpoints' behavior, backup immutability, RPO, isolated restore, POP schema readiness, BF-07 provenance or independent production approval. The active production Worker observed before this change did not expose the three explicit false flags in the read-only settings result, so it must not be treated as qualified until a separately authorized release proves the live flags and all other gates. Never bypass the failed check to launch.
