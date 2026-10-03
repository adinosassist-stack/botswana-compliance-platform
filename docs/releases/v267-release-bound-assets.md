# V267: deliver the published UI to returning browsers

Workspace runtime, styles and lazy view fragments previously reused URLs with a one-year immutable browser policy. A browser could therefore keep an older UI after a newer release deployed.

The final HTML response now binds local script and stylesheet URLs to the published source SHA and supplies the same identity to lazy workspace fragment requests. Existing feature query parameters are preserved. External assets, links, JSON API responses, authorization and business data are unchanged. HTML receives no-store cache headers and stale entity headers are removed. GET and HEAD behavior are covered.

Regression coverage includes source changes producing different URLs, repeated decoration, all public/auth/app HTML paths and each lazy fragment implementation. The check runs in release regressions and Client Runtime Identity CI.
