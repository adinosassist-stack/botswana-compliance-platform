# V272 — Isolated GPT-Live preview transport

V272 turns the V270/V271 GPT-Live migration foundation into an authenticated server-side preview transport without changing the production Realtime session route.

## New preview routes

- `GET /api/agentic/live/preview/status`
- `POST /api/agentic/live/preview/session`

These routes are checked before the existing `/api/agentic/live/*` production handler so the production handler cannot consume the preview path with its live-prefix fallback.

## Access and rollout boundary

The preview requires all of the following:

- authenticated Thebe workspace user,
- owner or manager role,
- `THEBE_LIVE_VOICE_ENABLED=1`,
- agent runtime enabled and kill switch off,
- `THEBE_GPT_LIVE_PREVIEW_ENABLED=1`,
- `THEBE_LIVE_VOICE_RUNTIME=gpt_live_preview`, and
- a server-side OpenAI API key.

The production route remains `/api/agentic/live/session` using the existing Realtime runtime. Preview responses always report `productionSwitchAllowed:false` and include the Realtime route as the fallback target.

## Provider exchange

The preview transport sends the browser SDP offer to the OpenAI GPT-Live session endpoint from the trusted Cloudflare server. The OpenAI project key is never returned to the browser.

The server validates and bounds the request body and SDP, applies an upstream timeout, validates the returned session ID and SDP answer, and exposes only a sanitized provider error code when the upstream request fails.

## Governance

GPT-Live remains configured for client delegation. The model may converse directly for ordinary questions, but Thebe Desk remains responsible for private business data, permissions, confirmations, governed tools, audit records and high-impact execution. V271's event/delegation compatibility layer remains the contract for the later browser preview adapter.

## Qualification

The V272 test suite verifies:

- preview cannot activate without the full double-opt-in and runtime safety gates,
- malformed SDP is rejected,
- the provider request uses `gpt-live-1`, client delegation, `store:false`, WebRTC and `/v1/live/sessions`,
- a valid provider SDP answer is normalized for the browser,
- provider error detail is not leaked,
- every preview failure exposes the existing Realtime session route as fallback,
- the preview handler is routed before the production live handler, and
- production still uses `gpt-realtime-2.1` and `/v1/realtime/calls`.

## Next step

Add a small browser preview adapter that selects `/preview/session` only when preview status explicitly allows it, understands the V271 GPT-Live event contract, delegates business work through the existing governed backend, and automatically retries the existing Realtime session path when preview session creation fails.
