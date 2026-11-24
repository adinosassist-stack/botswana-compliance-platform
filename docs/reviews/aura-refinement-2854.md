# Aura consolidated refinement — 24 November 2026

Tracks #2835 and #2735; source-only PR #2854. Botswana web first; APK expansion remains held.

## Acceptance and implementation

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Compact accessible voice controls | 20px SVG icons, 44px buttons, explicit names, mute pressed state, neutral focus cue | Chromium mute/unmute/end/restart and geometry assertions |
| Flat background, no boundary strokes | Black immersive surface, flat neutral composer, borderless answer and voice cards; orb glow retained | Computed background and mobile composer assertions |
| Existing spherical orb and reactivity | Original clipped spherical ribbon geometry; slower idle/ready luminosity flow; measured microphone/output energy and reduced motion retained | Input/output isolation, tilt, scale reset and reduced-motion assertions |
| Conversation history and live transcription | Named keyboard-reachable scrolling region, text log, one visible voice log with live and retained turns | Browser captions and reopen checks; completed-caption handler regression |
| Greeting and composer | Profile first/display/name fallback, no email greeting; flat wrapping composer; 80px orb under keyboard | Greeting and simulated visual-viewport checks |
| Clipping and redundant controls | Single-row header; hide expand and attention in Aura; distinct clear and close controls; 44px targets; scrollable body | 320/375/390/414/430/768/1024/1440px, landscape and short-height browser matrix |

The legacy voice dialog and emergency CSS recovery remain available when the healthy immersive surface is unavailable. Existing authenticated API, microphone permission, session, payment and entitlement boundaries remain unchanged.

## Verification

Fresh local checks: 52 Dock/navigation regression tests passed; Aura source invariants and completed-caption behavior passed; frontend syntax passed; bundle budget 534/534 passed. `git diff --check` passed.

Local Chromium could not launch because this execution environment denied socket creation. Browser assertions must pass in the PR's Dock composer CI before acceptance. That workflow saves layout screenshots keyed to the exact PR head, with seven-day retention. Screenshots cover the controlled browser fixture, not production or physical-phone acceptance. CI checkout/merge revision and PR source head are distinct evidence identities.

Physical microphone/speaker audio, permission prompts, Android keyboard behavior, native 200% zoom and authenticated production acceptance remain unverified. No claim of visual reference equivalence or live deployment is made.

## Persistence boundary

Text and completed voice turns remain bounded in page memory. Tests cover retained text/voice history after ending voice and closing/reopening Aura. Identity/company changes clear the conversation through the existing scope guard. A page reload or new session does not restore chat; durable cross-session history needs a separately designed authenticated storage/retention implementation. No browser transcript storage or backend transcript writes were added.

## Review and release

Independent thusico review, fresh exact-head CI and existing protected merge requirements remain mandatory. This PR does not authorize a production deployment or change its manifest. Separate exact-source production authorization and environment approval remain required.
