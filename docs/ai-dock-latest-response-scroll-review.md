# AI Dock — latest response shortcut scroll visibility

The resident AI Dock already observes reader scroll with a passive listener and keeps a "Latest response" button. Previously the scroll-state synchronizer updated its internal follow state but only explicitly *hid* the shortcut when near the bottom; it did not reveal the shortcut when a user scrolled upward.

This change calls the existing latest-response visibility helper on each eligible scroll update. The button appears when the reader is more than 96px above the latest content and disappears near the bottom or when the dock is hidden. Existing programmatic-scroll lock prevents flicker.

There are no new listeners, backend APIs, model calls, exports, voice-session changes, storage changes, bank/payment operations, migrations or production deployments.

Run `node --test tests/ai-dock-latest-response-scroll.test.mjs`, existing dock browser and narrow-mobile tests, then all required CI. Require independent `thusico` approval before protected merge; launch security gates remain unchanged.
