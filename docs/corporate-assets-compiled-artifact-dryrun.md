# Corporate Assets compiled Worker dry-run

The reviewed-source input manifest alone cannot prove which JavaScript module Wrangler actually bundles. This batch adds a separate, offline, compiled artifact receipt.

On a CI checkout, the pinned `wrangler@4.135.0` runs `versions upload --dry-run --outdir` against a temporary isolated Worker configuration, with Cloudflare credentials removed from its subprocess environment. No Worker version is created. The resulting files are hashed with SHA-256 and recorded by name and in a sorted manifest. The manifest includes the exact Git checkout and the input manifest digest.

This closes the gap between source input and locally compiled dry-run output. It **does not** prove Cloudflare has received or will receive identical bytes; only a future independently reviewed protected upload flow can establish that. A pull-request receipt relates to its actual checkout, potentially a synthetic merge SHA, and cannot be mistaken for a final production reviewed-main artifact.

Important future checks: verify Cloudflare version identity and script ETag against an authenticated upload receipt, ensure `secret_text` bindings survive, prove route and preview disabling, verify D1 isolation, and retain v2 at 100% until separate deployment approval.

This batch does not run Wrangler without `--dry-run`, does not call deployment or version APIs, does not read or rotate secrets, and never enables asset writes. `cloudflareUploadVerified`, `versionCreationAuthorized`, and `deploymentAuthorized` remain false.