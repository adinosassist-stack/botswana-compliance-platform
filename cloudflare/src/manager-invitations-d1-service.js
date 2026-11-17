// #2578: D1 Worker-binding bridge, deliberately unmounted.
// Uses the canonical Worker hashPassword function passed in by its caller.
// Does not enable branch permissions, invite delivery, or production routes.
import {validateManagerInviteInput,requireManagerInvitingOwner,generateManagerInvite,hashManagerInviteToken} from './manager-invitations-foundation.js';
import {issueManagerInviteD1,activateManagerInviteD1} from './manager-invitations-d1.js';
const requireFn=(x,name)=>{if(typeof x!=='function')throw new TypeError(name+'_required');return x;};
export function createManagerInvitationD1Service({db,hashPassword,cryptoApi=globalThis.crypto,clock=()=>Date.now()}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw new TypeError('d1_binding_required');
 requireFn(hashPassword,'hash_password');
 requireFn(clock,'clock');
 return Object.freeze({
  async issue({principal,input}={}){
   const {tenantId,actorId}=requireManagerInvitingOwner(principal);
   const {email,branch}=validateManagerInviteInput(input);
   const invitation=await generateManagerInvite(cryptoApi,clock());
   const id=await issueManagerInviteD1(db,{tenantId,actorId,email,branch,
    tokenHash:invitation.tokenHash,expiresAt:invitation.expiresAt});
   return Object.freeze({id,token:invitation.token,expiresAt:invitation.expiresAt,branch});
  },
  async activate({token,password}={}){
   if(typeof password!=='string'||password.length<12||password.length>200)
    throw new TypeError('invalid_password');
   const tokenHash=await hashManagerInviteToken(token,cryptoApi);
   const passwordHash=await hashPassword(password);
   if(typeof passwordHash!=='string'||!/^pbkdf2\$100000\$/.test(passwordHash))
    throw new TypeError('invalid_password_hash');
   const result=await activateManagerInviteD1(db,{tokenHash,passwordHash,
    now:new Date(clock()).toISOString()});
   return Object.freeze({ok:result.ok===true});
  }
 });
}
