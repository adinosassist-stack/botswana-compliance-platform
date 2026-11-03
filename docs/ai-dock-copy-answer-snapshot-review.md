# AI Dock copy-answer snapshot reliability

Read-only client UX fix: each response's Copy answer button captures the exact answer displayed when rendered. A later chat response cannot change what an earlier button copies. Clipboard-denied feedback is preserved.

No AI model, voice provider, chat storage, data access, routing, payments, feature flags, backend actions, authentication, deployment or production configuration is changed. This fixes a local closure lifetime problem only.

Run `node --test tests/ai-dock-copy-answer-snapshot.test.mjs`, the existing AI Dock and mobile browser regressions, and all required CI. Obtain independent `thusico` review before protected merge. Advanced exports and POP remain disabled pending separate release qualification.
