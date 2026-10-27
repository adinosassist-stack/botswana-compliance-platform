# AI Dock: revocation-aware private exports

**Scope:** unmounted server-side security candidate. This does not register API routes, configure storage, schedule cleanup, or enable customer exports.

A private export file can outlive an actor's permission to read its source conversation. A successful authorization **when creating the file** is not sufficient to release it later.

`createRevocationAwareAiExportStore({store,loadAuthorizedMessage})` wraps the tenant/actor-scoped private store and requires fresh saved-message authorization and matching SHA-256 document fingerprint:

- **get:** hides jobs when the actor no longer has access, the assistant message was deleted/changed or the loader fails.
- **complete:** rechecks current message access after rendering, before writing private bytes and completion metadata.
- **readPrivate:** checks authorization immediately before and again after private blob retrieval. It releases bytes only when both checks confirm the same source identity and document hash.

Use the merged `createAuthorizedAiExportMessageLoader` for the trusted source callback. It must derive conversation ACLs from the authenticated current workspace session and persisted tenant/message data, **not** from request body flags. The wrapper itself does not resolve sessions and cannot repair an untrusted upstream callback.

**Caveats:** this is not an atomic cross-system transaction. ACL revocation after the final check but before HTTP delivery still requires current session and response controls at the final HTTP boundary. A database snapshot version or revocation epoch, storage integrity and delete-on-revocation rules should be qualified separately. Stale file objects may remain stored until the independently reviewed lifecycle removes them, even though their downloads are denied.

Real staging qualification and independent review are required by [export launch gate #1868](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1868). Production exports remain off.

Local tests: `node --test tests/ai-export-revocation-aware-store.test.mjs`.
