import assert from 'node:assert/strict';
import test from 'node:test';
import {createManagerInvitationsHttp} from '../cloudflare/src/manager-invitations-http.js';
const origin='https://thebedesk.com';
const owner={role:'owner',membershipStatus:'active',userId:'owner',tenantId:'tenant'};
const calls=[];
const svc={issue:async args=>{calls.push(args);return {id:'x',token:'private'};},activate:async args=>{calls.push(args);return {ok:true};}};
const handler=opts=>createManagerInvitationsHttp({service:svc,authenticateOwner:async()=>owner,verifyCsrf:async()=>true,rateLimit:async()=>true,origin,...opts});
const req=(path,body,headers={},method='POST')=>new Request(origin+path,{method,headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('owner invitation succeeds only with vetted origin and CSRF',async()=>{
 const h=handler();const good=await h(req('/api/workspace/managers/invitations',{email:'X@EXAMPLE.COM',branch:'Maun'}));
 assert.equal(good.status,201);assert.equal(calls.at(-1).input.email,'x@example.com');
 assert.equal((await h(req('/api/workspace/managers/invitations',{email:'x@example.com',branch:'Maun'},{origin:'https://evil.invalid'}))).status,403);
 assert.equal((await handler({verifyCsrf:async()=>false})(req('/api/workspace/managers/invitations',{email:'x@example.com',branch:'Maun'}))).status,403);
 assert.equal((await handler({authenticateOwner:async()=>({...owner,role:'manager'})})(req('/api/workspace/managers/invitations',{email:'x@example.com',branch:'Maun'}))).status,403);
});
test('reject role spoofing and oversized payload before service call',async()=>{
 const h=handler(),n=calls.length;
 assert.equal((await h(req('/api/workspace/managers/invitations',{email:'x@example.com',branch:'Maun',role:'owner'}))).status,400);
 assert.equal((await h(req('/api/workspace/managers/invitations',{email:'x@example.com',branch:'Maun'},{'content-length':'99999'}))).status,413);
 assert.equal(calls.length,n);
});
test('activation is rate limited and does not disclose internal errors',async()=>{
 const p='/api/auth/manager-invite/accept', b={token:'aa',password:'twelvecharpassword'};
 assert.equal((await handler({rateLimit:async()=>false})(req(p,b))).status,429);
 const h=handler({service:{...svc,activate:async()=>{throw new Error('existing_account_requires_linking');}}});
 const res=await h(req(p,b));assert.equal(res.status,400);assert.equal((await res.json()).error,'invite_unavailable');
});
