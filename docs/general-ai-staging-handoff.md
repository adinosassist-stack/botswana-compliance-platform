# General AI isolated staging handoff

Worker: `bw-general-ai-staging`. This is a **configuration proposal only**, not a deployed Worker. Never repurpose `bw-billing-staging`, `bw-compliance-os-ops-rehearsal`, or `bw-compliance-os`.

The checked-in profile deliberately disables General AI and live research, has no hostname route, no D1/R2 bindings, no secrets, and no accessible Worker preview. It is **not functional or deployable as a working authenticated service** yet.

Before changing this profile, independently review and provision an isolated tenant/session store and authentication boundary, then a dedicated rate limiter with a unique account namespace, staging-only `OPENAI_API_KEY`, `THEBE_GENERAL_AI_MODEL` and `BRAVE_SEARCH_API_KEY`. Restrict costs and ensure the fixed `PUBLIC_ORIGIN` matches the actual approved staging hostname. Do not copy production secrets or use production databases.

Require explicit staging authorization and independent review before binding a hostname or enabling either flag. Run `scripts/general-ai-staging-preflight.mjs` only after the authenticated staging endpoint is genuinely operational. Never infer provider readiness from mocked CI. No production activation is authorized by this file.
