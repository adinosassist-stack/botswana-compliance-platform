# V273 — GPT-Live comparative evaluation readiness

## Purpose

V273 advances issue #1057 without changing production voice routing. It converts the existing V271 comparative telemetry into a deterministic paired-session review gate for GPT-Live preview evidence.

Production remains on `gpt-realtime-2.1` through `/v1/realtime/calls`. GPT-Live remains preview-only on `gpt-live-1` through `/v1/live/sessions`, and a passing evaluation can only return `ready_for_human_review`; it never enables a production switch.

## Current OpenAI contract checked for this change

- GPT-Live-1 is the current full-duplex Live model and uses `POST /v1/live/sessions`.
- WebRTC is the recommended browser transport.
- GPT-Live supports delegation so conversation can remain in the voice model while deeper reasoning/actions stay in an application-controlled backend.
- The application remains responsible for permissions and required confirmations before actions execute.

References:
- https://developers.openai.com/api/docs/models/gpt-live-1
- https://developers.openai.com/api/reference/resources/live/methods/create
- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/live-prompting

## Added evaluation evidence

`cloudflare/src/agentic-live-eval-v273.js` adds paired Realtime/GPT-Live scenario scoring for:

- connection latency and p95 connection latency,
- first-useful-answer latency,
- provider failure rate,
- delegated work completion rate,
- interruption recovery rate,
- minimum paired-session, delegation-event and interruption-event evidence floors.

The default thresholds are Thebe rollout policy values, not OpenAI guarantees. They are deliberately conservative and may be changed only through reviewed source changes.

## Safety boundary

Even when every criterion passes:

- `readyForHumanReview` may become `true`,
- `decision` may become `ready_for_human_review`,
- `productionSwitchAllowed` remains `false`.

No runtime import is added to the production voice path. V273 does not change permissions, business action authority, task execution, payment/filing/signature controls, provider secrets, or the current Realtime production route.

## Qualification

Dedicated CI performs:

1. syntax checks for the new evaluation module and tests,
2. the existing V101 production voice boundary regression,
3. the V271 GPT-Live event compatibility/comparative telemetry regression,
4. V273 paired evaluation tests including healthy evidence, insufficient samples, provider failure regression, delegation regression, interruption regression, scenario mismatch, and the hard no-auto-switch invariant.

## Next decision

After this branch qualifies, real preview sessions can be collected in matched scenarios. Only evidence that satisfies the V273 policy should advance to a human production review. A production migration remains a separate governed release decision.
