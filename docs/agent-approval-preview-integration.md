# Thebe Agent: approval preview integration contract

Status: implementation seam only. No live route, approval mutation, workflow execution, or production flag.

## Existing foundations
- `cloudflare/src/agent-workflow-simulation.js`: deterministic, immutable, draft-only proposals.
- `cloudflare/src/agent-approval-preview-boundary.js`: validates proposal input and role restrictions.
- `cloudflare/src/agent-approval-preview-handler.js`: default-disabled adapter for a previously authenticated principal.
- `public/js/agent-approval-preview.js`: inert, text-only preview renderer.
- `server/agent-authenticated-service.js`: separate Node/Postgres execution authorization seam; **do not invoke from preview**.

## Required future route security
Before exposing a route, verify the request in existing server middleware: session authentication, tenant membership, role, origin, CSRF, body size, rate limits, audit availability and emergency stop controls. Derive the principal only from trusted server session state. Never trust a body-supplied tenant, actor, role, approval status, or execution flag.

Keep `featureEnabled=false` unless a separately approved staging-only flag is qualified. Even with the flag enabled, this adapter returns draft proposals only. A production route must not be enabled by this PR.

## Proposed API (not implemented)
POST /api/ai/agent/workflows/preview
Request body: `{"workflow":"employee_task_assignment","simulationId":"<server-validated-id>"}`
Response: `{ok,proposal,approvalState:"not_requested",approvalRequired,executionAllowed:false,sideEffects:false,canSubmitApproval:false}`

No persistence or deduplication is claimed by the preview. Any future approval submission must use the established tenant-scoped, single-use approval store, idempotent durable outbox, and independent governance gates; no direct model-to-action path.

## Validation and release gates
- CI: agent workflow simulation and governance unit tests
- Adversarial tests: forged principal fields, tenant override, role escalation, replay, kill switch, and malformed payloads
- Future route: explicit authenticated integration tests and tenant isolation
- Independent reviewer: `thusico`
- Protected exact-main staging qualification before any production activation
