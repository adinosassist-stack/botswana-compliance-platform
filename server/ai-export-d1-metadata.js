/** Candidate private AI export-job metadata persistence for Cloudflare D1.
 * Not imported into any runtime, route, worker or migration.
 * Provision the reviewed schema separately before explicit use.
 */
const validId = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value);
const asJob = row => row ? {
  id: row.id,
  tenantId: row.tenant_id,
  actorId: row.actor_id,
  conversationId: row.conversation_id,
  messageId: row.message_id,
  contentHash: row.content_hash,
  format: row.format,
  documentType: row.document_type,
  status: row.status,
  objectKey: row.object_key ?? null,
  createdAt: row.created_at,
  expiresAt: row.expires_at
} : null;
export function createAiExportD1Metadata({db, clock = () => Date.now(), makeId = () => crypto.randomUUID()} = {}) {
  if (!db || typeof db.prepare !== "function" || typeof clock !== "function" || typeof makeId !== "function")
    throw new TypeError("private_d1_metadata_dependencies_required");
  return Object.freeze({
    async insert(input) {
      const id = makeId();
      if (!validId(id) || !validId(input?.tenantId) || !validId(input?.actorId) ||
          !validId(input?.conversationId) || !validId(input?.messageId) ||
          !/^[a-f0-9]{64}$/.test(input?.contentHash || "") ||
          !["pdf", "docx", "pptx"].includes(input?.format) ||
          !validId(input?.documentType) ||
          !Number.isSafeInteger(input?.createdAt) || !Number.isSafeInteger(input?.expiresAt) ||
          input.expiresAt <= clock() || input.expiresAt <= input.createdAt)
        throw new Error("invalid_private_export_metadata");
      const sql = "INSERT INTO ai_document_export_jobs (id, tenant_id, actor_id, conversation_id, message_id, content_hash, format, document_type, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)";
      const result = await db.prepare(sql).bind(id, input.tenantId, input.actorId,
        input.conversationId, input.messageId, input.contentHash, input.format,
        input.documentType, input.createdAt, input.expiresAt).run();
      if (result?.success !== true || result?.meta?.changes !== 1)
        throw new Error("private_export_metadata_write_failed");
      return { ...input, id, status: "queued", objectKey: null };
    },
    async find({id, tenantId, actorId} = {}) {
      if (!validId(id) || !validId(tenantId) || !validId(actorId)) return null;
      const sql = "SELECT id, tenant_id, actor_id, conversation_id, message_id, content_hash, format, document_type, status, object_key, created_at, expires_at FROM ai_document_export_jobs WHERE id = ? AND tenant_id = ? AND actor_id = ? LIMIT 1";
      const row = await db.prepare(sql).bind(id, tenantId, actorId).first();
      const job = asJob(row);
      return job?.id === id && job?.tenantId === tenantId && job?.actorId === actorId ? job : null;
    },
    async complete({id, tenantId, actorId, objectKey, status} = {}) {
      if (!validId(id) || !validId(tenantId) || !validId(actorId) ||
          objectKey !== "ai-exports/" + tenantId + "/" + id || status !== "completed")
        throw new Error("invalid_private_export_completion");
      const sql = "UPDATE ai_document_export_jobs SET status = 'completed', object_key = ? WHERE id = ? AND tenant_id = ? AND actor_id = ? AND status = 'queued' AND expires_at > ?";
      const result = await db.prepare(sql).bind(objectKey, id, tenantId, actorId, clock()).run();
      if (result?.success !== true || result?.meta?.changes !== 1)
        throw new Error("private_export_metadata_conflict");
    },
    async listExpired({before, limit = 50} = {}) {
      if (!Number.isSafeInteger(before) || before < 0 ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error("invalid_retention_scan");
      const sql = "SELECT id, tenant_id, actor_id, conversation_id, message_id, content_hash, format, document_type, status, object_key, created_at, expires_at FROM ai_document_export_jobs WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT ?";
      const result = await db.prepare(sql).bind(before, limit).all();
      if (result?.success !== true || !Array.isArray(result.results) || result.results.length > limit)
        throw new Error("invalid_retention_scan_results");
      return result.results.map(asJob);
    }
  });
}
