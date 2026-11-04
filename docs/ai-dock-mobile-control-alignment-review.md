# Thebe AI Dock — mobile composer controls

This CSS-only, default-on presentation correction keeps the existing composer controls aligned on narrow mobile screens. Four possible actions (file attachment, microphone, conversation voice, Send) use bounded 38px widths and 42px vertical targets. The text area remains shrinkable without clipping or overlapping the adjacent actions.

A direct `[hidden]` override ensures the composer respects DOM visibility selected by the established `syncComposerState` logic despite the dock's author-level `display:inline-flex` rules. It does not change control order, events, authenticated context, attachment limits or public/workspace boundary.

Review-only; no runtime JS, routes, API, models, voice permissions, DB writes, payments, migrations, export enablement, or production deployment. Run `node --test tests/ai-dock-mobile-controls-alignment.test.mjs`, Dock Composer browser CI (narrow viewport and file/speech/send switching), and required checks. Independent `thusico` approval before protected merge. Existing launch gates stay unchanged.
