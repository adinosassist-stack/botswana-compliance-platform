// PRIVATE STAGING candidate: explicit second-step provisioning of a reviewed access request.
// Owner approval alone cannot grant privileges. Never mount in production.
const guard=q=>`SELECT CASE WHEN (${q}) THEN 1 ELSE abs(-9223372036854775808) END AS authorized`;
const valid=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(x);
export async function provisionManagerAccessD1(db,{tenantId,ownerId,requestId}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw TypeError('d1_binding_required');
 if(![tenantId,ownerId,requestId].every(valid))throw TypeError('invalid_identity');
 // SQL guard and mutation execute atomically. Request ID, tenant and fresh owner
 // membership are checked inside the same D1 batch.
 const request=await db.prepare("SELECT requester_user_id,location_id FROM workspace_manager_access_requests WHERE tenant_id=? AND id=? AND status='approved_for_provisioning'").bind(tenantId,requestId).first();
 if(!request||!valid(request.requester_user_id)||!valid(request.location_id)||request.requester_user_id===ownerId)
  throw Error('not_approved_for_provisioning');
 const userId=request.requester_user_id,locationId=request.location_id;
 const eligible=`EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role='owner')
  AND EXISTS(SELECT 1 FROM users WHERE id=?) AND (NOT EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=?) OR EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('reviewer','auditor')))
  AND EXISTS(SELECT 1 FROM workspace_manager_access_requests WHERE tenant_id=? AND id=? AND requester_user_id=? AND location_id=? AND status='approved_for_provisioning')
  AND EXISTS(SELECT 1 FROM operating_locations WHERE tenant_id=? AND id=? AND active=1)`;
 await db.batch([
  db.prepare(guard(eligible)).bind(tenantId,ownerId,userId,tenantId,userId,tenantId,userId,tenantId,requestId,userId,locationId,tenantId,locationId),
  db.prepare("UPDATE memberships SET role='manager' WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('reviewer','auditor')").bind(tenantId,userId),
  db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) SELECT ?,?,'manager','active' WHERE NOT EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=?)").bind(tenantId,userId,tenantId,userId),
  db.prepare("INSERT INTO workspace_manager_location_grants(tenant_id,manager_user_id,location_id,granted_by_user_id,status,revoked_at) VALUES(?,?,?,?,'active',NULL) ON CONFLICT(tenant_id,manager_user_id,location_id) DO UPDATE SET status='active',revoked_at=NULL,granted_by_user_id=excluded.granted_by_user_id").bind(tenantId,userId,locationId,ownerId),
  db.prepare("UPDATE workspace_manager_access_requests SET status='provisioned' WHERE tenant_id=? AND id=? AND requester_user_id=? AND status='approved_for_provisioning'").bind(tenantId,requestId,userId),
  db.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId),
  db.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'manager_access_request_provisioned','workspace_manager_access_requests',?,'{}')").bind(tenantId,ownerId,requestId)
 ]);
 return Object.freeze({ok:true,status:'provisioned',managerActive:true,reauthenticationRequired:true});
}
