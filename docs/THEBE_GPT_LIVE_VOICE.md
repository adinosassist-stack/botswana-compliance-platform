# Thebe Desk — GPT-Live-1 Voice Foundation

## Purpose

Thebe Live adds a real-time voice transport to the existing single canonical Thebe agent. It does not create a second agent, a second permission model, or a voice-only execution path.

The architecture is:

`Owner voice -> GPT-Live-1 -> client delegation -> governed Thebe backend -> capability routing -> deterministic policy -> approval/runtime guard -> result -> GPT-Live-1 commentary`

## Phase 0 posture

The feature is disabled by default.

- Browser transport: WebRTC.
- Live model: `gpt-live-1`.
- Delegation mode: client delegation.
- API key: server side only.
- Business work: delegated to the existing `/api/agentic/plan` flow.
- Raw microphone audio: not stored by Thebe.
- General live transcript: kept in browser memory by default.
- Delegated business request text: may become the governed agentic run goal and therefore becomes part of the existing auditable run record.
- Voice cannot create permissions or bypass tenant scope, delegated authority, the runtime kill switch, approvals or the Runtime Guard.
- High-risk actions remain human-only.
- A spoken interruption does not prove that backend work was cancelled.

## Server configuration

Keep the feature disabled until production qualification is complete:

```
THEBE_LIVE_VOICE_ENABLED=0
THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR=6
THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR=4
THEBE_LIVE_VOICE_MAX_SESSION_SECONDS=600
THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS=12000
THEBE_LIVE_VOICE_FAILURE_CIRCUIT_THRESHOLD=3
OPENAI_API_KEY=
```

`OPENAI_API_KEY` must be provided as a deployment secret. Never place a real key in source control or browser code.

For production, store the key in the GitHub `production` environment as the secret `OPENAI_API_KEY`. The governed production workflow forwards it into Wrangler's temporary secrets file only when configured; the key is never written to the repository. The production voice flag remains off until a separate activation release passes the promotion gate.

The default preview guardrails permit at most 6 session starts per workspace per hour and 4 per user per hour, cap a browser session at 10 minutes, abort an upstream session-creation request after 12 seconds, and temporarily stop new sessions after 3 recent provider/session failures in 10 minutes.

## Routes

- `GET /api/agentic/live/status`
- `POST /api/agentic/live/session`
- `POST /api/agentic/live/delegation`

All routes require an authenticated owner or manager. Mutating requests retain origin and CSRF checks.

## Browser behavior

The browser client is inert unless the server reports that live voice is enabled, configured and not paused by the agent runtime kill switch. When eligible, the Owner Command Centre receives a **Talk to Thebe** preview button.

The browser:

1. requests microphone access only after the user presses the button;
2. creates the WebRTC peer connection and `oai-events` data channel;
3. sends the SDP offer to Thebe's trusted server;
4. receives only the WebRTC answer/session metadata;
5. collects transcript deltas in bounded browser memory;
6. on `session.delegation.created`, sends the captured business request to the governed Thebe backend;
7. sends the verified backend result back to the live model with `session.commentary.append`.
8. suppresses a delegated result if newer user transcript arrives before the backend finishes, so stale work is not spoken as current.

## Promotion gate

Do not enable the production flag until:

- live session tests pass on current Chrome/Edge mobile and desktop;
- microphone permission denial/recovery is tested;
- rate/cost limits are accepted;
- delegated request grounding is reviewed;
- interruption semantics are tested;
- no API key or raw transcript leaks to browser logs;
- runtime kill switch blocks new sessions;
- 3-pass adversarial review passes.
