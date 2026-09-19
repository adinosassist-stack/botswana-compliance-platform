import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_REGISTRY='https://registry.npmjs.org/';
const BULK_AUDIT_PATH='/-/npm/v1/security/advisories/bulk';
const HIGH_SEVERITIES=new Set(['high','critical']);
const KNOWN_SEVERITIES=new Set(['info','low','moderate','high','critical']);

function safe(value){
  return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,500);
}
function lockPackageName(lockPath,entry){
  if(entry?.name&&typeof entry.name==='string')return entry.name;
  const marker='node_modules/';
  const index=String(lockPath||'').lastIndexOf(marker);
  if(index<0)return '';
  return String(lockPath).slice(index+marker.length);
}
function configuredRegistry(){
  const raw=process.env.NPM_CONFIG_REGISTRY||process.env.npm_config_registry||DEFAULT_REGISTRY;
  const url=new URL(raw);
  if(url.protocol!=='https:')throw new Error(`dependency audit registry must use HTTPS: ${url.origin}`);
  return url;
}
function registryPackageSource(entry,registry){
  if(!entry?.resolved)return false;
  let resolved;
  try{resolved=new URL(String(entry.resolved))}catch{return false}
  return resolved.origin===registry.origin;
}
function emptySeverityCounts(){
  return {info:0,low:0,moderate:0,high:0,critical:0,total:0};
}

export function buildAuditPayload(lock,{omitDev=false,registry=configuredRegistry()}={}){
  if(!lock||typeof lock!=='object'||Number(lock.lockfileVersion)!==3||!lock.packages||typeof lock.packages!=='object'){
    throw new Error('dependency audit requires a package-lock v3 packages map');
  }
  const versionsByName=new Map();
  const dependencies={prod:0,dev:0,optional:0,peer:0,peerOptional:0,total:0};
  for(const [lockPath,entry] of Object.entries(lock.packages)){
    if(!lockPath||!entry||typeof entry!=='object'||entry.link===true||typeof entry.version!=='string'||!entry.version)continue;
    if(omitDev&&entry.dev===true)continue;
    if(!registryPackageSource(entry,registry))continue;
    const name=lockPackageName(lockPath,entry);
    if(!name)continue;
    const versions=versionsByName.get(name)||new Set();
    versions.add(entry.version);
    versionsByName.set(name,versions);
    dependencies.total++;
    if(entry.dev===true)dependencies.dev++;else dependencies.prod++;
    if(entry.optional===true)dependencies.optional++;
    if(entry.peer===true)dependencies.peer++;
    if(entry.peerOptional===true)dependencies.peerOptional++;
  }
  if(!versionsByName.size)throw new Error('dependency audit payload is empty');
  const payload={};
  for(const name of [...versionsByName.keys()].sort()){
    payload[name]=[...versionsByName.get(name)].sort();
  }
  return {payload,dependencies};
}

function validateBulkResponse(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('bulk advisory response is not an object');
  for(const [name,items] of Object.entries(value)){
    if(!Array.isArray(items))throw new Error(`bulk advisory response for ${name} is not an array`);
    for(const item of items){
      if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`bulk advisory entry for ${name} is invalid`);
      const severity=String(item.severity||'').toLowerCase();
      if(!KNOWN_SEVERITIES.has(severity))throw new Error(`bulk advisory entry for ${name} has invalid severity`);
      if(item.id===undefined&&item.url===undefined)throw new Error(`bulk advisory entry for ${name} has no advisory identity`);
    }
  }
  return value;
}

export async function fetchBulkAdvisories(payload,{registry=configuredRegistry(),fetchImpl=globalThis.fetch,timeoutMs=12000,retries=2}={}){
  if(typeof fetchImpl!=='function')throw new Error('global fetch is unavailable');
  const endpoint=new URL(BULK_AUDIT_PATH,registry).toString();
  const body=JSON.stringify(payload);
  let lastError=null;
  for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort('bulk-audit-timeout'),timeoutMs);
    try{
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{
          accept:'application/json',
          'accept-encoding':'identity',
          'content-type':'application/json',
          'user-agent':'thebe-desk-bulk-audit/1'
        },
        body,
        signal:controller.signal
      });
      const text=await response.text();
      if(!response.ok)throw new Error(`bulk advisory endpoint HTTP ${response.status}: ${safe(text)}`);
      let parsed;
      try{parsed=JSON.parse(text)}catch{throw new Error('bulk advisory endpoint returned invalid JSON')}
      return {endpoint,advisories:validateBulkResponse(parsed)};
    }catch(error){
      lastError=error;
      if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
    }finally{clearTimeout(timer)}
  }
  throw new Error(`bulk advisory request failed after ${retries+1} attempts: ${safe(lastError?.message||lastError)}`);
}

export function buildAuditReport(advisories,{dependencies,registry,omitDev=false}={}){
  const counts=emptySeverityCounts();
  const normalized={};
  const blocking=[];
  for(const name of Object.keys(advisories).sort()){
    const items=advisories[name];
    normalized[name]=items.map(item=>({...item,severity:String(item.severity).toLowerCase()}));
    for(const item of normalized[name]){
      const severity=item.severity;
      counts[severity]++;
      counts.total++;
      if(HIGH_SEVERITIES.has(severity))blocking.push({
        package:name,
        severity,
        id:item.id??null,
        title:safe(item.title||'untitled advisory'),
        url:safe(item.url||'')
      });
    }
  }
  return {
    auditReportVersion:2,
    source:'npm-bulk-advisory',
    registry:String(registry),
    policy:{omit:omitDev?'dev':'none',auditLevel:'high'},
    vulnerabilities:normalized,
    metadata:{vulnerabilities:counts,dependencies},
    blocking
  };
}

export async function runDependencyAudit({lockFile='package-lock.json',omitDev=false,fetchImpl=globalThis.fetch}={}){
  const registry=configuredRegistry();
  const lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));
  const {payload,dependencies}=buildAuditPayload(lock,{omitDev,registry});
  const {advisories}=await fetchBulkAdvisories(payload,{registry,fetchImpl});
  return buildAuditReport(advisories,{dependencies,registry:new URL(BULK_AUDIT_PATH,registry).toString(),omitDev});
}

function cliArgs(argv){
  const known=new Set(['--json','--omit=dev']);
  for(const arg of argv)if(!known.has(arg))throw new Error(`unknown dependency audit argument: ${arg}`);
  return {json:argv.includes('--json'),omitDev:argv.includes('--omit=dev')};
}

async function main(){
  let args;
  try{args=cliArgs(process.argv.slice(2))}catch(error){
    console.error(`Dependency audit configuration error: ${safe(error.message)}`);
    process.exitCode=2;return;
  }
  try{
    const report=await runDependencyAudit({omitDev:args.omitDev});
    if(args.json)process.stdout.write(JSON.stringify(report,null,2)+'\n');
    else{
      const v=report.metadata.vulnerabilities;
      console.log(`Bulk dependency audit: packages=${report.metadata.dependencies.total} findings=${v.total} high=${v.high} critical=${v.critical}`);
      for(const finding of report.blocking){
        console.error(`BLOCK ${finding.severity.toUpperCase()} ${finding.package}: ${finding.title}${finding.url?` (${finding.url})`:''}`);
      }
    }
    if(report.metadata.vulnerabilities.high>0||report.metadata.vulnerabilities.critical>0)process.exitCode=1;
  }catch(error){
    const failure={auditReportVersion:2,source:'npm-bulk-advisory',error:{code:'BULK_AUDIT_FAILED',summary:safe(error?.message||error)}};
    if(args.json)process.stdout.write(JSON.stringify(failure,null,2)+'\n');
    else console.error(`Dependency audit failed closed: ${failure.error.summary}`);
    process.exitCode=2;
  }
}

const isDirect=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isDirect)await main();
