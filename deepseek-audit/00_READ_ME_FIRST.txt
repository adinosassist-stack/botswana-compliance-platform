THEBE DESK — DEEPSEEK AUDIT BUNDLE
Production source pinned to commit:
9fdfbfa5bf3995a466f2bb4f18d2a28587909d29

Repository:
adinosassist-stack/botswana-compliance-platform

Audit branch:
audit/deepseek-production-143

IMPORTANT
- These files are copied from the exact production revision above.
- The audit branch is only a readable packaging layer; production main is unchanged.
- File boundaries in bundle files show the original repository path.
- Start with 01_PRODUCTION_WORKER.txt, then 02_AGENT_FINANCE_WHATSAPP.txt, then the frontend/server bundles.
- Do not assume passing tests imply safety.

Suggested DeepSeek audit target:
Find exploitable bugs, auth bypass, tenant isolation failures, IDOR, XSS/injection, CSRF, session flaws, race/idempotency bugs, payment/finance integrity failures, prompt injection/tool authorization flaws, voice/WhatsApp abuse, secret/config leakage, Cloudflare deployment mistakes, mobile/responsive failures, accessibility defects, dead code, performance regressions, and mismatches between tests and production behavior.

Return each finding with:
severity, CWE/OWASP mapping, exact file/path, exact vulnerable code, exploit scenario, impact, minimal patch, regression test, and confidence.
