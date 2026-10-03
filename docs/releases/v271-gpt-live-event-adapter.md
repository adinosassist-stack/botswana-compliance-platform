# V271 GPT-Live event adapter and evaluation gate

V271 advances the preview-only GPT-Live migration without switching production voice away from the qualified `gpt-realtime-2.1` runtime.

## Event adapter

- Understands GPT-Live `session.input_transcript.delta` and `session.output_transcript.delta` transcript fragments.
- Handles `session.delegation.created` only when the delegation target is `client`.
- Builds backend context from transcript fragments at or before the delegation timeline offset.
- Sends quiet progress through `session.thinking.append` and only sends a spoken `session.commentary.append` after the application callback marks the backend result `verified: true`.
- Suppresses an older result when a later user transcript occurs after the delegation offset; interruption does not imply that backend work or a prepared task was cancelled.
- Returns a safe no-confirmation message when the governed backend result cannot be verified.

## Least-privilege WebRTC data channel

The preview session explicitly restricts frontend client and server events. The browser can close, mute or unmute the session and append instructions, thinking or commentary. It does not receive arbitrary events and cannot start unmanaged Responses work from the frontend.

## Evaluation gate

The comparative evaluator records first-useful-response latency, interruption stop latency, task success, silence recovery, multilingual continuity, graceful provider failure and estimated cost for both the current Realtime runtime and GPT-Live candidate. A candidate can become `eligibleForReview` only after every measured gate passes with the configured minimum sample count. The evaluator always reports `productionSwitchAllowed: false`; production cutover still requires explicit human release approval.

## Production boundary

V271 does not route production traffic to GPT-Live and does not alter the existing production Realtime endpoint. The next step after qualification is an isolated preview session route/client connection followed by measured live comparison runs before any production promotion.
