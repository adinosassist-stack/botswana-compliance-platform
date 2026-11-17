// Owner-created opaque codes permit already registered users to request access
// to a different tenant. Codes never grant any membership or branch permissions.
import {hashManagerInviteToken} from './manager-invitations-foundation.js';
const guard=q=>`SELECT CASE WHEN (${q}) THEN 1 ELSE abs(-9223372036854775808) END AS permitted`;
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(x);
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
export async function createManagerRequestCodeD1(db,{tenantId,ownerId,locationId,cryptoApi=globalThis.crypto,now=Date.now()}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw TypeError('d1_binding_required');
 if(![tenantId,ownerId,locationId].every(valid))throw TypeError('invalid_scope');
 if(!cryptoApi?.getRandomValues||!cryptoApi?.subtle)throw Error('crypto_required');
 const bytes=new Uint8Array(32);cryptoApi.getRandomValues(bytes);
 const code=hex(bytes),codeHash=await hashManagerInviteToken(code,cryptoApi);
 const id=cryptoApi.randomUUID?.();if(!valid(id))throw Error('id_required');
 const expiresAt=new Date(now+48*60*60*1000).toISOString();
 await db.batch([
  db.prepare(guard("EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active') AND EXISTS(SELECT 1 FROM operating_locations WHERE tenant_id=? AND id=? AND active=1)")).bind(tenantId,ownerId,tenantId,locationId),
  db.prepare("INSERT INTO workspace_manager_request_codes(id,tenant_id,location_id,code_hash,created_by_user_id,expires_at) VALUES(?,?,?,?,?,?)").bind(id,tenantId,locationId,codeHash,ownerId,expiresAt)
 ]);
 return {ok:true,code,expiresAt,locationId};
}
export async function resolveManagerRequestCodeD1(db,{code,requesterUserId,cryptoApi=globalThis.crypto}={}){
 if(!db||typeof db.prepare!=='function')throw TypeError('d1_binding_required');
 if(!valid(requesterUserId))throw TypeError('invalid_requester');
 const hash=await hashManagerInviteToken(code,cryptoApi);
 const row=await db.prepare("SELECT c.tenant_id,c.location_id FROM workspace_manager_request_codes c JOIN operating_locations l ON l.id=c.location_id AND l.tenant_id=c.tenant_id AND l.active=1 JOIN memberships m ON m.tenant_id=c.tenant_id AND m.user_id=c.created_by_user_id AND m.role='owner' AND m.status='active' WHERE c.code_hash=? AND c.revoked_at IS NULL AND julianday(c.expires_at)>julianday('now') AND NOT EXISTS(SELECT 1 FROM memberships own WHERE own.tenant_id=c.tenant_id AND own.user_id=? AND own.role IN ('owner','manager')) LIMIT 1").bind(hash,requesterUserId).first();
 if(!valid(row?.tenant_id)||!valid(row?.location_id))throw Error('invalid_or_expired_business_code');
 return {tenantId:row.tenant_id,locationId:row.location_id,codeHash:hash};
}
