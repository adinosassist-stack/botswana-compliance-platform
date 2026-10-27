# AI Dock export — persisted-source authorization contract

**Status:** Unmounted candidate; no customer export route or production feature activation.

The AI export service already checks authenticated tenant/actor identity, but the injected `loadMessage` callback must independently prove the answer is a saved, completed assistant response in a conversation the actor can currently read. Do not interpret a browser-supplied `conversationId` or `messageId` as permission.

`createAuthorizedAiExportMessageLoader` requires four **trusted server-side** callbacks:

1. `readConversation({tenantId,conversationId})` — retrieve a tenant-scoped persisted record exposing `id, tenantId`. Deleted records are denied.
2. `canReadConversation({tenantId,actorId,conversationId,conversation})` — check current session role, workspace membership and row-level access. It must return **literal true**; expired/revoked roles must deny.
3. `readMessage({tenantId,conversationId,messageId})` — retrieve a persisted row exposing `id,tenantId,conversationId,role,isFinal`. Only completed assistant messages are eligible; deleted/streaming/user/system rows deny.
4. `documentForMessage({tenantId,actorId,conversation,message})` — construct a bounded structured document using persisted trusted content, **never user-supplied raw request body content**. Document is validated before hashing.

A SHA-256 fingerprint is generated from the validated document model, after successful authorization. It binds the export job to the serialized model; it does not provide a digital signature or prove that upstream persisted messages were free of tampering.

The helper returns `null` on invalid records, unauthorized access, exceptions or malformed content without revealing storage errors. Call the helper only via a trusted server-side composition after the independent review and separate staging tests. Do not register any HTTP endpoint until the release gate is complete.

**Required for activation:** Map the four callbacks to *actual* production session/tenant records, test tenant transfers and session revocation, recheck authorization during download, verify durable job metadata, independently qualify D1 and private R2, and obtain reviewed rollout approval. Follow issue #1868.

Run local tests: `node --test tests/ai-export-authorized-message-loader.test.mjs`.
