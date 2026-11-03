# AI Dock — voice context navigation continuity

Read-only presentation improvement: the existing workspace-view synchronizer already updates the AI Dock context bar. It now also refreshes the active floating voice overlay's context label after a Workspace page change, so the visible voice context tracks the page the user is viewing. Switching to the public surface produces the existing public-only disclosure.

The change does not restart or stop voice, clear typed drafts, replace chat turns, persist transcripts, change server access, enable model execution, create a route, or perform any database or production action. No newly captured workspace data is sent to the voice provider by this UI update.

Run `node --test tests/ai-dock-voice-context-navigation.test.mjs` plus required Dock/Voice and mobile CI. Obtain independent `thusico` approval before protected merge. All launch and advanced-feature gates remain unchanged.
