import assert from 'node:assert/strict';
import {summarizeRecoveryLog,readRecoveryProviderFailure} from '../scripts/production-recovery-provider-log.mjs';
const synthetic={endpoint:'/emails',method:'POST',created_at:'2026-10-06T20:05:14Z',request_body:{to:['delivered@resend.dev'],subject:'Reset your Thebe Desk password',text:'PRIVATE_RESET_TOKEN'},response_status:403,response_body:{name:'validation_error',message:'PRIVATE_ADDRESS domain is not verified'}};
assert.deepEqual(summarizeRecoveryLog(synthetic),{status:403,error:'validation_error',reason:'domain'});
assert.equal(summarizeRecoveryLog({...synthetic,request_body:{...synthetic.request_body,to:['customer@example.com']}}),null);
assert.equal(summarizeRecoveryLog({...synthetic,method:'GET'}),null);
assert.equal(summarizeRecoveryLog({...synthetic,request_body:{...synthetic.request_body,to:['delivered@resend.dev','customer@example.com']}}),null);
assert.equal(summarizeRecoveryLog({...synthetic,response_body:{name:'PRIVATE_ERROR',message:'PRIVATE_TOKEN'}}).error,'unknown');
for(const [message,reason] of [['Daily quota exceeded','quota'],['Invalid from field','sender_format'],['API key is not authorized','key_permission'],['You can only send testing emails','testing_restriction']])assert.equal(summarizeRecoveryLog({...synthetic,response_body:{message}}).reason,reason);
assert.equal(summarizeRecoveryLog({...synthetic,response_status:200}).reason,'accepted');
const requests=[],id='11111111-1111-1111-1111-111111111111';
const fake=async(url,options)=>{
  requests.push({url,options});
  return new Response(JSON.stringify(url.endsWith('/logs')?{data:[{...synthetic,id}]}:synthetic));
};
const result=await readRecoveryProviderFailure({resendKey:'PRIVATE_KEY',since:'2026-10-06T20:05:00Z',fetchImpl:fake});
assert.deepEqual(result,{result:'synthetic_reset_send',status:403,error:'validation_error',reason:'domain'});
assert(!JSON.stringify(result).includes('PRIVATE'));
assert(requests.every(x=>x.options.method==='GET'&&x.options.redirect==='error'&&x.options.signal instanceof AbortSignal));
assert.equal(requests.length,2);
assert.deepEqual(await readRecoveryProviderFailure({resendKey:'key',since:'2026-10-06',fetchImpl:async()=>new Response('',{status:403})}),{result:'logs_unavailable',status:403});
await assert.rejects(readRecoveryProviderFailure({resendKey:'key',since:'invalid',fetchImpl:fake}),/time boundary/);
let pages=0;
const paginated=await readRecoveryProviderFailure({resendKey:'key',since:'2026-10-06T20:05:00Z',fetchImpl:async url=>{
  if(url.includes('/logs?after=')){pages++;return new Response(JSON.stringify({data:[{...synthetic,id}]}))}
  if(url.endsWith('/logs')){pages++;return new Response(JSON.stringify({has_more:true,data:[{id,created_at:'2026-10-06T20:06:00Z',endpoint:'/emails',method:'GET'}]}))}
  return new Response(JSON.stringify(synthetic));
}});
assert.equal(pages,2);
assert.equal(paginated.reason,'domain');
let boundedPages=0;
await readRecoveryProviderFailure({resendKey:'key',since:'2026-10-06T20:05:00Z',fetchImpl:async()=>{
  boundedPages++;return new Response(JSON.stringify({has_more:true,data:[{id:`${String(boundedPages).padStart(8,'0')}-1111-1111-1111-111111111111`,created_at:'2026-10-06T20:06:00Z',method:'GET'}]}));
}});
assert.equal(boundedPages,5);
console.log('PASS recovery provider diagnostic: bounded read-only requests, synthetic-only correlation and secret-free output');
