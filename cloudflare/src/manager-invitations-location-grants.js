// #2578 — candidate isolated branch-location permission service; NOT live.
// operating_locations IDs (not display labels) are the authorization boundary.
const requireDb=db=>{if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw new TypeError('d1_binding_required')};
const required=(...items)=>{if(items.some(x=>typeof x!=='string'||!x))throw new TypeError('invalid_identity')};
const denyGuard=sql=>`SELECT CASE WHEN (${sql}) THEN 1 ELSE abs(-9223372036854775808) END AS allowed`;
export async function grantManagerLocationD1(db,{tenantId,ownerId,managerId,locationId}={}){
 requireDb(db);required(tenantId,ownerId,managerId,locationId);
 if(ownerId===managerId)throw new TypeError('self_grant_forbidden');
 await db.batch([
  db.prepare(denyGuard("EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active') AND EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='manager' AND status='active') AND EXISTS(SELECT 1 FROM operating_locations WHERE tenant_id=? AND id=? AND active=1)")).bind(tenantId,ownerId,tenantId,managerId,tenantId,locationId),
  db.prepare("INSERT INTO workspace_manager_location_grants(tenant_id,manager_user_id,location_id,granted_by_user_id,status,revoked_at) VALUES(?,?,?,?,'active',NULL) ON CONFLICT(tenant_id,manager_user_id,location_id) DO UPDATE SET status='active',revoked_at=NULL,granted_by_user_id=excluded.granted_by_user_id").bind(tenantId,managerId,locationId,ownerId),
  db.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'manager_location_granted','operating_locations',?,'{}')").bind(tenantId,ownerId,locationId)
 ]);
 return {ok:true};
}
export async function revokeManagerLocationD1(db,{tenantId,ownerId,managerId,locationId}={}){
 requireDb(db);required(tenantId,ownerId,managerId,locationId);
 await db.batch([
  db.prepare(denyGuard("EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active') AND EXISTS(SELECT 1 FROM workspace_manager_location_grants WHERE tenant_id=? AND manager_user_id=? AND location_id=? AND status='active')")).bind(tenantId,ownerId,tenantId,managerId,locationId),
  db.prepare("UPDATE workspace_manager_location_grants SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND manager_user_id=? AND location_id=? AND status='active'").bind(tenantId,managerId,locationId),
  db.prepare("DELETE FROM sessions WHERE tenant_id=? AND user_id=?").bind(tenantId,managerId),
  db.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'manager_location_revoked','operating_locations',?,'{}')").bind(tenantId,ownerId,locationId)
 ]);
 return {ok:true};
}
export async function isManagerLocationAuthorized(db,{tenantId,managerId,locationId}={}){
 if(!db||typeof db.prepare!=='function')throw new TypeError('d1_binding_required');
 required(tenantId,managerId,locationId);
 const row=await db.prepare("SELECT 1 allowed FROM workspace_manager_location_grants g JOIN memberships m ON m.tenant_id=g.tenant_id AND m.user_id=g.manager_user_id AND m.role='manager' AND m.status='active' JOIN operating_locations l ON l.id=g.location_id AND l.tenant_id=g.tenant_id AND l.active=1 WHERE g.tenant_id=? AND g.manager_user_id=? AND g.location_id=? AND g.status='active' LIMIT 1").bind(tenantId,managerId,locationId).first();
 return row?.allowed===1;
}
