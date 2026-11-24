// This is an account entitlement, never a tenant-wide allowance. Provisioning
// belongs to a separately approved production operation, not login or chat.
export const FOUNDER_AI_FEATURE="founder_ai_unmetered";
export const founderAiSubject=userId=>`founder_ai_subject:${userId}`;

export async function hasFounderAiEntitlement(env,tenantId,userId){
  if(!tenantId||!userId||!env?.DB)return false;
  const row=await env.DB.prepare(`SELECT 1 entitled FROM entitlement_overrides e
    JOIN memberships m ON m.tenant_id=e.tenant_id AND m.user_id=?
    JOIN users u ON u.id=m.user_id
    WHERE e.tenant_id=? AND e.feature_key=? AND e.enabled=1
      AND e.limit_value IS NULL AND e.expires_at IS NULL AND e.reason=?
      AND m.role='owner' AND m.status='active' LIMIT 1`)
    .bind(userId,tenantId,FOUNDER_AI_FEATURE,founderAiSubject(userId)).first();
  return !!row;
}
