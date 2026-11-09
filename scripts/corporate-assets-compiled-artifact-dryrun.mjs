/** Offline bundled Worker digest using Wrangler versions upload --dry-run.
 * No credentials, upload, deployment, secrets or D1 mutation.
 */
import {mkdtempSync,writeFileSync,readdirSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {collectInputReceipt} from './corporate-assets-build-input-receipt.mjs';
import {renderCorporateAssetsStagingConfig} from './render-corporate-assets-staging-config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;
const sha256=b=>createHash('sha256').update(b).digest('hex');
export function bundledReceipt({expectedSha,inputs,bundleFiles,command='versions upload --dry-run'}={}){
 if(!SHA.test(expectedSha||'')||inputs?.reviewedCommit!==expectedSha||
  !HEX.test(inputs?.manifestDigest||'')||inputs?.deploymentAuthorized!==false||
  inputs?.cloudflareArtifactVerified!==false)throw Error('exact_source_inputs_required');
 if(command!=='versions upload --dry-run')throw Error('offline_wrangler_only');
 if(!Array.isArray(bundleFiles)||bundleFiles.length===0||
  bundleFiles.some(x=>!x||typeof x.name!=='string'||!x.name||
   x.name.startsWith('/')||x.name.split('/').includes('..')||
   !Buffer.isBuffer(x.bytes)||x.bytes.length===0))throw Error('nonempty_bundled_files_required');
 const seen=new Set();
 for(const f of bundleFiles){if(seen.has(f.name))throw Error('duplicate_bundle_entry');seen.add(f.name)}
 if(!bundleFiles.some(x=>x.name.endsWith('.js')))throw Error('bundled_module_required');
 const files=Object.fromEntries([...bundleFiles].sort((a,b)=>a.name.localeCompare(b.name,'en'))
  .map(x=>[x.name,sha256(x.bytes)]));
 const evidence={schema:'thebe.assets.compiled-artifact-dryrun.v1',reviewedCommit:expectedSha,
  inputManifestDigest:inputs.manifestDigest,compiler:'wrangler@4.135.0',
  dryRun:true,bundleFiles:files};
 return Object.freeze({...evidence,bundleDigest:sha256(JSON.stringify(evidence)),
  cloudflareUploadVerified:false,versionCreationAuthorized:false,deploymentAuthorized:false});
}
export function collectBundledReceipt({expectedSha,sourceRoot=root,runner=execFileSync}={}){
 const inputs=collectInputReceipt({expectedSha,sourceRoot});
 const config=renderCorporateAssetsStagingConfig({
  ASSETS_STAGING_SOURCE_SHA:expectedSha,
  ASSETS_STAGING_D1_ID:'e19f09de-3bb9-4021-b4f8-44df04c8aaa8',
  PRODUCTION_D1_DATABASE_ID:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'
 });
 const temp=mkdtempSync(join(tmpdir(),'thebe-assets-offline-'));
 try{
  const path=join(temp,'wrangler.json');
  const outdir=join(temp,'dist');
  writeFileSync(path,JSON.stringify(config));
  const sanitized={...process.env,WRANGLER_SEND_METRICS:'false'};
  for(const key of Object.keys(sanitized))if(/^CLOUDFLARE_|^CF_API_|^ASSETS_STAGING_.*TOKEN$/.test(key))delete sanitized[key];
  runner(process.execPath,['node_modules/wrangler/bin/wrangler.js','versions','upload',
   '--config',path,'--dry-run','--outdir',outdir],{cwd:sourceRoot,env:sanitized,
   encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
  const files=[];
  const visit=(dir)=>{
   for(const e of readdirSync(dir,{withFileTypes:true})){
    const full=join(dir,e.name);
    if(e.isSymbolicLink())throw Error('bundle_symlink_forbidden');
    if(e.isDirectory())visit(full);
    else if(e.isFile())files.push({name:relative(outdir,full).replaceAll('\\','/'),bytes:readFileSync(full)});
    else throw Error('nonregular_bundle_entry');
   }
  };
  visit(outdir);
  return bundledReceipt({expectedSha,inputs,bundleFiles:files});
 }finally{rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(collectBundledReceipt({expectedSha:process.env.EXPECTED_MAIN_SHA})))}
 catch(e){console.error('offline_bundle_preflight_failed:'+String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1}
}
