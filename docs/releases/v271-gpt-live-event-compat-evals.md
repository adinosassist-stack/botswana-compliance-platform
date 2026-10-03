# V271 — GPT-Live event compatibility and comparative evaluation

V271 advances the guarded GPT-Live preview introduced in V270. It still does not switch production voice traffic away from the qualified Realtime runtime.

## Event compatibility

The preview runtime now has pure event adapters for the GPT-Live WebRTC data-channel contract:

- `session.started` and `session.updated`
- `session.input_transcript.delta`
- `session.output_transcript.delta`
- `session.delegation.created`
- `session.usage.updated`
- `session.commentary.appended`
- `session.thinking.appended`
- `session.instructions.appended`
- `error`

The adapters keep GPT-Live protocol details outside the existing production client until promotion criteria are met.

## Governed backend handoff

Client delegation remains the required preview mode. Thebe may return backend progress with `session.thinking.append` and verified user-facing results with `session.commentary.append`.

V271 adds an application guard: a terminal delegation result (`completed`, `failed`, or `cancelled`) cannot be emitted as spoken commentary unless it is explicitly marked verified by the calling backend path. This does not replace Thebe's existing permission and approval checks; it prevents the voice layer from getting ahead of them.

Trusted session-wide corrections can be represented with `session.instructions.append` and `delegation_id: null`.

## Comparative telemetry

The preview now defines normalized evaluation samples for:

- connection latency
- first input transcript latency
- delegation creation latency
- first useful answer latency
- interruption count
- delegation count
- provider failure count
- session duration

Realtime and GPT-Live samples can be compared without declaring a winner in production code. Promotion remains a separate release decision after real-session evidence is available.

## Production invariant

`cloudflare/src/agentic-live-voice.js` remains on `gpt-realtime-2.1` and `/v1/realtime/calls`. The GPT-Live preview remains double opt-in and `productionSwitchAllowed:false`.

## Qualification

The V271 CI gate runs:

1. syntax validation for the preview runtime,
2. the V270 migration-foundation test,
3. the new event/telemetry adversarial test, and
4. the existing V101 production Realtime guard.

The next step is an isolated preview transport integration that feeds these normalized events into the existing Thebe dock while keeping the current production route as immediate fallback. A real provider session should only be enabled after OpenAI project access/billing is confirmed.
