/** Authorization policy for private document export jobs. No rendering or storage. */
const validId = v => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
export function authorizeExportJob(job, identity, now) {
  if (identity?.authenticated !== true || identity?.workspaceMember !== true ||
      !validId(identity?.tenantId) || !validId(identity?.actorId))
    return {allowed:false,reason:"unauthorized"};
  if (!validId(job?.id) || !validId(job?.tenantId) || !validId(job?.actorId) ||
      job.tenantId !== identity.tenantId || job.actorId !== identity.actorId)
    return {allowed:false,reason:"not_found"};
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(job.expiresAt) || now >= job.expiresAt)
    return {allowed:false,reason:"expired"};
  return {allowed:true,reason:"authorized"};
}
export function authorizeExportDownload(job, identity, now) {
  const result = authorizeExportJob(job,identity,now);
  if (!result.allowed) return result;
  if (job.status !== "completed" || job.objectKey !== "ai-exports/" + job.tenantId + "/" + job.id)
    return {allowed:false,reason:"not_ready"};
  return result;
}
