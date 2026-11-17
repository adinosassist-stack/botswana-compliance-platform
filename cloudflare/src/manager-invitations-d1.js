// #2578: direct D1 Worker-binding adapter candidate, not wired or deployed.
// D1Database.batch() is transactional; a failed SQL guard aborts the entire batch.
// DO NOT use the REST D1 /query endpoint in place of the Worker binding.
const guard = predicate => `SELECT CASE WHEN (${predicate}) THEN 1 ELSE abs(-9223372036854775808) END AS authorized`;
const ensureDb=db=>{if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw new TypeError('d1_binding_required');};
const uuid=()=>crypto.randomUUID();
export async function issueManagerInviteD1(db,{tenantId,actorId,email,branch,tokenHash,expiresAt,id=uuid()}){
  ensureDb(db);
  if([tenantId,actorId,email,branch,tokenHash,expiresAt,id].some(x=>typeof x!=='string'||!x))throw new TypeError('invalid_invite');
  await db.batch([
    db.prepare(guard(`EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active') AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.status='active' AND lower(u.email)=lower(?))`)).bind(tenantId,actorId,tenantId,email),
    db.prepare("UPDATE workspace_manager_invites SET status='revoked' WHERE tenant_id=? AND lower(email)=lower(?) AND status='pending'").bind(tenantId,email),
    db.prepare("INSERT INTO workspace_manager_invites(id,tenant_id,email,branch_name,token_hash,expires_at,invited_by_user_id) VALUES(?,?,?,?,?,?,?)").bind(id,tenantId,email,branch,tokenHash,expiresAt,actorId)
  ]);
  return id;
}
export async function activateManagerInviteD1(db,{tokenHash,passwordHash,userId=uuid(),now=new Date().toISOString()}){
  ensureDb(db);
  if(!/^[a-f0-9]{64}$/.test(tokenHash)||typeof passwordHash!=='string'||!/^pbkdf2\$100000\$/.test(passwordHash)||!userId||!Number.isFinite(Date.parse(now)))throw new TypeError('invalid_activation');
  // Guard all conditions inside same D1 batch; zero-row UPDATE alone is NOT a rollback.
  const valid=`EXISTS(SELECT 1 FROM workspace_manager_invites i WHERE i.token_hash=? AND i.status='pending' AND i.accepted_at IS NULL AND julianday(i.expires_at)>julianday(?))`;
  const noUser=`NOT EXISTS(SELECT 1 FROM users u JOIN workspace_manager_invites i ON lower(i.email)=lower(u.email) WHERE i.token_hash=?)`;
  await db.batch([
    db.prepare(guard(`${valid} AND ${noUser}`)).bind(tokenHash,now,tokenHash),
    db.prepare("INSERT INTO users(id,email,password_hash,onboarding_complete) SELECT ?,email,?,1 FROM workspace_manager_invites WHERE token_hash=? AND status='pending' AND accepted_at IS NULL AND julianday(expires_at)>julianday(?)").bind(userId,passwordHash,tokenHash,now),
    db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) SELECT tenant_id,?,'manager','active' FROM workspace_manager_invites WHERE token_hash=? AND status='pending' AND accepted_at IS NULL AND julianday(expires_at)>julianday(?)").bind(userId,tokenHash,now),
    db.prepare("UPDATE workspace_manager_invites SET status='accepted',accepted_by_user_id=?,accepted_at=? WHERE token_hash=? AND status='pending' AND accepted_at IS NULL AND julianday(expires_at)>julianday(?)").bind(userId,now,tokenHash,now),
    db.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) SELECT tenant_id,?,'manager_invitation_accepted','workspace_manager_invites',id,'{}' FROM workspace_manager_invites WHERE token_hash=? AND status='accepted' AND accepted_by_user_id=?").bind(userId,tokenHash,userId)
  ]);
  return {ok:true,userId};
}
