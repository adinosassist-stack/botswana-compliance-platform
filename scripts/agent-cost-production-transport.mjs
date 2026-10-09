import {readFileSync,mkdtempSync,writeFileSync,rmSync,appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {AGENT_COST_INSPECTION_SQL} from "./agent-cost-schema-preflight.mjs";
const manifest=JSON.parse(readFileSync(new URL('./manifests/agent-cost-schema.json',import.meta.url),'utf8'));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=code=>{throw new Error(code)};
export function createAgentCostProductionTransport({token,accountId,databaseId,allowApply=false,wranglerJs,
  verifyAuthority,summaryPath,fetchImpl=globalThis.fetch,execImpl=promisify(execFile)}={}){
  if(typeof token!=='string'||!token.trim()||typeof allowApply!=='boolean'||typeof fetchImpl!=='function'||
    !/^[a-f0-9]{32}$/i.test(accountId)||!uuid.test(databaseId)||typeof verifyAuthority!=="function")fail('migration_target_invalid');
  let verified=false,bookmark=null;
  const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;
  async function api(suffix,options={}){
    const r=await fetchImpl(base+suffix,{...options,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json'}});
    if(!r.ok)fail('migration_cloudflare_unavailable');
    const body=await r.json();if(body?.success!==true)fail('migration_cloudflare_unavailable');return body.result;
  }
  async function verifyTarget(){
    verified=false;const info=await api('');
    if(typeof info?.uuid!=='string'||info.uuid.toLowerCase()!==databaseId.toLowerCase()||info?.name!=='bw-compliance-os')fail('migration_target_mismatch');
    verified=true;
  }
  async function query(sql){
    if(!verified||!Object.values(AGENT_COST_INSPECTION_SQL).includes(sql))fail('migration_query_forbidden');
    const result=await api('/query',{method:'POST',body:JSON.stringify({sql,params:[]})});
    if(!Array.isArray(result)||!result.length||result.some(r=>r.success!==true||!Array.isArray(r.results)))fail('migration_query_failed');
    return result.flatMap(r=>r.results);
  }
  async function captureBookmark(){
    if(!allowApply||!verified)fail('migration_apply_disabled');
    bookmark=(await api('/time_travel/bookmark'))?.bookmark;
    if(typeof bookmark!=='string'||!bookmark.trim()||bookmark.length>400)fail('migration_bookmark_unavailable');
    if(!summaryPath)fail('migration_bookmark_record_unavailable');
    appendFileSync(summaryPath,`\nMigration 068 recovery bookmark: ${bookmark.replace(/[\r\n]/g,'')}\n`);
    return bookmark;
  }
  async function applyReviewedSql(request){
    if(!allowApply||!verified||!bookmark||request.bookmark!==bookmark)fail('migration_apply_disabled');
    if(request.path!==manifest.source.path||request.sourceSha256!==manifest.source.sha256||
      createHash('sha256').update(request.sql).digest('hex')!==manifest.source.sha256)fail('migration_source_changed');
    await verifyAuthority();await verifyTarget();
    if(!wranglerJs||!resolve(wranglerJs).endsWith('/wrangler/bin/wrangler.js')||
      JSON.parse(readFileSync(join(resolve(wranglerJs),'../../package.json'),'utf8')).version!=='4.135.0')fail('migration_wrangler_invalid');
    const dir=mkdtempSync(join(tmpdir(),'thebe-068-remote-'));
    try{
      const file=join(dir,'068.sql'),config=join(dir,'wrangler.json');
      writeFileSync(file,request.sql,{mode:0o600});
      writeFileSync(config,JSON.stringify({name:'thebe-068-production-migration',account_id:accountId,
        compatibility_date:'2026-09-03',d1_databases:[{binding:'DB',database_name:'bw-compliance-os',database_id:databaseId}]}),{mode:0o600});
      const env={...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId,WRANGLER_SEND_METRICS:'false'};
      for(const key of ['GH_TOKEN','GITHUB_TOKEN','OPENAI_API_KEY','RESEND_API_KEY','SESSION_SECRET','AUDIT_INTEGRITY_SECRET',
        'AUTOMATION_SECRET','TURNSTILE_SECRET_KEY','PAYMENT_WEBHOOK_SECRET','BILLING_WEBHOOK_SECRET','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL'])delete env[key];
      await execImpl(process.execPath,[resolve(wranglerJs),'d1','execute','DB','--remote','--file',file,'--config',config,'--yes'],
        {cwd:dir,env,timeout:120000,maxBuffer:8*1024*1024});
    }catch{fail('migration_remote_apply_failed')}finally{rmSync(dir,{recursive:true,force:true})}
  }
  return {verifyTarget,query,captureBookmark,applyReviewedSql};
}
