// #2578 — isolated, unmounted owner-only manager access revocation.
// Use the authenticated session identity supplied by the canonical Worker.
// Do not accept tenantId or actorId from browser input.
const fail=code=>{throw new Error(code)};
const checkDb=db=>{if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw new TypeError('d1_binding_required')};
const guard=predicate=>`SELECT CASE WHEN (${predicate}) THEN 1 ELSE abs(-9223372036854775808) END AS authorized`;
export async function revokeManagerInviteD1(db,{tenantId,actorId,inviteId}={}){
 checkDb(db);
 if([tenantId,actorId,inviteId].some(v=>typeof v!=='string'||!v))fail('invalid_request');
 await db.batch([
  db.prepare(guard("EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active') AND EXISTS(SELECT 1 FROM workspace_manager_invites WHERE tenant_id=? AND id=? AND status='pending' AND accepted_at IS NULL)")).bind(tenantId,actorId,tenantId,inviteId),
  db.prepare("UPDATE workspace_manager_invites SET status='revoked' WHERE tenant_id=? AND id=? AND status='pending' AND accepted_at IS NULL").bind(tenantId,inviteId),
  db.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'manager_invitation_revoked','workspace_manager_invites',?,'{}')").bind(tenantId,actorId,inviteId)
 ]);
 return {ok:true};
}
export async function suspendManagerMembershipD1(db,{tenantId,actorId,managerUserId}={}){
 checkDb(db);
 if([tenantId,actorId,managerUserId].some(v=>typeof v!=='string'||!v)||actorId===managerUserId)fail('invalid_request');
 await db.batch([
  db.prepare(guard("EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active') AND EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='manager' AND status='active')")).bind(tenantId,actorId,tenantId,managerUserId),
  db.prepare("UPDATE memberships SET status='suspended' WHERE tenant_id=? AND user_id=? AND role='manager' AND status='active'").bind(tenantId,managerUserId),
  // Revoke existing sessions in this workspace immediately. Other tenant sessions remain untouched.
  db.prepare("DELETE FROM sessions WHERE tenant_id=? AND user_id=?").bind(tenantId,managerUserId),
  db.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'manager_membership_suspended','memberships',?,'{}')").bind(tenantId,actorId,managerUserId)
 ]);
 return {ok:true};
}
