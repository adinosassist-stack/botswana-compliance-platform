# Thebe Desk — Live Voice (OpenAI Realtime GA)

## Purpose

Thebe Live adds a low-latency voice interface to the existing single canonical Thebe agent. It does not create a second business agent, a second permission model, or a voice-only execution path.

The architecture is:

`Owner voice -> OpenAI Realtime WebRTC -> function call -> governed Thebe backend -> capability routing -> deterministic policy -> approval/runtime guard -> function result -> spoken response`

## Production posture

- Browser transport: WebRTC.
- Realtime API: GA `POST /v1/realtime/calls`.
- Voice model: `gpt-realtime-2.1`.
- Business delegation: Realtime function tool `delegate_to_thebe_backend`.
- API key: server side only.
- Business work: delegated to the existing governed `/api/agentic/plan` flow.
- Raw microphone audio: not stored by Thebe.
- Browser receives only the WebRTC answer/session metadata, never `OPENAI_API_KEY`.
- Voice cannot create permissions or bypass tenant scope, delegated authority, the runtime kill switch, approvals, or the Runtime Guard.
- High-risk actions remain human-controlled.
- A spoken interruption invalidates a pending delegated result for speech purposes; stale results are returned to the model as stale and must not be presented as current.

## Server configuration

The local/example environment remains off by default:

```
THEBE_LIVE_VOICE_ENABLED=0
THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR=6
THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR=4
THEBE_LIVE_VOICE_MAX_SESSION_SECONDS=600
THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS=12000
THEBE_LIVE_VOICE_FAILURE_CIRCUIT_THRESHOLD=3
OPENAI_API_KEY=
```

Production activation is controlled by the reviewed Cloudflare config, where `THEBE_LIVE_VOICE_ENABLED=true`. `OPENAI_API_KEY` is required as a GitHub `production` environment secret and is injected only into the Worker secret set during the governed deploy. Never commit a real key or expose it to browser code.

The production guardrails permit at most 6 session starts per workspace per hour and 4 per user per hour, cap each browser session at 10 minutes, abort upstream session creation after 12 seconds, and temporarily stop new sessions after 3 recent provider/session failures in 10 minutes.

## OpenAI Realtime session contract

The trusted Worker creates the WebRTC call with a multipart request containing:

- the browser SDP offer;
- a Realtime session with `type: "realtime"`;
- model `gpt-realtime-2.1`;
- audio output enabled with the `marin` voice;
- semantic VAD for turn detection;
- the single `delegate_to_thebe_backend` function tool;
- `tool_choice: "auto"`;
- a privacy-preserving `OpenAI-Safety-Identifier` derived from the authenticated tenant/user identity.

The Realtime model may converse directly for general dialogue. For current company facts, finance, compliance, operations, customers, business analysis, or governed actions, it is instructed to call `delegate_to_thebe_backend`.

## Routes

- `GET /api/agentic/live/status`
- `POST /api/agentic/live/session`
- `POST /api/agentic/live/delegation`

All routes require an authenticated owner or manager. Mutating requests retain origin and CSRF checks.

## Browser behavior

The browser client is inert unless the server reports that live voice is enabled, configured, within rate limits, and not paused by the runtime kill switch. When eligible, the Owner Command Centre receives a **Talk to Thebe** button.

The browser:

1. requests microphone access only after the user presses the button;
2. creates the WebRTC peer connection and `oai-events` data channel;
3. sends the SDP offer only to Thebe's trusted Worker;
4. receives the SDP answer and attaches the Realtime media stream;
5. listens to standard Realtime events such as `session.created`, `response.done`, and `response.output_audio_transcript.delta`;
6. detects completed `function_call` output for `delegate_to_thebe_backend`;
7. sends the requested business task to the governed Thebe backend;
8. returns the verified result with `conversation.item.create` using `function_call_output`, then sends `response.create`;
9. marks a delegated result stale if the user starts speaking again before the backend completes;
10. renders connection and failure status next to **Talk to Thebe**, including microphone, WebRTC, provider, and rate-limit failures;
11. ends sessions with `session.close` and waits for `session.closed` before tearing down media, with a bounded 15-second fallback.

No custom or private Realtime event types are required. Provider rejection details are reduced to safe status/code/type diagnostics; raw provider response bodies are not returned to the browser.

## Promotion and rollback gate

Production activation requires:

- the GitHub production `OPENAI_API_KEY` secret;
- exact-SHA Recovery CI, audit, runtime identity, release-chain, and Node/Postgres lifecycle checks;
- no browser-visible API key;
- server-side session rate and failure-circuit controls;
- microphone-denial and WebRTC failure recovery remaining fail-closed;
- runtime kill switch continuing to block new sessions;
- a production post-deploy readiness check.

Rollback is immediate at the configuration layer by setting `THEBE_LIVE_VOICE_ENABLED=false` in a reviewed release. The OpenAI key can remain stored server-side during rollback.
