#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function read(path){return readFileSync(resolve(root,path),'utf8');}
export function verifyCoreOnlyFreeze({config,worker,exportSpec}){
  const vars=config.match(/^\[vars\]([\s\S]*?)(?=^\[|^\[\[|$(?![\s\S]))/m)?.[1];
  assert.ok(vars,'missing production vars');
  const flag=(name)=>[...vars.matchAll(new RegExp('^\\s*'+name+'\\s*=\\s*"([^"]*)"\\s*$','gm'))].map(m=>m[1]);
  for(const name of ['POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED','THEBE_GENERAL_AI_ENABLED']){
    assert.deepEqual(flag(name),['false'],name+' must be explicitly false exactly once in production vars');
  }
  assert.deepEqual(flag('APP_ENV'),['production'],'production profile required');
  // A second TOML variable assignment under an env-specific profile can
  // override a frozen value at deployment time. Qualify only configurations
  // with one authoritative declaration of each release-critical flag.
  for(const name of ['POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED','THEBE_GENERAL_AI_ENABLED','APP_ENV']){
    const assignments=[...config.matchAll(new RegExp('^\\\\s*'+name+'\\\\s*=','gm'))];
    assert.equal(assignments.length,1,name+' must have exactly one global assignment (no env override)');
  }

  assert.match(worker,/if\(url\.pathname==="\/api\/payments\/manual-bank\/pop\/stage"&&req\.method==="POST"\)\s*\{\s*\/\/ Core-first release: production must never enter staging-only ingestion\.\s*if\(env\?\.APP_ENV==="production"\)return json\(\{error:"pop_upload_disabled"\},503\);/);
  assert.match(worker,/if\(String\(env\?\.POP_UPLOAD_STAGING_ENABLED\|\|"false"\)!=="true"\)return json\(\{error:"pop_upload_disabled"\},503\)/);
  // No advanced document export HTTP transport may be attached to the production entry.
  assert.doesNotMatch(worker,/from\s*["'][^"']*(?:ai-export-http|ai-document-export|thebe-ai-export)[^"']*["']/i);
  assert.doesNotMatch(worker,/\/api\/(?:ai\/exports?|thebe-ai\/exports?|documents?\/generate)(?:\/|["'?])/i);
  assert.match(exportSpec,/still-unmounted document renderer/);
  return {scope:'core_only',popIngestionEnabled:false,advancedAiExportsEnabled:false};
}
export function qualifyCoreOnly(configPath){
  const config=configPath?readFileSync(configPath,'utf8'):read('cloudflare/wrangler.toml');
  return verifyCoreOnlyFreeze({config,worker:read('cloudflare/src/worker.js'),
    exportSpec:read('docs/ai-export-private-safety-consolidation-20261103.md')});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(qualifyCoreOnly(process.argv[2])));}
  catch(error){console.error('Core-only freeze qualification refused: '+error.message);process.exitCode=1;}
}
