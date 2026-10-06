import {pathToFileURL} from 'node:url';
import {__v782162Test} from '../cloudflare/src/worker.js';
import {summarizeRecoveryLog} from './production-recovery-provider-log.mjs';

export async function probeRecoveryProvider({cfToken,accountId,resendKey,fetchImpl=fetch}){
  if(!/^[0-9a-f]{32}$/i.test(String(accountId||'')))throw new Error('invalid Cloudflare account');
  const settings=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/bw-compliance-os/settings`,{method:'GET',redirect:'error',headers:{authorization:`Bearer ${cfToken}`},signal:AbortSignal.timeout(10000)});
  if(!settings.ok)return {result:'settings_unavailable',status:settings.status};
  const bindingList=(await settings.json())?.result?.bindings;
  const bindings=Array.isArray(bindingList)?bindingList:[];
  const value=name=>bindings.find(x=>x.name===name)?.text||'';
  const env={RESEND_API_KEY:resendKey,EMAIL_FROM:value('EMAIL_FROM'),PUBLIC_APP_URL:value('PUBLIC_APP_URL')};
  let provider=null;
  let attempted=false;
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{
      if(url!=='https://api.resend.com/emails'||options?.method!=='POST')throw new Error('unexpected provider request');
      const request=JSON.parse(options.body);
      if(request.to?.length!==1||request.to[0]!=='delivered@resend.dev')throw new Error('simulation recipient mismatch');
      attempted=true;
      const response=await fetchImpl(url,options);
      let body={};try{body=await response.clone().json()}catch{}
      provider=summarizeRecoveryLog({endpoint:'/emails',method:'POST',request_body:request,response_status:response.status,response_body:body});
      return response;
    };
    // This random token has no database row and can never authorize a reset.
    const raw=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const accepted=await __v782162Test.deliverPasswordReset(env,'delivered@resend.dev',raw);
    if(provider)return {result:'direct_provider_probe',accepted,...provider};
    if(attempted)return {result:'provider_network_failure'};
    return {result:'before_provider_request',senderPresent:!!env.EMAIL_FROM,publicUrlPresent:!!env.PUBLIC_APP_URL,keyPresent:!!env.RESEND_API_KEY};
  }catch{return {result:'direct_provider_probe_unavailable'}}finally{globalThis.fetch=originalFetch}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.CLOUDFLARE_API_TOKEN||!process.env.RESEND_API_KEY)throw new Error('diagnostic requires governed GitHub Actions secrets');
  try{
    const result=await probeRecoveryProvider({cfToken:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,resendKey:process.env.RESEND_API_KEY});
    console.log('RECOVERY_DIRECT_PROVIDER_DIAGNOSTIC '+JSON.stringify(result));
  }catch{console.error('RECOVERY_DIRECT_PROVIDER_DIAGNOSTIC unavailable');process.exitCode=1}
}
