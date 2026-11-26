# Thebe AI consolidated repair qualification — 26 November 2026

Tracks #2735. Base: `86cdb601c016f61a27d50892875873f9f5f54c78`.

This is source and PR preparation. It does not authorize a protected merge, deployment, resource change, credential use, entitlement change or production write. APK expansion remains held. Independent thusico review and all existing CI/BF-07 and release gates remain mandatory.

## Implemented source repairs

| Requirement | Change | Evidence / status |
| --- | --- | --- |
| Final simplified blue orb | Replace dominant SVG ribbon/curves with a midnight-blue sphere, thin cyan rim and subtle internal illumination; center the soft halo and use charcoal immersive background | Updated source invariants pass. Browser rendering and owner comparison pending. Existing compact/recovery visual surfaces are not certified by this change. |
| Audio-responsive animation | Preserve microphone/output level events and energy scaling; idle/thinking/listening illumination and reduced-motion rules remain | Source invariants pass. Real microphone/output acceptance pending. |
| No duplicate voice startup | Set connecting state before awaiting the availability gate; include gate rejection in cleanup | Four deterministic tests prove single request, cancellation, denial cleanup and intentional retry. Provider rejection root cause is not established by this fix. |
| Relevant ordinary chat | Route standalone greetings, capability questions and general business education to general AI when existing flags are enabled and no private conversation context exists | Routing tests pass, including mixed/private requests and disabled flags. Flags unchanged. Follow-ups retain existing authorized workspace route. |
| Compact ordinary answers | Omit Goal/Evidence/Plan and Open workspace AI from general/research rendering; preserve answer copy and follow-up | Renderer behavior tests pass. Presentation is selected by the client call site; provider fields cannot suppress workspace governance. |
| Practical Workspace AI advice | Extend the existing ask-mode provider contract to request a recommendation, rationale, up to three next steps, explicit assumptions and one focused missing-input question | Prompt contract and SQLite advisor/planner integration pass. This is not a live model-quality evaluation. No new advice module or channel. |
| Consolidated verification | Add new regression tests to existing Dock composer CI; update old control tests to match the pre-existing single voice composer | 112 integrated local tests pass. Existing browser CI runs the modified assets and captures Aura screenshots. |

## Fresh local verification

- `node --test tests/ai-dock*.test.mjs tests/general-ai-route.test.mjs tests/general-ai-owner-routing.test.mjs tests/general-ai-model-provider.test.mjs tests/general-ai-search-provider.test.mjs tests/ai-advisor-business-guidance.test.mjs`: 112 passed, 0 failed.
- `node tests/thebe-aura-fullscreen.mjs`: source invariants and completed-caption behavior passed.
- `node tests/v101-gpt-live-voice-foundation.mjs`: passed.
- `node --no-warnings tests/ai-advisor-planner-integration.mjs`: actual SQLite integration passed.
- `node --no-warnings tests/advisor-attachments-integration.mjs`: authenticated attachment review, bounded conversion, replay identity and failure refunds passed.
- `node scripts/frontend-syntax-test.mjs`: passed.
- `npm run check:bundle-budget`: 534/534 passed.
- JavaScript syntax and `git diff --check`: passed.

## Remaining acceptance gates

Local Chromium wrapper exists but its executable is absent. Playwright browser installation was attempted and failed with HTTP 403. Browser acceptance must use repository CI or an available approved browser; no screenshot or browser pass is claimed locally.

Hosted provider/microphone playback, session end/restart, signed-in owner/manager/employee paths, physical Android keyboard/zoom, public/authenticated parity, cross-session/device history, founder entitlement and live release/cache identity remain unverified by this patch. Existing isolated staging provisioning and live test authorization is subject to independent protection; do not bypass it to claim that only code review remains.

The original full experience request also includes streaming, dictation, read aloud/share, archived chats and wider Dock controls. This patch does not establish those features as complete. Inspect/reuse their current implementations and qualify remaining gaps in this same consolidated PR. Do not create fragmented PRs or label the entire experience complete on the strength of the focused fixes above.
