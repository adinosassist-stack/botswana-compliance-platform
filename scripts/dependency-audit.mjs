import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {validateLockAndBuildSbom} from './supply-chain-core.mjs';

const GITHUB_ADVISORIES='https://api.github.com/advisories';
const GITHUB_API_VERSION='2026-03-10';
const REQUEST_TIMEOUT_MS=15000;
const AFFECT_QUERY_BUDGET=3200;

function safe(value,max=6000){
  const text=String(value??'').replace(/[\r\n]+/g,' ').trim();
  return text.length>max?`${text.slice(0,max)}…`:text;
}

export function classifyNpmAudit(result){
  const stdout=String(result?.stdout||''),stderr=String(result?.stderr||'');
  let parsed=null;
  try{parsed=stdout.trim()?JSON.parse(stdout):null}catch{}
  const hasVulnerabilityReport=!!parsed&&typeof parsed==='object'&&
    !!parsed.metadata?.vulnerabilities&&typeof parsed.metadata.vulnerabilities==='object'&&
    !!parsed.vulnerabilities&&typeof parsed.vulnerabilities==='object';
  if(result?.status===0&&hasVulnerabilityReport)return {kind:'pass',parsed,stdout,stderr,status:0};
  if(hasVulnerabilityReport)return {kind:'vulnerabilities',parsed,stdout,stderr,status:Number(result?.status||1)};
  return {kind:'infrastructure',parsed,stdout,stderr,status:Number(result?.status||1)};
}

function componentNameFromLockPath(pkgPathKey){
  return String(pkgPathKey||'').split('node_modules/').pop();
}

export function productionLockedComponents(lock){
  const found=new Map();
  for(const [pkgPathKey,meta] of Object.entries(lock?.packages||{})){
    if(!pkgPathKey||!meta?.version||meta.dev===true)continue;
    const name=componentNameFromLockPath(pkgPathKey),version=String(meta.version);
    if(!name||!version)continue;
    found.set(`${name}@${version}`,{name,version});
  }
  return [...found.values()].sort((a,b)=>`${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

export function buildAffectChunks(components,budget=AFFECT_QUERY_BUDGET){
  const specs=[...new Set((components||[]).map(c=>`${c.name}@${c.version}`))].sort();
  const chunks=[];let current=[],size=0;
  for(const spec of specs){
    const encoded=encodeURIComponent(spec).length+(current.length?3:0);
    if(current.length&&size+encoded>budget){chunks.push(current);current=[];size=0}
    current.push(spec);size+=encoded;
  }
  if(current.length)chunks.push(current);
  return chunks;
}

function nextLink(value){
  for(const part of String(value||'').split(',')){
    const match=part.match(/<([^>]+)>;\s*rel="next"/);
    if(match)return match[1];
  }
  return '';
}

async function fetchJsonArray(url,{fetchImpl=fetch,token='',timeoutMs=REQUEST_TIMEOUT_MS}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const headers={
      accept:'application/vnd.github+json',
      'x-github-api-version':GITHUB_API_VERSION,
      'user-agent':'thebe-desk-dependency-audit'
    };
    if(token)headers.authorization=`Bearer ${token}`;
    const response=await fetchImpl(url,{headers,signal:controller.signal});
    const body=await response.text();
    if(!response.ok)throw new Error(`GitHub advisory API ${response.status}: ${safe(body,1000)}`);
    let parsed;
    try{parsed=JSON.parse(body)}catch{throw new Error('GitHub advisory API returned invalid JSON')}
    if(!Array.isArray(parsed))throw new Error('GitHub advisory API returned a non-array payload');
    return {items:parsed,next:nextLink(response.headers.get('link'))};
  }finally{clearTimeout(timer)}
}

async function advisoryQuery(url,options){
  const items=[];let next=String(url),pages=0;
  while(next){
    if(++pages>20)throw new Error('GitHub advisory pagination exceeded the fail-closed page limit');
    const page=await fetchJsonArray(next,options);
    items.push(...page.items);next=page.next;
  }
  return items;
}

export async function auditLockedComponentsWithGitHub({components,fetchImpl=fetch,token=process.env.GITHUB_TOKEN||''}={}){
  const chunks=buildAffectChunks(components);
  if(!chunks.length)throw new Error('Dependency audit fallback found no locked npm components');
  const found=new Map();
  for(const affects of chunks){
    for(const query of [
      {type:'reviewed',severity:'high'},
      {type:'reviewed',severity:'critical'},
      {type:'malware',severity:''}
    ]){
      const url=new URL(GITHUB_ADVISORIES);
      url.searchParams.set('ecosystem','npm');
      url.searchParams.set('type',query.type);
      if(query.severity)url.searchParams.set('severity',query.severity);
      url.searchParams.set('is_withdrawn','false');
      url.searchParams.set('affects',affects.join(','));
      url.searchParams.set('per_page','100');
      const items=await advisoryQuery(url,{fetchImpl,token});
      for(const item of items){
        const key=String(item?.ghsa_id||item?.cve_id||item?.html_url||JSON.stringify(item));
        found.set(key,item);
      }
    }
  }
  return {checked:components.length,advisories:[...found.values()]};
}

function vulnerabilitySummary(parsed){
  const counts=parsed?.metadata?.vulnerabilities||{};
  return ['critical','high','moderate','low','info'].map(k=>`${k}=${Number(counts[k]||0)}`).join(' ');
}

function fallbackSeverity(advisory){
  if(String(advisory?.type||'').toLowerCase()==='malware')return 'critical';
  const severity=String(advisory?.severity||'').toLowerCase();
  if(severity==='critical')return 'critical';
  return 'high';
}

export function fallbackAuditReport({components=[],advisories=[]}={}){
  const counts={info:0,low:0,moderate:0,high:0,critical:0,total:0};
  const vulnerabilities={};
  advisories.forEach((advisory,index)=>{
    const severity=fallbackSeverity(advisory);
    counts[severity]++;counts.total++;
    const id=String(advisory?.ghsa_id||advisory?.cve_id||`fallback-${index+1}`);
    vulnerabilities[id]={
      name:id,
      severity,
      isDirect:false,
      via:[{
        source:id,
        name:id,
        dependency:id,
        title:safe(advisory?.summary||advisory?.description||'GitHub Advisory Database match',500),
        url:String(advisory?.html_url||''),
        severity
      }],
      effects:[],
      range:'locked-version-match',
      nodes:[],
      fixAvailable:false
    };
  });
  return {
    auditReportVersion:2,
    source:'github-advisory-fallback',
    vulnerabilities,
    metadata:{
      vulnerabilities:counts,
      dependencies:{prod:components.length,dev:0,optional:0,peer:0,peerOptional:0,total:components.length}
    }
  };
}

function emitJson(value){
  process.stdout.write(JSON.stringify(value,null,2)+'\n');
}

async function main({jsonMode=false}={}){
  const npmResult=spawnSync('npm',['audit','--omit=dev','--json','--audit-level=high'],{
    cwd:process.cwd(),encoding:'utf8',maxBuffer:20*1024*1024,env:process.env
  });
  if(npmResult.error)throw npmResult.error;
  const classified=classifyNpmAudit(npmResult);
  if(classified.kind==='pass'){
    if(jsonMode)emitJson(classified.parsed);
    else console.log(`Dependency audit passed via npm registry: ${vulnerabilitySummary(classified.parsed)}`);
    return;
  }
  if(classified.kind==='vulnerabilities'){
    if(jsonMode)emitJson(classified.parsed);
    else{
      if(classified.stdout)process.stdout.write(classified.stdout.endsWith('\n')?classified.stdout:`${classified.stdout}\n`);
      if(classified.stderr)process.stderr.write(classified.stderr.endsWith('\n')?classified.stderr:`${classified.stderr}\n`);
    }
    process.exitCode=1;
    return;
  }

  console.warn(`npm audit service failed; using fail-closed GitHub Advisory Database fallback. npm status=${classified.status} stderr=${safe(classified.stderr,1500)}`);
  const {lock}=validateLockAndBuildSbom(process.cwd());
  const components=productionLockedComponents(lock);
  const fallback=await auditLockedComponentsWithGitHub({components});
  const report=fallbackAuditReport({components,advisories:fallback.advisories});
  if(jsonMode)emitJson(report);
  if(fallback.advisories.length){
    if(!jsonMode){
      for(const advisory of fallback.advisories){
        console.error(`ADVISORY ${safe(advisory?.ghsa_id||advisory?.cve_id||'unknown',120)} severity=${safe(advisory?.severity||advisory?.type||'unknown',40)} ${safe(advisory?.html_url||'',240)}`);
      }
    }
    process.exitCode=1;
    return;
  }
  if(!jsonMode)console.log(`Dependency audit fallback passed: ${fallback.checked} exact production registry-locked npm components checked against GitHub reviewed high/critical and malware advisories`);
}

const isMain=process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url;
if(isMain){
  const unknown=process.argv.slice(2).filter(arg=>arg!=='--json');
  const jsonMode=process.argv.includes('--json');
  if(unknown.length){
    const failure={auditReportVersion:2,error:{code:'INVALID_AUDIT_ARGUMENT',summary:`Unknown dependency audit argument(s): ${unknown.join(', ')}`}};
    if(jsonMode)emitJson(failure);else console.error(failure.error.summary);
    process.exitCode=1;
  }else{
    main({jsonMode}).catch(error=>{
      const summary=safe(error?.stack||error?.message||error,5000);
      if(jsonMode)emitJson({auditReportVersion:2,error:{code:'DEPENDENCY_AUDIT_FAILED',summary}});
      else console.error(`Dependency audit failed: ${summary}`);
      process.exitCode=1;
    });
  }
}
