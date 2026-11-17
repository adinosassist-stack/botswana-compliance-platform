// Issue #2578 isolated service layer. NOT mounted in production.
// Storage adapter must implement a REAL atomic database transaction; fail closed
// if invitation claim, new-user creation, and membership grant cannot commit together.
import {validateManagerInviteInput,requireManagerInvitingOwner,generateManagerInvite,hashManagerInviteToken,canConsumeManagerInvite} from './manager-invitations-foundation.js';
const fail=(code)=>{const e=new Error(code);e.code=code;throw e;};
function assertAdapter(store){
  if(!store||typeof store.transaction!=='function')fail('transaction_required');
}
export function createManagerInvitationService({store,cryptoApi=globalThis.crypto,clock=()=>Date.now(),hashPassword}={}){
  assertAdapter(store);
  if(typeof hashPassword!=='function')fail('password_hash_required');
  async function issue({principal,input}={}){
    const {tenantId,actorId}=requireManagerInvitingOwner(principal);
    const {email,branch}=validateManagerInviteInput(input);
    const now=clock();
    const invitation=await generateManagerInvite(cryptoApi,now);
    // The store MUST check the inviter's fresh active owner membership IN
    // the transaction, not trust the possibly stale session principal.
    const id=await store.transaction(async tx=>{
      if(!(await tx.activeOwner(tenantId,actorId)))fail('forbidden');
      if(await tx.hasActiveMember(tenantId,email))fail('member_already_active');
      await tx.revokePending(tenantId,email);
      return tx.insertInvite({
        tenantId,actorId,email,branch,tokenHash:invitation.tokenHash,
        expiresAt:invitation.expiresAt
      });
    });
    if(typeof id!=='string'||!id)fail('storage_invalid');
    // RAW TOKEN: return to authenticated owner only, never logs/DB/analytics.
    return Object.freeze({id,token:invitation.token,expiresAt:invitation.expiresAt,branch});
  }
  async function activate({token,password}={}){
    if(typeof password!=='string'||password.length<12||password.length>200)fail('invalid_password');
    const tokenHash=await hashManagerInviteToken(token,cryptoApi);
    const ph=await hashPassword(password);
    if(typeof ph!=='string'||!ph)fail('password_hash_invalid');
    const now=clock();
    // Atomic claim prevents double redemption and cross-tenant user association.
    // Existing user accounts must use an authenticated explicit membership-linking
    // procedure; never overwrite an existing user's password.
    const result=await store.transaction(async tx=>{
      const invite=await tx.claimPendingToken(tokenHash,new Date(now).toISOString());
      if(!invite||!canConsumeManagerInvite(invite,now))fail('invalid_or_expired_invite');
      if(await tx.findUserByEmail(invite.email))fail('existing_account_requires_linking');
      const userId=await tx.createUser(invite.email,ph);
      if(typeof userId!=='string'||!userId)fail('storage_invalid');
      await tx.addMembership({tenantId:invite.tenantId,userId,role:'manager',status:'active'});
      await tx.completeInvite(invite.id,userId);
      await tx.audit({tenantId:invite.tenantId,actorId:userId,action:'workspace_manager_invite_accepted'});
      return {userId};
    });
    return Object.freeze({ok:true,userId:result.userId});
  }
  return Object.freeze({issue,activate});
}
