#!/usr/bin/env node
/**
 * Read-only quotation release check for the exact Thebe Desk production host.
 * Test imports never access the network. CLI requires --live explicitly.
 * Does not authenticate, issue quotes, create records, or change Cloudflare.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const ORIGIN='https://thebedesk.com';
export const QUOTE_ASSET='/js/quotation-customizable-page.mjs';
const paths=['/app/quotations/preview/','/app/quotations/customer-ready/'];
const sha=/^[0-9a-f]{40}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');

export async function auditQuotationProduction({
  manifest,localAsset,fetchImpl=fetch,origin=ORIGIN
}={}){
  if(origin!==ORIGIN)throw Error('production_origin_must_be_exact');
  if(manifest?.schema!==1||manifest?.release!=='production'||
     !Number.isSafeInteger(manifest.sequence)||manifest.sequence<1||
     !sha.test(manifest.sourceSha??''))throw Error('invalid_exact_release_manifest');
  if(!Buffer.isBuffer(localAsset)||localAsset.length<100||
     localAsset.length>512000)throw Error('invalid_local_quotation_asset');
  const report={
    kind:'quotation-production-readonly-acceptance',
    releaseSequence:manifest.sequence, expectedSourceSha:manifest.sourceSha,
    expectedAssetSha256:hash(localAsset),checks:[],ok:false,
    capabilities:{customer_issuance_authorized:false,production_change:false}
  };
  const get=async(path,accept)=>{
    const url=origin+path;
    const res=await fetchImpl(url,{
      method:'GET',redirect:'error',credentials:'omit',
      headers:{accept,'cache-control':'no-cache','user-agent':'ThebeDesk-Quotation-ReadOnly-Proof/1.0'},
      signal:AbortSignal.timeout(15000)
    });
    if(!res||typeof res.status!=='number')throw Error('invalid_http_response');
    return res;
  };
  let ok=true;
  try{
    const res=await get('/api/version','application/json');
    let matches=false;
    if(res.status===200){
      const raw=await res.text();
      if(raw.length<=8192){
        let version=null;
        try{version=JSON.parse(raw)}catch{}
        matches=version?.ok===true&&version?.release==='production'&&
          version?.releaseSequence===manifest.sequence&&
          version?.sourceSha===manifest.sourceSha&&
          version?.runtimeEntry==='release-governance-entry';
      }
    }
    report.checks.push({path:'/api/version',result:matches?'exact_release_match':'mismatch_or_unavailable',httpStatus:res.status});
    if(!matches)ok=false;
  }catch{
    report.checks.push({path:'/api/version',result:'unavailable'});ok=false;
  }
  try{
    const res=await get(QUOTE_ASSET+'?release='+manifest.sourceSha,'text/javascript,application/javascript,*/*');
    let matches=false,servedSha256=null;
    if(res.status===200){
      const bytes=Buffer.from(await res.arrayBuffer());
      if(bytes.length>0&&bytes.length<=512000){
        servedSha256=hash(bytes);matches=servedSha256===report.expectedAssetSha256;
      }
    }
    report.checks.push({path:QUOTE_ASSET,result:matches?'exact_asset_match':'asset_mismatch_or_unavailable',
      httpStatus:res.status,servedSha256});
    if(!matches)ok=false;
  }catch{
    report.checks.push({path:QUOTE_ASSET,result:'unavailable'});ok=false;
  }
  for(const path of paths){
    try{
      const res=await get(path,'text/html');
      // Denial must be an actual HTTP status, not a demo warning or JS toggle.
      const denied=res.status===404;
      report.checks.push({path,result:denied?'anonymous_denied':'anonymous_access_gate_failed',httpStatus:res.status});
      if(!denied)ok=false;
      // Intentionally do NOT read the response body of private-route probes.
    }catch{
      report.checks.push({path,result:'unavailable'});ok=false;
    }
  }
  report.ok=ok;
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.argv.length!==3||process.argv[2]!=='--live'){
    console.error('DENIED: explicit read-only --live mode required');
    process.exitCode=2;
  }else{
    const manifest=JSON.parse(readFileSync(new URL('../release/production.json',import.meta.url),'utf8'));
    const localAsset=readFileSync(new URL('../public'+QUOTE_ASSET,import.meta.url));
    const result=await auditQuotationProduction({manifest,localAsset});
    process.stdout.write(JSON.stringify(result)+'\n');
    process.exitCode=result.ok?0:1;
  }
}
