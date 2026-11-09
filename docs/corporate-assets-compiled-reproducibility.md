# Corporate Assets: two-build reproducibility gate

This guard executes two separate pinned Wrangler `versions upload --dry-run` compilations from the same checked-out source, each in its own temporary directory. It compares the exact compiled file list, per-file SHA-256, source input manifest and bundle digest.

Any difference in JavaScript, sourcemaps, output file list, toolchain or source metadata causes the CI job to fail. The result always says sourceToCloudflareUploadVerified=false, versionCreationAuthorized=false and deploymentAuthorized=false.

This is an offline-only reproducibility control; it does not prove a Cloudflare upload, preserve existing secret bindings during version creation or grant a protected write permission. A future source-to-upload implementation still needs independent owner and `thusico` authorization, authenticated upload evidence, and checks that deployed v2 retains 100% traffic.

CI on pull requests uses the actual checkout commit (which may be a synthetic test merge commit). Never interpret that receipt as evidence for a different main SHA. This batch makes no Worker or production changes.

## Real CI finding and tightened proof semantics

Two independent Wrangler dry runs produced the same executable JavaScript but different generated sourcemaps and README metadata, apparently containing build-location-dependent information. This is not full artifact reproducibility. The qualification now separately records stable executable module hashes and all varying auxiliary files; `reproducible` remains false when any auxiliary file changes and `fullArtifactProvenanceReady` is always false. Only executable module drift fails the offline CI job. The future protected upload must separately prove the *entire uploaded payload*, not rely on this partial observation.
