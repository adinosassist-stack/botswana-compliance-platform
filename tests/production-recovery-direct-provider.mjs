import assert from 'node:assert/strict';
import {probeRecoveryProvider} from '../scripts/production-recovery-direct-provider.mjs';
const accountId='a'.repeat(32),requests=[],original=globalThis.fetch;
const settings={result:{bindings:[{name:'EMAIL_FROM',text:'Support <support@thebedesk.com>'},{name:'PUBLIC_APP_URL',text:'https://thebedesk.com'}]}};
const fetchImpl=async(url,options)=>{
  requests.push({url,options});
  if(url.startsWith('https://api.cloudflare.com/'))return new Response(JSON.stringify(settings));
  const body=JSON.parse(options.body);
  assert.deepEqual(body.to,['delivered@resend.dev']);
  assert(body.text.includes('/reset-password.html#reset_token='));
  assert(options.signal instanceof AbortSignal);
  return new Response(JSON.stringify({name:'daily_quota_exceeded',message:'Daily quota exceeded PRIVATE_DATA'}),{status:429});
};
const result=await probeRecoveryProvider({cfToken:'PRIVATE_CF',accountId,resendKey:'PRIVATE_RESEND',fetchImpl});
assert.deepEqual(result,{result:'direct_provider_probe',accepted:false,status:429,error:'daily_quota_exceeded',reason:'quota'});
assert(!JSON.stringify(result).includes('PRIVATE'));
assert.equal(globalThis.fetch,original);
assert.equal(requests.length,2);
const missing=await probeRecoveryProvider({cfToken:'key',accountId,resendKey:'key',fetchImpl:async()=>new Response(JSON.stringify({result:{bindings:[]}}))});
assert.equal(missing.result,'before_provider_request');
assert.equal(globalThis.fetch,original);
await assert.rejects(probeRecoveryProvider({accountId:'invalid'}),/Cloudflare account/);
const failed=await probeRecoveryProvider({cfToken:'key',accountId,resendKey:'key',fetchImpl:async(url)=>{
  if(url.startsWith('https://api.cloudflare.com/'))return new Response(JSON.stringify(settings));
  throw new Error('PRIVATE_NETWORK_ERROR');
}});
assert.equal(failed.result,'provider_network_failure');
assert.equal(globalThis.fetch,original);
console.log('PASS direct provider probe: deployed settings, simulation-only recipient, no persisted reset token, safe error classification and fetch restoration');
