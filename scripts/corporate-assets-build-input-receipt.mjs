/** Corporate Assets staging build-input receipt. OFFLINE ONLY.
 * Documents exact checked-out source inputs and pinned build toolchain.
 * Does not upload a Worker, prove that Cloudflare received these bytes,
 * inspect secrets, or authorize release.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {renderCorporateAssetsStagingConfig} from './render-corporate-assets-staging-config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SHA=/^[a-f0-9]{40}$/;
export const INPUTS=Object.freeze([
 'cloudflare/src/corporate-assets-staging-entry.js',
 'scripts/render-corporate-assets-staging-config.mjs',
 'package.json',
 'package-lock.json'
]);
const digest=s=>createHash('sha256').update(s).digest('hex');
export function buildInputReceipt({expectedSha,checkoutSha,files,config,lockVersion}={}){
 if(!SHA.test(expectedSha||'')||checkoutSha!==expectedSha)throw Error('exact_checked_out_commit_required');
 if(!files||typeof files!=='object'||INPUTS.some(p=>typeof files[p]!=='string'))throw Error('required_build_inputs_missing');
 if(config?.name!=='bw-corporate-assets-staging'||config?.workers_dev!==false||
  config?.preview_urls!==false||config?.keep_vars!==false||config?.routes?.length!==0||
  config?.vars?.ASSETS_STAGING_SOURCE_SHA!==expectedSha||
  config?.vars?.THEBE_CORPORATE_ASSETS_ENABLED!=='false'||
  config?.vars?.ASSETS_STAGING_WRITES_ENABLED!=='false'||
  config?.d1_databases?.length!==1||
  config?.d1_databases[0]?.database_id!=='e19f09de-3bb9-4021-b4f8-44df04c8aaa8')throw Error('isolated_build_configuration_required');
 if(lockVersion!=='4.135.0')throw Error('pinned_wrangler_version_required');
 const checksums=Object.fromEntries(INPUTS.map(p=>[p,digest(files[p])]));
 const manifest={schema:'thebe.assets.build-inputs.v1',repository:'adinosassist-stack/botswana-compliance-platform',
  reviewedCommit:expectedSha,worker:'bw-corporate-assets-staging',wrangler:lockVersion,
  inputs:checksums,configDigest:digest(JSON.stringify({
   ...config,main:'cloudflare/src/corporate-assets-staging-entry.js'
  }))};
 return Object.freeze({...manifest,manifestDigest:digest(JSON.stringify(manifest)),
  deploymentAuthorized:false,cloudflareArtifactVerified:false});
}
export function collectInputReceipt({expectedSha,sourceRoot=root,env=process.env}={}){
 if(!SHA.test(expectedSha||''))throw Error('expected_main_sha_required');
 const checkoutSha=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
 const files=Object.fromEntries(INPUTS.map(p=>[p,readFileSync(resolve(sourceRoot,p),'utf8')]));
 const pkg=JSON.parse(files['package.json']);
 const lock=JSON.parse(files['package-lock.json']);
 if(pkg.devDependencies?.wrangler!=='4.135.0'||lock.packages?.['node_modules/wrangler']?.version!=='4.135.0')
  throw Error('wrangler_lockfile_version_mismatch');
 const config=renderCorporateAssetsStagingConfig({
  ASSETS_STAGING_SOURCE_SHA:expectedSha,
  ASSETS_STAGING_D1_ID:'e19f09de-3bb9-4021-b4f8-44df04c8aaa8',
  PRODUCTION_D1_DATABASE_ID:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'
 });
 return buildInputReceipt({expectedSha,checkoutSha,files,config,lockVersion:pkg.devDependencies.wrangler});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const receipt=collectInputReceipt({expectedSha:process.env.EXPECTED_MAIN_SHA});
  console.log(JSON.stringify(receipt));
 }catch(e){console.error(String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1}
}
