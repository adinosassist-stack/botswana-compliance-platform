# Work board integration contract (not yet activated)

The new `work-board-readonly.js` and `work-board-renderer.js` modules are **not automatically mounted** in the live Work page. They require a separately reviewed integration with the existing People/employee task API.

## Safe integration
1. Authenticate an owner or manager using the existing workspace session, CSRF and origin controls.
2. Fetch employee task records through an **existing authorized tenant-scoped endpoint**. Do not accept a tenant ID from a browser input or query string.
3. Server must enforce tenant scope and role before returning tasks. Include only `id`, `title`, `status`, `dueDate` and a server-asserted `tenantId`. Adapt snake_case fields on the trusted client boundary only.
4. Call `buildWorkBoard({tasks, tenantId, today})` with the authenticated server tenant and a validated ISO calendar date.
5. Call `renderWorkBoard(container, board)` only after authorization and validation succeed. If any task fails validation, show a safe error and no partial board.
6. Load `/assets/work-board-readonly.css` in the approved workspace shell; test 320px, 375px, 620px and desktop.
7. Task transitions stay in the existing protected manager/staff routes. Do not add drag-and-drop writes, owner-approval shortcuts, or automatic dispatch.

## Unverified prerequisites
- Exact production API path, payload schema and feature flag for employee task reads
- Owner/manager authorization and session behavior in the deployed Worker
- Whether the staff portal is enabled in any production environment
- Accessibility and authenticated browser acceptance
- Exact-main merge and production release qualification

## Verification commands
```sh
node --test tests/work-page-preview-contract.test.mjs tests/work-board-readonly.test.mjs
node --check public/js/work-board-readonly.js
node --check public/js/work-board-renderer.js
```

Do not mark any of these checks passing without actual command or CI evidence. No production database migration, deployment or activation is authorized by this document.
