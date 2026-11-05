import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPopHttpStagingEntry} from '../cloudflare/src/payment-pop-http-staging-entry.js';
const origin='https://pop-staging.thebedesk.com';
const env={APP_ENV:'staging',DEPLOYMENT_PROFILE:'pop-http-staging',PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin,
 POP_HTTP_STAGING_D1_ID:'812f9021-890b-41e6-8fa1-6001f90a9b53',POP_HTTP_STAGING_SOURCE_SHA:'a'.repeat(40)};
test('isolated wrapper refuses production, wrong DB, origin, alias, billing mutations and unknown routes before delegation',async()=>{
 let calls=0;const entry=createPopHttpStagingEntry({fetch:async()=>{calls++;return Response.json({})}});
 for(const patch of [{APP_ENV:'production'},{POP_HTTP_STAGING_D1_ID:'production'},{PUBLIC_APP_URL:'https://thebedesk.com'},{POP_HTTP_STAGING_SOURCE_SHA:''}])assert.equal((await entry.fetch(new Request(origin+'/api/auth/me'),{...env,...patch})).status,503);
 for(const [path,method] of [['/api/payments/manual-bank/submit','POST'],['/api/platform/billing/subscriptions','POST'],['/api/ai/advisor','POST'],['/api/state','GET'],['/?__thebe_api_path=/api/auth/me','GET']])assert.equal((await entry.fetch(new Request(origin+path,{method}),env)).status,403);
 assert.equal(calls,0);
});
test('allowlisted authenticated API delegates with disabled billing, AI and unrelated capabilities',async()=>{
 let runtime;const entry=createPopHttpStagingEntry({fetch:async(_req,e)=>{runtime=e;return Response.json({ok:true})}});
 const response=await entry.fetch(new Request(origin+'/api/platform/billing/pop/scan',{method:'POST'}),{...env,OPENAI_API_KEY:'must-not-pass',PAYMENT_PROVIDER:'live',THEBE_GENERAL_AI_ENABLED:'true'});
 assert.equal(response.status,200);assert.equal(runtime.PAYMENT_PROVIDER,'none');assert.equal(runtime.THEBE_GENERAL_AI_ENABLED,'false');assert.equal(runtime.OPENAI_API_KEY,undefined);
 assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-thebe-pop-staging-source'),'a'.repeat(40));
});
