import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createQuotationCommercialPrivateStagingHost} from '../server/quotation-commercial-private-staging-host.mjs';
import {createQuotationCommercialStagingGateway} from '../server/quotation-commercial-staging-gateway.mjs';
import {quotationCustomSample} from '../public/js/quotation-customizable-page-model.mjs';
const tenant='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
const foreign='00000000-0000-4000-8000-000000000003',origin='https://quotation-commercial-staging.thebedesk.com';
const secret='synthetic-stage-only-secret-1234567890',rawCookie='synthetic-stage-cookie-with-no-real-secret',csrf='synthetic-csrf-token-123456';
async function hashCookie(cookie=rawCookie){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(cookie)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('offline')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'commercial-private-test',AUTH_DB:'commercial-private-auth'}}));
 try{
 const db=await mf.getD1Database('DB'),authDb=await mf.getD1Database('AUTH_DB');
 await db.exec("CREATE TABLE quotation_drafts(id TEXT PRIMARY KEY); INSERT INTO quotation_drafts VALUES('preserved'); CREATE TABLE quotation_logo_assets(id TEXT PRIMARY KEY); CREATE TABLE quotation_logo_settings(id TEXT PRIMARY KEY);");
 for(const path of ['docs/sql/quotation-commercial-staging-foundation-CANDIDATE.sql','cloudflare/migrations/049_v108_finance_receivables.sql','docs/sql/quotation-commercial-workflow-CANDIDATE.sql'])for(const sql of splitSqliteMigrationStatements(await readFile(path,'utf8')))await db.prepare(sql).run();
 for(const sql of splitSqliteMigrationStatements(await readFile('docs/sql/quotation-synthetic-auth-staging-candidate.sql','utf8')))await authDb.prepare(sql).run();
 await db.prepare('INSERT INTO tenants(id) VALUES(?)').bind(tenant).run();await db.prepare('INSERT INTO users(id) VALUES(?)').bind(user).run();
 await db.prepare("INSERT INTO finance_customers(id,tenant_id,name) VALUES('customer-1',?,'Synthetic customer')").bind(tenant).run();
 await authDb.prepare('INSERT INTO users(id) VALUES(?)').bind(user).run();await authDb.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").bind(tenant,user).run();
 const cookieHash=await hashCookie();await authDb.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,1,datetime('now','+10 minutes'))").bind(cookieHash,user,tenant,csrf).run();
 let assets=0,pdfs=0;
 const env={APP_ENV:'quotation-private-staging',QUOTATION_COMMERCIAL_STAGE_ENABLED:'true',QUOTATION_COMMERCIAL_STAGE_DB_ID:'aec227e9-b0f2-4b00-8de0-105465c4e2d6',QUOTATION_COMMERCIAL_STAGE_AUTH_DB_ID:'d7ad8e99-2ee4-446c-9358-0e186031571d',QUOTATION_COMMERCIAL_PRIVATE_ORIGIN:origin,QUOTATION_SYNTHETIC_TENANT_ID:tenant,QUOTATION_SYNTHETIC_SESSION_SECRET:secret,DB:db,AUTH_DB:authDb,ASSETS:{fetch:async()=>{assets++;return new Response('export const fixture=true;')}},QUOTATION_PDF_RENDERER:{fetch:async()=>{pdfs++;return new Response('%PDF-synthetic',{headers:{'content-type':'application/pdf','x-quotation-page-count':'2'}})}}};
 const host=createQuotationCommercialPrivateStagingHost({env});
 const req=(path,method='GET',body,extra={})=>new Request(origin+path,{method,headers:{cookie:'__Host-bw_session='+rawCookie,origin,'content-type':'application/json','x-csrf-token':csrf,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {mf,db,authDb,env,host,req,cookieHash,counts:()=>({assets,pdfs})};
 }catch(e){console.error('fixture failure:',e.message);await mf.dispose();throw e}
}
async function admissionFixture(){
 const f=await fixture(),ticket='quotation-test-'+Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),ticketHash=await hashCookie(ticket);
 await f.authDb.prepare('UPDATE sessions SET token_hash=? WHERE token_hash=?').bind(ticketHash,f.cookieHash).run();
 const admission=(body=new URLSearchParams({ticket}).toString(),headers={})=>new Request(origin+'/private/quotation-test-session',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/x-www-form-urlencoded',...headers},body});
 return {...f,ticket,ticketHash,admission};
}
test('one-use staging invitation becomes a distinct HttpOnly cookie without extending expiry',async()=>{
 const f=await admissionFixture();try{
  const form=await f.host.fetch(new Request(origin+'/private/quotation-test-session'));
  assert.equal(form.status,200);assert.match(form.headers.get('content-security-policy'),/form-action 'self'/);assert.doesNotMatch(await form.text(),new RegExp(f.ticket));
  assert.equal((await f.host.fetch(f.req('/api/auth/me','GET',undefined,{cookie:'__Host-bw_session='+f.ticket}))).status,401);
  const expiry=(await f.authDb.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').bind(f.ticketHash).first()).expires_at;
  const admitted=await f.host.fetch(f.admission());assert.equal(admitted.status,303);assert.equal(admitted.headers.get('location'),'/app/quotations/customer-ready/');
  const setCookie=admitted.headers.get('set-cookie');assert.match(setCookie,/; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=\d+$/);
  assert.ok(Number(setCookie.match(/Max-Age=(\d+)/)[1])<=600);assert.match(admitted.headers.get('cache-control'),/no-store/);
  const cookie=setCookie.split(';')[0];assert.notEqual(cookie.split('=')[1],f.ticket);
  const me=await f.host.fetch(f.req('/api/auth/me','GET',undefined,{cookie}));assert.equal(me.status,200);assert.equal((await me.json()).csrfToken,csrf);
  assert.equal((await f.authDb.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash=?').bind(f.ticketHash).first()).n,0);
  assert.equal((await f.authDb.prepare('SELECT expires_at FROM sessions').first()).expires_at,expiry);
  const replay=await f.host.fetch(f.admission());assert.equal(replay.status,401);assert.equal(replay.headers.get('set-cookie'),null);
  assert.equal((await f.host.fetch(f.admission(new URLSearchParams({ticket:cookie.split('=')[1]}).toString()))).status,401);
  assert.equal((await f.host.fetch(f.req('/api/auth/me','GET',undefined,{cookie}))).status,200);
 }finally{await f.mf.dispose()}
});
test('concurrent staging invitation redemption has exactly one winner',async()=>{
 const f=await admissionFixture();try{
  const responses=await Promise.all([f.host.fetch(f.admission()),f.host.fetch(f.admission())]);assert.deepEqual(responses.map(r=>r.status).sort(),[303,401]);
  assert.equal((await f.authDb.prepare('SELECT COUNT(*) n FROM sessions').first()).n,1);
  assert.equal(responses.filter(r=>r.headers.has('set-cookie')).length,1);
 }finally{await f.mf.dispose()}
});
test('staging invitation denies unsafe requests, non-owner or stale identity and foreign tenants without consumption',async()=>{
 const f=await admissionFixture();try{
  for(const request of [f.admission(undefined,{origin:''}),f.admission(undefined,{origin:'https://evil.test'}),f.admission(undefined,{'sec-fetch-site':'cross-site'})])assert.equal((await f.host.fetch(request)).status,403);
  for(const request of [f.admission(JSON.stringify({ticket:f.ticket}),{'content-type':'application/json'}),f.admission('ticket='+f.ticket+'&ticket='+f.ticket),f.admission('ticket='+f.ticket+'&extra=1'),f.admission('ticket='+'x'.repeat(1100)),f.admission(new Uint8Array([255])),f.admission('ticket=quotation-test-'+'a'.repeat(43))]){
   const r=await f.host.fetch(request);assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
  }
  for(const expiry of ['+20 minutes','-1 minute']){await f.authDb.prepare("UPDATE sessions SET expires_at=datetime('now',?)").bind(expiry).run();assert.equal((await f.host.fetch(f.admission())).status,401)}
  await f.authDb.prepare("UPDATE sessions SET expires_at=datetime('now','+10 minutes')").run();
  await f.authDb.prepare("UPDATE memberships SET role='staff'").run();assert.equal((await f.host.fetch(f.admission())).status,401);
  await f.authDb.prepare("UPDATE memberships SET role='owner',status='disabled'").run();assert.equal((await f.host.fetch(f.admission())).status,401);
  await f.authDb.prepare("UPDATE memberships SET status='active'").run();await f.authDb.prepare('UPDATE users SET session_generation=2').run();assert.equal((await f.host.fetch(f.admission())).status,401);
  await f.authDb.prepare('UPDATE users SET session_generation=1').run();
  const other=createQuotationCommercialPrivateStagingHost({env:{...f.env,QUOTATION_SYNTHETIC_TENANT_ID:foreign}});assert.equal((await other.fetch(f.admission())).status,401);
  const unavailable=createQuotationCommercialPrivateStagingHost({env:{...f.env,AUTH_DB:{prepare(){throw Error('private detail')}}}});const failure=await unavailable.fetch(f.admission());assert.equal(failure.status,401);assert.doesNotMatch(await failure.text(),/private detail/);
  assert.equal((await f.authDb.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash=?').bind(f.ticketHash).first()).n,1);
 }finally{await f.mf.dispose()}
});
test('complete schema sequence is compatible, additive and replay fails closed',async()=>{
 const f=await fixture();try{
 assert.equal((await f.db.prepare('SELECT id FROM quotation_drafts').first()).id,'preserved');
 const names=(await f.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(x=>x.name);
 for(const name of ['tenants','users','finance_customers','finance_invoices','quotation_company_banking','quotation_commercial_documents'])assert.ok(names.includes(name));
 await assert.rejects(f.db.prepare('CREATE TABLE tenants(id TEXT PRIMARY KEY)').run(),/already exists/);
 assert.equal((await f.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await f.mf.dispose()}
});
test('private host uses real HMAC sessions, customer schema, bank defaults and canonical invoice transaction',async()=>{
 const f=await fixture();try{
 const me=await f.host.fetch(f.req('/api/auth/me'));assert.equal(me.status,200);assert.equal((await me.json()).csrfToken,csrf);
 const html=await f.host.fetch(f.req('/app/quotations/customer-ready/'));assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);assert.doesNotMatch(await html.text(),new RegExp(csrf));
 const customers=await f.host.fetch(f.req('/api/finance/customers'));assert.equal((await customers.json()).items[0].name,'Synthetic customer');
 const bank={bankName:'FNB',accountHolder:'Synthetic company',accountNumber:'001234567',branch:'Synthetic branch',branchCode:'',paymentReference:''};
 assert.equal((await f.host.fetch(f.req('/api/quotation/banking','PUT',{revision:0,banking:bank}))).status,200);
 const draft=quotationCustomSample();Object.assign(draft,{quoteNumber:'DRAFT',customerName:'Synthetic buyer',customerPhone:'+26770000000'});draft.copy.bankAccount=bank.accountNumber;draft.copy.bankAccountHolder=bank.accountHolder;
 assert.equal((await f.host.fetch(f.req('/api/quotation/documents/q1','PUT',{revision:0,document:draft}))).status,200);
 assert.equal((await f.host.fetch(f.req('/api/quotation/documents/q1/issue','POST',{revision:1}))).status,200);
 const converted=await (await f.host.fetch(f.req('/api/quotation/documents/q1/convert','POST',{customerId:'customer-1',dueOn:'2026-12-30'}))).json();
 assert.equal((await f.host.fetch(f.req('/api/quotation/documents/'+converted.id+'/issue','POST',{revision:1}))).status,200);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM finance_invoices').first()).n,1);
 assert.equal((await f.host.fetch(f.req('/api/quotation/documents/q1/pdf'))).status,200);assert.equal(f.counts().pdfs,1);
 }finally{await f.mf.dispose()}
});
test('denies guests, foreign tenant, disabled membership, expiry, overlong sessions, revocation and CSRF',async()=>{
 const f=await fixture();try{
 assert.equal((await f.host.fetch(new Request(origin+'/api/auth/me'))).status,401);
 assert.equal((await f.host.fetch(f.req('/api/quotation/banking','PUT',{}, {'x-csrf-token':'wrong'}))).status,403);
 assert.equal((await f.host.fetch(f.req('/api/auth/me','GET',undefined,{origin:'https://evil.test'}))).status,403);
 const other=createQuotationCommercialPrivateStagingHost({env:{...f.env,QUOTATION_SYNTHETIC_TENANT_ID:foreign}});assert.equal((await other.fetch(f.req('/api/auth/me'))).status,401);
 await f.authDb.prepare("UPDATE sessions SET expires_at=datetime('now','+20 minutes')").run();assert.equal((await f.host.fetch(f.req('/api/auth/me'))).status,401);
 await f.authDb.prepare("UPDATE sessions SET expires_at=datetime('now','-1 minute')").run();assert.equal((await f.host.fetch(f.req('/api/auth/me'))).status,401);
 await f.authDb.prepare("UPDATE sessions SET expires_at=datetime('now','+10 minutes')").run();await f.authDb.prepare("UPDATE memberships SET status='disabled'").run();assert.equal((await f.host.fetch(f.req('/api/auth/me'))).status,401);
 await f.authDb.prepare("UPDATE memberships SET status='active'").run();await f.authDb.prepare('UPDATE users SET session_generation=2').run();assert.equal((await f.host.fetch(f.req('/api/auth/me'))).status,401);
 assert.deepEqual(f.counts(),{assets:0,pdfs:0});
 }finally{await f.mf.dispose()}
});
test('only allowlisted assets and owner sessions are exposed; defaults and production targets denied',async()=>{
 const f=await fixture();try{
 assert.equal((await f.host.fetch(f.req('/js/quotation-commercial-workspace.mjs'))).status,200);assert.equal(f.counts().assets,1);
 for(const path of ['/js/workspace-runtime-20261001b.js','/api/finance/transactions','/api/finance/invoices','/api/finance/customers/create'])assert.equal((await f.host.fetch(f.req(path))).status,404);
 await f.authDb.prepare("UPDATE memberships SET role='staff'").run();assert.equal((await f.host.fetch(f.req('/api/auth/me'))).status,403);
 for(const patch of [{QUOTATION_COMMERCIAL_STAGE_ENABLED:'false'},{APP_ENV:'production'},{QUOTATION_COMMERCIAL_STAGE_DB_ID:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'},{QUOTATION_COMMERCIAL_PRIVATE_ORIGIN:'https://thebedesk.com'},{QUOTATION_COMMERCIAL_PRIVATE_ORIGIN:'https://www.thebedesk.com'}])assert.throws(()=>createQuotationCommercialPrivateStagingHost({env:{...f.env,...patch}}));
 }finally{await f.mf.dispose()}
});
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function accessFixture(){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
 const now=Date.now(),claims={iss:'https://synthetic-team.cloudflareaccess.com',aud:['synthetic-audience'],sub:'synthetic-tester',iat:Math.floor(now/1000)-1,exp:Math.floor(now/1000)+300};
 async function token(patch={},headerPatch={}){const a=b64(JSON.stringify({alg:'RS256',kid:'test-key',...headerPatch})),b=b64(JSON.stringify({...claims,...patch}));return a+'.'+b+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(a+'.'+b)))}
 let calls=0,keyReads=0;
 const env={APP_ENV:'quotation-private-staging',QUOTATION_COMMERCIAL_GATEWAY_ENABLED:'true',QUOTATION_COMMERCIAL_PRIVATE_ORIGIN:origin,QUOTATION_ACCESS_TEAM_ORIGIN:claims.iss,QUOTATION_ACCESS_AUD:'synthetic-audience',COMMERCIAL:{fetch:async()=>{calls++;return new Response('private')}}};
 const gateway=createQuotationCommercialStagingGateway({env,now:()=>now,fetchImpl:async(url,options)=>{keyReads++;assert.equal(url,claims.iss+'/cdn-cgi/access/certs');assert.equal(options.redirect,'manual');return Response.json({keys:[jwk]})}});
 const req=t=>new Request(origin+'/api/auth/me',{headers:t?{'cf-access-jwt-assertion':t}:{}});
 return {env,gateway,token,req,counts:()=>({calls,keyReads}),now,jwk};
}
test('Access gateway accepts a signed token using the native Workers fetch boundary',async()=>{
 const f=await accessFixture();let calls=0,keyReads=0,keyStatus=200;
 const {COMMERCIAL,...bindings}=f.env;
 const script=await readFile('server/quotation-commercial-staging-gateway.mjs','utf8');
 // Use the same date supported by this repository's pinned workerd as the D1 fixtures.
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-03',
  script:script+'\nexport default {fetch(request,env){return createQuotationCommercialStagingGateway({env}).fetch(request)}};',bindings,
  serviceBindings:{COMMERCIAL:async()=>{calls++;return new Response('private')}},
  outboundService:async request=>{keyReads++;assert.equal(request.url,bindings.QUOTATION_ACCESS_TEAM_ORIGIN+'/cdn-cgi/access/certs');return Response.json({keys:[f.jwk]},{status:keyStatus,headers:keyStatus===200?{}:{location:'https://untrusted.example/certs'}})}
 }));
 try{
  const response=await mf.dispatchFetch(origin+'/api/auth/me',{headers:{'cf-access-jwt-assertion':await f.token()}});
  assert.equal(response.status,200);assert.equal(await response.text(),'private');assert.equal(calls,1);assert.equal(keyReads,1);
  for(const status of [301,302,303,307,308]){
   keyStatus=status;
   assert.equal((await mf.dispatchFetch(origin+'/api/auth/me',{headers:{'cf-access-jwt-assertion':await f.token()}})).status,404);
  }
  assert.equal(calls,1);assert.equal(keyReads,6); // No redirect target was fetched.
 }finally{await mf.dispose()}
});
test('Access gateway verifies real RSA signatures, exact issuer/audience/time and caches only public keys',async()=>{
 const f=await accessFixture(),valid=await f.token();
 assert.equal((await f.gateway.fetch(f.req(valid))).status,200);assert.equal((await f.gateway.fetch(f.req(valid))).status,200);assert.deepEqual(f.counts(),{calls:2,keyReads:1});
 for(const patch of [{iss:'https://evil.test'},{aud:['wrong']},{exp:Math.floor(f.now/1000)-1},{nbf:Math.floor(f.now/1000)+60},{iat:Math.floor(f.now/1000)+60}])assert.equal((await f.gateway.fetch(f.req(await f.token(patch)))).status,404);
 assert.equal((await f.gateway.fetch(f.req())).status,404);
 assert.equal((await f.gateway.fetch(f.req(await f.token({}, {alg:'none'})))).status,404);
 const parts=valid.split('.');parts[1]=b64(JSON.stringify({aud:['synthetic-audience'],iss:f.env.QUOTATION_ACCESS_TEAM_ORIGIN,exp:Math.floor(f.now/1000)+600}));assert.equal((await f.gateway.fetch(f.req(parts.join('.')))).status,404);assert.equal(f.counts().calls,2);
});
test('Access gateway remains disabled without approved configuration and denies key service outages',async()=>{
 const f=await accessFixture();
 for(const patch of [{QUOTATION_COMMERCIAL_GATEWAY_ENABLED:'false'},{APP_ENV:'production'},{QUOTATION_ACCESS_TEAM_ORIGIN:'https://evil.test'},{QUOTATION_COMMERCIAL_PRIVATE_ORIGIN:'https://thebedesk.com'},{QUOTATION_COMMERCIAL_PRIVATE_ORIGIN:'https://www.thebedesk.com'}])assert.throws(()=>createQuotationCommercialStagingGateway({env:{...f.env,...patch}}));
 const gateway=createQuotationCommercialStagingGateway({env:f.env,fetchImpl:async()=>new Response('',{status:503})});assert.equal((await gateway.fetch(f.req(await f.token()))).status,404);assert.equal(f.counts().calls,0);
});
test('review manifests are inert, isolated, secret-free and reserve no public route',async()=>{
 const paths=['deploy/quotation-commercial-private-staging/wrangler.review.jsonc','deploy/quotation-commercial-private-staging/gateway.review.wrangler.jsonc','deploy/quotation-final-html-private/commercial-review.wrangler.jsonc'];
 for(const path of paths){const source=await readFile(path,'utf8');const c=JSON.parse(source.replace(/\/\/[^\n]*/g,''));assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.deepEqual(c.routes,[]);assert.equal(c.vars.APP_ENV,'quotation-private-staging');assert.ok(Object.entries(c.vars).some(([k,v])=>k.endsWith('_ENABLED')&&v==='false'));assert.doesNotMatch(source,/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce|52a440f7213c1d81/);}
 const app=JSON.parse((await readFile(paths[0],'utf8')).replace(/\/\/[^\n]*/g,''));assert.equal(app.assets.run_worker_first,true);assert.equal(app.d1_databases.length,2);
 const schema=await readFile('docs/sql/quotation-commercial-workflow-CANDIDATE.sql');assert.equal(createHash('sha256').update(schema).digest('hex'),'df0bc67a27ea5c4efe2b6974941eff845287da3743f6f8cd2db4f69f7c3ffa24');
});
