import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {createManagerInvitationD1Service} from '../cloudflare/src/manager-invitations-d1-service.js';
test('bridge requires a real D1 database binding and canonical password hash function',()=>{
 assert.throws(()=>createManagerInvitationD1Service({}),/d1_binding_required/);
 assert.throws(()=>createManagerInvitationD1Service({db:{batch(){},prepare(){}}}),/hash_password_required/);
});
test('bridge never accepts a fake password format',async()=>{
 const svc=createManagerInvitationD1Service({db:{batch(){throw Error('should_not_write')},prepare(){}},
  hashPassword:async()=> 'plaintext-hash',cryptoApi:webcrypto,clock:()=>1700000000000});
 const t='a'.repeat(64);
 await assert.rejects(()=>svc.activate({token:t,password:'this-is-a-secure-password'}),/invalid_password_hash/);
});
test('bridge rejects non-owner before D1 operations',async()=>{
 const svc=createManagerInvitationD1Service({db:{batch(){throw Error('should_not_write')},prepare(){}},
  hashPassword:async()=> 'pbkdf2$100000$abc$def',cryptoApi:webcrypto,clock:()=>1700000000000});
 await assert.rejects(()=>svc.issue({principal:{role:'manager',membershipStatus:'active',userId:'u',tenantId:'t'},input:{email:'a@example.com',branch:'Maun'}}),/forbidden/);
});
