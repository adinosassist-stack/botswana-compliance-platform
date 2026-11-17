// Foundation for issue #2578. Not wired to production routes.
// Authenticated owner session, CSRF, origin and tenant membership MUST be verified by the caller.
// A manager invitation is NEVER an employee self-service invitation.
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MANAGER_INVITE_TTL_MS=48*60*60*1000;
export const MANAGER_INVITE_BRANCHES=Object.freeze(['Gaborone','Mahalapye','Palapye','Francistown','Maun']);
export function normalizeManagerEmail(value){
  if(typeof value!=='string') throw new TypeError('invalid_email');
  const email=value.trim().toLowerCase();
  if(email.length>254||!EMAIL.test(email))throw new TypeError('invalid_email');
  return email;
}
export function validateManagerInviteInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('invalid_input');
  // Whitelist fields. Role and tenant are determined only from server session.
  if(Object.keys(input).some(k=>!['email','branch'].includes(k)))throw new TypeError('unexpected_field');
  const email=normalizeManagerEmail(input.email);
  const branch=String(input.branch||'').trim();
  if(!MANAGER_INVITE_BRANCHES.includes(branch))throw new TypeError('invalid_branch');
  return Object.freeze({email,branch});
}
export function requireManagerInvitingOwner(identity){
  if(!identity||identity.role!=='owner'||identity.membershipStatus!=='active'||
    typeof identity.userId!=='string'||!identity.userId||
    typeof identity.tenantId!=='string'||!identity.tenantId)throw new Error('forbidden');
  return Object.freeze({tenantId:identity.tenantId,actorId:identity.userId});
}
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function hashManagerInviteToken(token,cryptoApi=globalThis.crypto){
  if(typeof token!=='string'||!(/^[a-f0-9]{64}$/.test(token)))throw new TypeError('invalid_token');
  if(!cryptoApi?.subtle)throw new Error('crypto_unavailable');
  const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}
export async function generateManagerInvite(cryptoApi=globalThis.crypto,now=Date.now()){
  if(!cryptoApi?.getRandomValues||!cryptoApi?.subtle)throw new Error('crypto_unavailable');
  if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid_time');
  const bytes=new Uint8Array(32);cryptoApi.getRandomValues(bytes);
  const token=hex(bytes);
  return Object.freeze({token,tokenHash:await hashManagerInviteToken(token,cryptoApi),
    expiresAt:new Date(now+MANAGER_INVITE_TTL_MS).toISOString()});
}
export function canConsumeManagerInvite(record,now=Date.now()){
  return Boolean(record&&record.status==='pending'&&record.usedAt==null&&
    Number.isFinite(Date.parse(record.expiresAt))&&Date.parse(record.expiresAt)>now);
}
// IMPORTANT: persistence must atomically consume the hashed token, and validate
// tenant ID, pending status and expiration in one transaction. Never store raw token.
// Do not activate a branch-scope permission before server-side authorization exists.
