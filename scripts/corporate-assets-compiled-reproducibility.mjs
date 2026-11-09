/** Offline-only independent double build comparison.
 * Does not upload Worker versions, deploy traffic or authorize any write.
 */
import {pathToFileURL} from 'node:url';
import {collectBundledReceipt} from './corporate-assets-compiled-artifact-dryrun.mjs';
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;
const names=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort():[];
export function compareIndependentDryRuns({expectedSha,first,second}={}){
 const errors=[];
 if(!SHA.test(expectedSha||''))errors.push('expected_sha_invalid');
 for(const [n,b] of [['first',first],['second',second]]){
  if(b?.reviewedCommit!==expectedSha||b?.compiler!=='wrangler@4.135.0'||
   b?.dryRun!==true||!HEX.test(b?.inputManifestDigest||'')||
   !HEX.test(b?.bundleDigest||'')||
   b?.cloudflareUploadVerified!==false||
   b?.versionCreationAuthorized!==false||
   b?.deploymentAuthorized!==false||
   names(b?.bundleFiles).length===0||
   !names(b?.bundleFiles).some(x=>x.endsWith('.js'))||
   names(b?.bundleFiles).some(x=>!HEX.test(b.bundleFiles[x]||'')))errors.push(n+'_invalid_offline_receipt');
 }
 if(first?.inputManifestDigest!==second?.inputManifestDigest)errors.push('source_input_digest_changed');
 const a=names(first?.bundleFiles),b=names(second?.bundleFiles);
 if(JSON.stringify(a)!==JSON.stringify(b))errors.push('compiled_file_set_changed');
 const auxiliaryDifferences=[];
 for(const f of new Set([...a,...b]))if(first?.bundleFiles?.[f]!==second?.bundleFiles?.[f]){
  if(f.endsWith('.js'))errors.push('compiled_module_changed:'+f);
  else auxiliaryDifferences.push('auxiliary_artifact_changed:'+f);
 }
 const modules=a.filter(x=>x.endsWith('.js'));
 if(!modules.length||JSON.stringify(modules)!==JSON.stringify(b.filter(x=>x.endsWith('.js'))))
  errors.push('compiled_module_set_changed');
 if(first?.bundleDigest!==second?.bundleDigest)auxiliaryDifferences.push('full_bundle_digest_changed');
 const moduleStable=errors.length===0;
 const fullyStable=moduleStable&&auxiliaryDifferences.length===0;
 return Object.freeze({schema:'thebe.assets.reproducibility.v2',
  sourceSha:SHA.test(expectedSha||'')?expectedSha:null,
  executableModuleReproducible:moduleStable,reproducible:fullyStable,
  fullArtifactProvenanceReady:false,
  sourceInputDigest:moduleStable?first.inputManifestDigest:null,
  bundleDigest:fullyStable?first.bundleDigest:null,
  sourceToCloudflareUploadVerified:false,
  versionCreationAuthorized:false,deploymentAuthorized:false,
  errors:Object.freeze(errors),auxiliaryDifferences:Object.freeze(auxiliaryDifferences)});
}
export function runIndependentDryRuns({expectedSha,compile=collectBundledReceipt}={}){
 if(!SHA.test(expectedSha||''))throw Error('expected_main_sha_required');
 // Two independent Wrangler processes in distinct temporary directories.
 const first=compile({expectedSha}),second=compile({expectedSha});
 const result=compareIndependentDryRuns({expectedSha,first,second});
 if(!result.executableModuleReproducible)throw Error('worker_executable_not_reproducible:'+result.errors.join(','));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(runIndependentDryRuns({expectedSha:process.env.EXPECTED_MAIN_SHA})))}
 catch(e){console.error(String(e.message).replace(/[^a-zA-Z0-9_:,-]/g,'_'));process.exitCode=1}
}
