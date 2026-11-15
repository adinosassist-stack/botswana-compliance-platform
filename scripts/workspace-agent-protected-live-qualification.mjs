/**
 * A one-shot, private, synthetic Workspace Agent qualification.
 * Only the protected GitHub Actions environment may run this executable.
 * It uploads temporary versions via Wrangler, never creates a route, and always
 * attempts to remove the temporary caller and restore the pinned inert version.
 */
import {randomBytes} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const ACCOUNT = 'ddd23cab31928a4bb3d4998df9b26d1d';
export const TARGET = 'bw-workspace-agent-staging';
export const CALLER = 'bw-workspace-agent-qualification-caller';
export const DB = 'fb0c7c32-6e0a-42cf-89c3-971529e583db';
export const INERT_VERSION = 'dfb71693-9031-44d3-958b-e13ba8cf7594';
export const PHRASE = 'QUALIFY_PRIVATE_WORKSPACE_AGENT_ONCE';
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;

export function requireGate(env) {
  if (env.GITHUB_REF !== 'refs/heads/main' || !SHA.test(env.GITHUB_SHA || '') ||
      env.GITHUB_SHA !== env.EXPECTED_MAIN_SHA || env.CONFIRMATION !== PHRASE ||
      env.GITHUB_REPOSITORY !== 'adinosassist-stack/botswana-compliance-platform' ||
      env.GITHUB_ACTIONS !== 'true' || !env.CLOUDFLARE_API_TOKEN || env.RUNNER_ENVIRONMENT !== 'workspace-agent-private-staging') {
    throw new Error('protected_exact_main_or_scope_gate_failed');
  }
}

export function verifyBaseline(data) {
  if (data.targetDeployment?.versions?.length !== 1 ||
      data.targetDeployment.versions[0].version_id !== INERT_VERSION ||
      data.targetDeployment.versions[0].percentage !== 100) throw new Error('inert_deployment_mismatch');
  if (data.targetSubdomain?.enabled !== false || data.targetSubdomain?.previews_enabled !== false ||
      data.targetSchedules?.length !== 0 || data.targetDomains?.length !== 0 ||
      data.d1?.uuid !== DB || data.d1?.name !== TARGET || data.d1?.num_tables !== 0 ||
      data.targetSettings?.bindings?.some(b => b.type !== 'plain_text') ||
      data.targetSettings?.bindings?.find(b => b.name === 'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED')?.text !== 'false' ||
      data.callerExists) throw new Error('non_inert_or_nonempty_baseline');
  const names = data.targetSettings?.bindings?.map(b => b.name) ?? [];
  if (names.length !== 8 || new Set(names).size !== names.length) throw new Error('unexpected_inert_bindings');
  if (data.zoneRoutes?.some(r => [TARGET,CALLER].includes(r.script))) throw new Error('unapproved_worker_route');
  return true;
}

export function completeZoneRoutes(envelope) {
  if (envelope?.success !== true || !Array.isArray(envelope.result))
    throw new Error('zone_routes_invalid');
  if (Object.hasOwn(envelope,'result_info')) {
    const page=envelope.result_info;
    const count=envelope.result.length;
    if (!page || page.page !== 1 ||
        (page.total_pages !== undefined && page.total_pages !== 1) ||
        (page.total_count !== undefined && page.total_count !== count) ||
        (page.count !== undefined && page.count !== count) ||
        (page.total_pages === undefined && page.total_count === undefined))
      throw new Error('zone_routes_incomplete');
  }
  const ids=new Set();
  for (const route of envelope.result) {
    if (!route || typeof route.id !== 'string' || !route.id.trim() ||
        typeof route.pattern !== 'string' || !route.pattern.trim() ||
        (route.script !== undefined && route.script !== null && typeof route.script !== 'string') ||
        ids.has(route.id)) throw new Error('zone_routes_invalid');
    ids.add(route.id);
  }
  return envelope.result;
}

export function assertReceipt(receipt) {
  if (receipt?.event !== 'workspace_agent_qualification' || receipt.fixturesRemoved !== true ||
      receipt.mutationDenied !== true || receipt.unrelatedPathDenied !== true ||
      JSON.stringify(receipt.results) !== JSON.stringify([
        {case:'owner-a',status:200},{case:'manager-a',status:200},{case:'owner-b',status:200},
        {case:'viewer',status:403},{case:'expired',status:401},{case:'revoked',status:401},
        {case:'no-session',status:401},
      ])) throw new Error('qualification_receipt_invalid');
  return true;
}

class Cloudflare {
  constructor(token) { this.token=token; }
  async call(method, path, body, allow404=false) {
    const response = await fetch(BASE + path, {
      method,
      headers:{Authorization:`Bearer ${this.token}`, ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(30000),
    });
    if (allow404 && response.status===404) return null;
    // Never print response bodies: some APIs can return binding metadata.
    if (!response.ok) throw new Error(`cloudflare_${method}_${response.status}`);
    if (response.status === 204) return {};
    const json = await response.json();
    if (json.success !== true) throw new Error(`cloudflare_${method}_unsuccessful`);
    if (path.endsWith('/workers/routes')) return completeZoneRoutes(json);
    return json.result;
  }
  async deployment(name) {
    return (await this.call('GET',`/workers/scripts/${name}/deployments`))?.deployments?.[0];
  }
  async versions(name) {
    return (await this.call('GET',`/workers/scripts/${name}/versions`))?.items?.map(item=>item.id);
  }
  async inventory() {
    const path=`/workers/scripts/${TARGET}`;
    const [targetDeployment,targetSubdomain,targetSchedules,targetDomains,d1,targetSettings,
      scripts,zones] = await Promise.all([
      this.deployment(TARGET),this.call('GET',`${path}/subdomain`),
      this.call('GET',`${path}/schedules`),
      this.call('GET',`/workers/domains?service=${TARGET}`),
      this.call('GET',`/d1/database/${DB}`),
      this.call('GET',`${path}/settings`),
      this.call('GET','/workers/scripts'),
      this.zones(),
    ]);
    const zoneRoutes=[];
    for (const zone of zones) {
      const routes = await this.call('GET',`/zones/${zone.id}/workers/routes`);
      if (!Array.isArray(routes)) throw new Error('zone_routes_shape_invalid');
      zoneRoutes.push(...routes);
    }
    return {
      targetDeployment,targetSubdomain,targetSchedules:targetSchedules?.schedules,targetDomains,d1,targetSettings,
      callerExists:scripts?.some(script => script.id===CALLER),zoneRoutes,
    };
  }
  async zones() {
    // The qualification must be able to enumerate every zone under the account,
    // not merely one host; otherwise any pre-existing Worker route is unknown.
    const response=await fetch('https://api.cloudflare.com/client/v4/zones?account.id='+ACCOUNT+'&per_page=50', {
      headers:{Authorization:`Bearer ${this.token}`}, signal:AbortSignal.timeout(30000),
    });
    if(!response.ok) throw new Error('zone_inventory_denied');
    const data=await response.json();
    if(!data.success || !Array.isArray(data.result) || (data.result_info?.total_pages??1)!==1)
      throw new Error('zone_inventory_incomplete');
    if(!data.result.some(z=>z.name==='thebedesk.com')) throw new Error('staging_zone_inventory_incomplete');
    return data.result;
  }
}


async function assertCurrentMain(env) {
  if(!env.GITHUB_TOKEN) throw new Error('github_read_token_required');
  const res=await fetch('https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/git/ref/heads/main',{
    headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},
    signal:AbortSignal.timeout(15000),
  });
  if(!res.ok || (await res.json())?.object?.sha!==env.GITHUB_SHA) throw new Error('exact_main_drift');
}

function config(name, minute) {
  const common={account_id:ACCOUNT,compatibility_date:'2026-09-03',workers_dev:false,preview_urls:false,keep_vars:false,
    name,d1_databases:[{binding:'DB',database_name:TARGET,database_id:DB}]};
  if(name===TARGET) return {...common,main:'../src/workspace-agent-staging-qualification-entry.js',
    compatibility_flags:['nodejs_compat'],vars:{APP_ENV:'staging',WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'true',
      WORKSPACE_AGENT_ADVISORY_STAGING_HOST:'workspace-agent-staging.thebedesk.com',
      THEBE_GENERAL_AI_ENABLED:'false',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',
      AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',THEBE_LIVE_VOICE_ENABLED:'false',
      POP_UPLOAD_STAGING_ENABLED:'false',PAYMENT_PROVIDER:'none'}};
  return {...common,main:'../src/workspace-agent-staging-qualification-caller.js',
    services:[{binding:'TARGET',service:TARGET}],vars:{QUALIFICATION_MINUTE_MS:String(minute)},
    triggers:{crons:[]}};
}

export function wranglerArgs(configPath,secretPath) {
  return [resolve('node_modules/wrangler/bin/wrangler.js'),
    'versions','upload','--strict','--config',configPath,'--secrets-file',secretPath,
    '--message','Protected synthetic Workspace Agent qualification; NOT permanent'];
}

async function wranglerUpload(name, minute, secret, directory) {
  const configPath=join(directory,`${name}.json`), secretPath=join(directory,`${name}.secret.json`);
  writeFileSync(configPath,JSON.stringify(config(name,minute)),{mode:0o600});
  writeFileSync(secretPath,JSON.stringify({SESSION_SECRET:secret}),{mode:0o600});
  await new Promise((complete,reject) => {
    const child=spawn(process.execPath,wranglerArgs(configPath,secretPath),{
      cwd:process.cwd(), env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,CI:'true',CLOUDFLARE_API_TOKEN:process.env.CLOUDFLARE_API_TOKEN,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe'],
    });
    // Don't emit Wrangler output because it may contain sensitive metadata.
    let stdoutLength=0,stderrLength=0;
    child.stdout.on('data',chunk=>{stdoutLength+=chunk.length;if(stdoutLength>1024*1024)child.kill();});
    child.stderr.on('data',chunk=>{stderrLength+=chunk.length;if(stderrLength>1024*1024)child.kill();});
    child.once('error',()=>reject(new Error(`wrangler_${name}_failed`)));
    child.once('exit',code=>code===0?complete():reject(new Error(`wrangler_${name}_failed`)));
  });
}

function oneNewVersion(before,after) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.some(id=>!after.includes(id)))
    throw new Error('version_history_changed');
  const added=after.filter(id=>!before.includes(id));
  if(added.length!==1 || !UUID.test(added[0])) throw new Error('new_version_not_unique');
  return added[0];
}

function tailReceipt(ws, deadlineMs) {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timeout=setTimeout(()=>finish(new Error('qualification_receipt_timeout')),deadlineMs);
    function finish(err,val){if(settled)return;settled=true;clearTimeout(timeout);err?reject(err):resolve(val);}
    ws.addEventListener('message',event=>{
      try {
        const data=JSON.parse(event.data);
        for(const item of data.logs||[]){
          for(const part of (Array.isArray(item.message)?item.message:[item.message])){
            const parsed=typeof part==='string'?JSON.parse(part):part;
            if(parsed?.event==='workspace_agent_qualification'){
              try {assertReceipt(parsed);return finish(null,parsed);} catch(error) {return finish(error);}
            }
          }
        }
      } catch {/* Ignore other log messages, not the receipt. */}
    });
    ws.addEventListener('error',()=>finish(new Error('tail_socket_error')));
    ws.addEventListener('close',()=>finish(new Error('tail_socket_closed')));
  });
}

export async function main(env=process.env) {
  requireGate(env);
  const api=new Cloudflare(env.CLOUDFLARE_API_TOKEN);
  const directory=mkdtempSync(join(resolve('cloudflare'),'workspace-agent-qualification-private-'));
  const secret=randomBytes(48).toString('hex');
  let targetDeployed=false,callerCreated=false,cronInstalled=false,tailId=null,tail=null;
  let result=null,primaryError=null,cleanupErrors=[];
  const targetRoot=`/workers/scripts/${TARGET}`;
  const callerRoot=`/workers/scripts/${CALLER}`;
  try {
    await assertCurrentMain(env);
    const baseline=await api.inventory();verifyBaseline(baseline);
    // Upload target and caller as versions only. Neither operation can enable
    // routes, custom domains, workers.dev or preview URLs via configuration.
    const minute=(Math.floor(Date.now()/60000)+4)*60000;
    const priorTargetVersions=await api.versions(TARGET);
    await assertCurrentMain(env);
    await wranglerUpload(TARGET,minute,secret,directory);
    const candidateTarget=oneNewVersion(priorTargetVersions,await api.versions(TARGET));
    const candidateSettings=await api.call('GET',`${targetRoot}/versions/${candidateTarget}`);
    if(!candidateSettings)throw new Error('target_version_unreadable');
    if((await api.deployment(TARGET))?.versions?.[0]?.version_id!==INERT_VERSION)
      throw new Error('inert_target_changed_after_upload');
    await assertCurrentMain(env);
    targetDeployed=true; // Cloudflare may commit a deployment before a timeout or response error.
    await api.call('POST',`${targetRoot}/deployments`,{strategy:'percentage',versions:[{version_id:candidateTarget,percentage:100}],
      annotations:{'workers/message':'Temporary private synthetic Workspace Agent qualification'}});
    const targetState=await api.call('GET',`${targetRoot}/settings`);
    if(targetState?.bindings?.find(b=>b.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED')?.text!=='true'||
      targetState?.bindings?.find(b=>b.name==='DB')?.type!=='d1'||
      targetState?.bindings?.find(b=>b.name==='SESSION_SECRET')?.type!=='secret_text')
      throw new Error('target_binding_mismatch');
    if((await api.call('GET',`${targetRoot}/subdomain`))?.enabled!==false)throw new Error('target_public_access');
    const priorCallerVersions=[];
    callerCreated=true; // Clean up even if upload partially succeeds then throws.
    await assertCurrentMain(env);
    await wranglerUpload(CALLER,minute,secret,directory);
    const callerVersion=oneNewVersion(priorCallerVersions,await api.versions(CALLER));
    // Explicit deployment is necessary for cron invocation; no public routing.
    await assertCurrentMain(env);
    await api.call('POST',`${callerRoot}/deployments`,{strategy:'percentage',versions:[{version_id:callerVersion,percentage:100}],
      annotations:{'workers/message':'One-minute protected synthetic qualification caller'}});
    const callerSub=await api.call('GET',`${callerRoot}/subdomain`);
    if(callerSub?.enabled!==false||callerSub?.previews_enabled!==false)
      throw new Error('caller_public_access');
    const callerSettings=await api.call('GET',`${callerRoot}/settings`);
    if(callerSettings?.bindings?.find(b=>b.name==='DB')?.type!=='d1'||
      callerSettings?.bindings?.find(b=>b.name==='TARGET')?.type!=='service'||
      callerSettings?.bindings?.find(b=>b.name==='SESSION_SECRET')?.type!=='secret_text')
      throw new Error('caller_bindings_mismatch');
    // Start the live, redacted Cloudflare Tail before enabling any trigger.
    const tailInfo=await api.call('POST',`${callerRoot}/tails`,{});
    tailId=tailInfo?.id;
    if(!tailId || !tailInfo?.url?.startsWith('wss://'))throw new Error('tail_not_available');
    tail=new WebSocket(tailInfo.url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('tail_open_timeout')),15000);
      tail.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      tail.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('tail_open_failed'));},{once:true});
    });
    if(Date.now()>minute-60000)throw new Error('scheduled_window_too_close');
    const receiptPromise=tailReceipt(tail,Math.max(0,minute+90000-Date.now()));
    await assertCurrentMain(env);
    await api.call('PUT',`${callerRoot}/schedules`,[{cron:'* * * * *'}]);
    cronInstalled=true;
    result=await receiptPromise;
    console.log(JSON.stringify({event:'qualification_verified',results:result.results,mutationDenied:true,
      unrelatedPathDenied:true,fixturesRemoved:true,sourceSha:env.GITHUB_SHA,
      targetVersion:candidateTarget,callerVersion}));
  } catch(error){primaryError=error;}
  finally {
    // Cleanup is intentional even on Cloudflare 5xx / partial deployment.
    const attempt=async(name,fn)=>{try{await fn();}catch{cleanupErrors.push(name);}};
    if(cronInstalled||callerCreated) await attempt('remove_schedule',async()=>{
      if(await api.call('GET',`${callerRoot}/schedules`,undefined,true))
        await api.call('PUT',`${callerRoot}/schedules`,[]);
    });
    if(tail){try{tail.close();}catch{}}
    if(tailId)await attempt('remove_tail',()=>api.call('DELETE',`${callerRoot}/tails/${tailId}`,undefined,true));
    if(callerCreated)await attempt('delete_caller',()=>api.call('DELETE',callerRoot,undefined,true));
    if(targetDeployed)await attempt('restore_inert',()=>api.call('POST',`${targetRoot}/deployments`,{
      strategy:'percentage',versions:[{version_id:INERT_VERSION,percentage:100}],
      annotations:{'workers/message':'Restore original inert Workspace Agent after synthetic qualification'},
    }));
    await attempt('verify_rollback',async()=>{
      // If caller creation failed part-way, any residual account script must
      // be treated as a failed cleanup (never claim a successful qualification).
      const inventory=await api.inventory();verifyBaseline(inventory);
    });
    rmSync(directory,{recursive:true,force:true});
    console.log(JSON.stringify({event:'workspace_agent_cleanup',verified:cleanupErrors.length===0,
      checksFailed:cleanupErrors,sourceSha:env.GITHUB_SHA}));
  }
  if(cleanupErrors.length)throw new Error(`qualification_cleanup_incomplete:${cleanupErrors.join(',')}`);
  if(primaryError)throw primaryError;
  if(!result)throw new Error('qualification_missing_receipt');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  (process.argv.includes('--verify-only') ? (async()=>{
    requireGate(process.env);
    const api=new Cloudflare(process.env.CLOUDFLARE_API_TOKEN);
    verifyBaseline(await api.inventory());
    console.log(JSON.stringify({event:'workspace_agent_rollback_verified',sourceSha:process.env.GITHUB_SHA}));
  })() : main()).catch(error=>{console.error('workspace_agent_live_qualification_failed:',error.message);process.exitCode=1;});
}
