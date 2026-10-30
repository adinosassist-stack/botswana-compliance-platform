import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const ORIGIN='https://thebedesk.com';
const SHA=/^[a-f0-9]{40}$/;
export async function checkLaunchProvenance(manifest,{fetchImpl=fetch}={}){
  if(manifest?.release!=='production'||!Number.isSafeInteger(manifest.sequence)||manifest.sequence<1||!SHA.test(manifest.sourceSha||''))throw Error('invalid_release_manifest');
  const report={kind:'launch-provenance-readonly',expectedSequence:manifest.sequence,expectedSourceSha:manifest.sourceSha,checks:[],ok:false};
  for(const path of ['/api/version','/api/live']){
    let response;
    try{response=await fetchImpl(ORIGIN+path,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});}
    catch{report.checks.push({path,status:'unavailable'});return report;}
    if(!response||response.status!==200){report.checks.push({path,status:'http_error',httpStatus:response?.status??null});return report;}
    let data;
    try{const raw=await response.text();if(raw.length>8192)throw Error('oversize');data=JSON.parse(raw);}
    catch{report.checks.push({path,status:'invalid_response'});return report;}
    if(path==='/api/version'){
      const matches=data.ok===true&&data.release==='production'&&data.releaseSequence===manifest.sequence&&data.sourceSha===manifest.sourceSha&&data.runtimeEntry==='release-governance-entry';
      report.checks.push({path,status:matches?'match':'mismatch'});
      if(!matches)return report;
    }else{
      const matches=data.ok===true;
      report.checks.push({path,status:matches?'ok':'unhealthy'});
      if(!matches)return report;
    }
  }
  report.ok=true;return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const manifest=JSON.parse(readFileSync(new URL('../release/production.json',import.meta.url),'utf8'));
  const report=await checkLaunchProvenance(manifest);
  process.stdout.write(JSON.stringify(report)+'\n');
  process.exitCode=report.ok?0:1;
}
