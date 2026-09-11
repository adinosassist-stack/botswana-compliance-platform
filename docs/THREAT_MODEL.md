# Threat Model

Primary risks: tenant data leakage, stolen sessions, malicious uploads, privilege escalation, unsafe legal automation, regulator-source drift, audit tampering, data over-retention and compromised integration credentials.

Controls in launch candidate: opaque hashed server sessions, HttpOnly SameSite cookies, CSRF tokens, server-derived tenant identity, role checks, request size limits, input validation, rate limiting, security headers, tenant-scoped DB queries, private object-store design, append-only audit events, source-conflict blocking and professional-review gates.

Still required operationally: MFA-capable identity provider upgrade, WAF/bot controls, malware scanning pipeline, SIEM/alerts, key rotation, external penetration test, dependency scanning and periodic access reviews.
