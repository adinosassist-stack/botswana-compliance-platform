# V270 — Voice provider policy and GPT-Live evaluation boundary

## Purpose

Advance Thebe voice toward GPT-Live without changing the qualified production voice route before the new path passes controlled evaluation.

## Production invariant

Production remains on the existing OpenAI Realtime WebRTC route (`/v1/realtime/calls`) with `gpt-realtime-2.1`. This release does not switch production traffic.

## New provider policy

`cloudflare/src/thebe-voice-provider-policy.js` introduces a small server-side policy boundary for voice provider selection.

- Default provider: `realtime`.
- GPT-Live provider: `live` with `gpt-live-1` and `/v1/live/sessions`.
- GPT-Live requires both `THEBE_VOICE_PROVIDER=live` and `THEBE_GPT_LIVE_EVAL_ENABLED=1`.
- If GPT-Live is requested without the evaluation gate, the policy falls back to Realtime.
- Unknown providers also fall back to Realtime.
- The fallback chain is deterministic: Live evaluation → Realtime.
- Public diagnostics expose provider/model state but never credentials or upstream secrets.

## Transport contract

The policy captures the two different server exchange shapes without sending network traffic:

- Realtime keeps the current multipart SDP/session exchange.
- GPT-Live uses a JSON body containing `session` and `transport: { type: "webrtc", sdp }`.

The browser remains responsible only for WebRTC media and data-channel events. The OpenAI project key remains server-side.

## Governance preserved

This change does not alter Thebe's delegated-authority model. Voice remains a conversational layer; business data access, governed tools, approvals, auditability and high-impact execution remain backend-owned. GPT-Live evaluation must preserve the same authority boundary before promotion.

## Qualification

`tests/v270-live-provider-policy.mjs` verifies:

- Realtime remains the default.
- GPT-Live cannot activate without the explicit evaluation flag.
- Unknown providers fail safely to Realtime.
- Live and Realtime session envelopes remain distinct and valid.
- Diagnostics do not leak the API key.
- The existing V101 production Realtime guard remains green.

The dedicated workflow `.github/workflows/v270-live-provider-policy-ci.yml` runs both the new V270 tests and the existing V101 guard.

## Next gate

After this policy merges, the next branch may integrate it into `agentic-live-voice.js` behind the evaluation flag, add latency/interruption/tool-delegation telemetry, and exercise a real GPT-Live session only when provider billing/access is ready. Production promotion remains a separate decision after those checks pass.
