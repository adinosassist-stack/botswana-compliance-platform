# AI Dock mobile composer viewport recalculation — review-only

The existing dock composer uses a 112px desktop height cap and a 96px mobile cap. A resized viewport or changed virtual-keyboard area previously updated dock geometry but could leave the composer with its old height until the next input event. This patch invokes the existing pure presentation height synchronizer from the established keyboard/viewport handler.

Draft text, attachments, conversation history, voice provider, active request and assistant mode are not reset. No new listeners, API endpoints, privileges, cross-tenant operations, model calls, database migrations, launch flags or production deployments.

Qualification: `node --test tests/ai-dock-mobile-composer-resize.test.mjs` alongside dock composer/browser, mobile startup and required CI. Exact-head independent `thusico` review before protected merge. POP, AI exports and production launch gates remain unchanged.
