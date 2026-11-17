import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {createManagerInvitationService} from '../cloudflare/src/manager-invitations-service.js';
const owner={role:'owner',membershipStatus:'active',userId:'u-owner',tenantId:'tenant-a'};
function fixture(){
  const invites=[],users=[],members=[],audits=[];
  let activeOwner=true,transactionCalls=0;
  const store={async transaction(fn){
    transactionCalls++;
    // This fake is for business-logic tests only. It does not prove SQL atomicity.
    return fn({
      activeOwner:async()=>activeOwner,
      hasActiveMember:async(t,e)=>members.some(m=>m.tenantId===t&&m.email===e),
      revokePending:async(t,e)=>{for(const x of invites)if(x.tenantId===t&&x.email===e&&x.status==='pending')x.status='revoked';},
      insertInvite:async v=>{const id='inv-'+(invites.length+1);invites.push({...v,id,status:'pending',usedAt:null});return id;},
      claimPendingToken:async hash=>invites.find(x=>x.tokenHash===hash&&x.status==='pending'),
      findUserByEmail:async e=>users.find(u=>u.email===e),
      createUser:async (email,passwordHash)=>{const id='user-'+(users.length+1);users.push({email,passwordHash,id});return id;},
      addMembership:async x=>{members.push(x);},
      completeInvite:async (id,userId)=>{const r=invites.find(x=>x.id===id);r.status='accepted';r.usedAt='now';r.userId=userId;},
      audit:async x=>{audits.push(x);}
    });
  }};
  const svc=createManagerInvitationService({store,cryptoApi:webcrypto,clock:()=>1700000000000,hashPassword:async p=>'hash-of-'+p});
  return {svc,invites,users,members,audits,setOwner:v=>activeOwner=v,count:()=>transactionCalls};
}
test('owner issues scoped invitation without creating a live user',async()=>{
 const f=fixture();const i=await f.svc.issue({principal:owner,input:{email:' A@EXAMPLE.COM ',branch:'Gaborone'}});
 assert.match(i.token,/^[a-f0-9]{64}$/);assert.equal(f.users.length,0);assert.equal(f.invites[0].email,'a@example.com');
 assert.equal(f.invites[0].tenantId,'tenant-a');assert.notEqual(f.invites[0].tokenHash,i.token);
});
test('stale owner and forged roles cannot invite',async()=>{
 const f=fixture();f.setOwner(false);
 await assert.rejects(()=>f.svc.issue({principal:owner,input:{email:'a@example.com',branch:'Maun'}}),/forbidden/);
 await assert.rejects(()=>f.svc.issue({principal:{...owner,role:'manager'},input:{email:'a@example.com',branch:'Maun'}}),/forbidden/);
 assert.equal(f.invites.length,0);
});
test('activation creates manager membership and blocks token replay',async()=>{
 const f=fixture();const i=await f.svc.issue({principal:owner,input:{email:'a@example.com',branch:'Maun'}});
 assert.equal((await f.svc.activate({token:i.token,password:'A-long-manager-passphrase'})).ok,true);
 assert.equal(f.members[0].role,'manager');assert.equal(f.members[0].tenantId,'tenant-a');assert.equal(f.audits.length,1);
 await assert.rejects(()=>f.svc.activate({token:i.token,password:'A-long-manager-passphrase'}),/invalid_or_expired_invite/);
});
test('existing user requires separate account-link proof, not password replacement',async()=>{
 const f=fixture();const i=await f.svc.issue({principal:owner,input:{email:'a@example.com',branch:'Maun'}});
 f.users.push({email:'a@example.com',passwordHash:'existing-secret',id:'old'});
 await assert.rejects(()=>f.svc.activate({token:i.token,password:'A-long-manager-passphrase'}),/existing_account_requires_linking/);
 assert.equal(f.users[0].passwordHash,'existing-secret');assert.equal(f.members.length,0);
});
