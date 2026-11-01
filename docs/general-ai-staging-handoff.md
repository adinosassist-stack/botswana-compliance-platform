# General AI isolated staging handoff

Worker: `bw-general-ai-staging`. A private bootstrap Worker exists; the reviewed General AI application bundle still requires protected deployment and verification. Never repurpose `bw-billing-staging`, `bw-compliance-os-ops-rehearsal`, or `bw-compliance-os`.

The checked-in profile deliberately disables General AI and live research, has no hostname route or R2 binding, and has no accessible Worker preview. The reviewed profile binds only dedicated auth D1 `ff229eef-7724-49ae-9d68-d3a1db669b63`, rate-limit namespace `78212078`, and the separately provisioned `SESSION_SECRET`. It is **not qualified as a working authenticated AI service** yet.

Before enabling this profile, independently qualify the isolated tenant/session store and authentication boundary and dedicated rate limiter, then provision staging-only `OPENAI_API_KEY`, `THEBE_GENERAL_AI_MODEL` and `BRAVE_SEARCH_API_KEY`. Restrict costs and ensure the fixed `PUBLIC_ORIGIN` matches the actual approved staging hostname. Do not copy production secrets or use production databases.

Require explicit staging authorization and independent review before binding a hostname or enabling either flag. Run `scripts/general-ai-staging-preflight.mjs` only after the authenticated staging endpoint is genuinely operational. Never infer provider readiness from mocked CI. No production activation is authorized by this file.

## Read-only configuration verification

`scripts/general-ai-private-staging-verify.mjs` accepts only the exact reviewed account, database, limiter, session-secret binding name/type and disabled variables. Missing, duplicate, unknown or production bindings fail closed. It checks Workers.dev and preview access; it does not establish application deployment identity, token validity, secret contents, custom-domain/zone-route isolation, database schema readiness or live provider functionality. Those remain separate release gates. A bootstrap Worker without the disabled application variables correctly fails this application-configuration check.
