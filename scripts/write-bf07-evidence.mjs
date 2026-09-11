import fs from 'node:fs';
import path from 'node:path';
import {buildEvidenceManifest} from './bf07-evidence-core.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const manifest=buildEvidenceManifest(root,{
  nodeVersion:process.versions.node,
  npmVersion:process.env.BF07_NPM_VERSION,
  registryLiveVerified:process.env.BF07_REGISTRY_LIVE==='1',
  cleanCache:process.env.BF07_CLEAN_CACHE==='1',
  npmCiVerified:process.env.BF07_NPM_CI_VERIFIED==='1'
});
fs.writeFileSync(path.join(root,'bf07-evidence.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('BF-07 evidence manifest written and hash-bound to lockfile, SBOM, and audit report');
