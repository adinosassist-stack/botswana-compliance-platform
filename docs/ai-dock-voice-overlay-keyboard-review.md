# AI Dock voice overlay keyboard and session reopening — review only

The floating voice screen's Tab handler now excludes hidden controls, so collapsed voice options do not trap keyboard focus. It also ignores an empty set of visible controls. Opening a new voice screen session resets the mini-options panel to collapsed with a matching `aria-expanded=false`, while preserving existing microphone lifecycle, typed chat, draft and attachment state.

This is a client-only accessibility fix. No voice-provider change, model or token handling, transcript persistence, export enablement, bank/billing action, database operation, rollout toggle or production deployment.

Qualification: `node --test tests/ai-dock-voice-overlay-keyboard.test.mjs`, Voice/Dock CI, browser accessibility tests and exact-head required checks. Independent `thusico` approval is required. This PR does not qualify live voice or clear production release gates.
