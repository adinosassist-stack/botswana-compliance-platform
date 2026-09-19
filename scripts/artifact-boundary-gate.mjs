import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const ignoredDirs=new Set(['.git','node_modules','dist','coverage','.wrangler']);
const forbiddenNames=new Set(['.env','.dev.vars','.npmrc.local','id_rsa','id_ed25519']);
const forbiddenExt=/\.(?:pem|key|p12|pfx|sqlite|sqlite3)$/i;
const findings=[];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name),rel=path.relative(root,full).replaceAll(path.sep,'/');
    if(entry.isSymbolicLink()){findings.push(`symlink:${rel}`);continue;}
    if(entry.isDirectory()){
      if(ignoredDirs.has(entry.name))continue;
      walk(full);continue;
    }
    if(!entry.isFile())continue;
    if(forbiddenNames.has(entry.name)||forbiddenExt.test(entry.name)||(/^\.env\./.test(entry.name)&&entry.name!=='.env.example'))findings.push(`forbidden-file:${rel}`);
  }
}
walk(root);
if(findings.length)throw new Error(`Artifact boundary violation(s): ${findings.join(', ')}`);

const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
for(const required of ['SESSION_SECRET=replace-','AUDIT_INTEGRITY_SECRET=replace-','RETENTION_JOB_SECRET=replace-','TURNSTILE_SECRET_KEY=replace-']){
  if(!env.includes(required))throw new Error(`.env.example must retain placeholder for ${required.split('=')[0]}`);
}
const wrangler=fs.readFileSync(path.join(root,'cloudflare/wrangler.toml'),'utf8');
if(!/^workers_dev\s*=\s*false$/m.test(wrangler))throw new Error('Production Worker must disable workers.dev');
if(!/^preview_urls\s*=\s*false$/m.test(wrangler))throw new Error('Production Worker must disable public Preview URLs');
const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
const pinned='node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32';
if((docker.match(new RegExp(pinned.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length!==2)throw new Error('Both Docker stages must pin the reviewed Node image by immutable digest');
if(!docker.includes('npm ci --omit=dev --ignore-scripts --no-audit --no-fund'))throw new Error('Docker dependency install must use npm ci with lifecycle scripts disabled');
if(/\bnpm install\b/.test(docker))throw new Error('Dockerfile must not use npm install');

const nvmrc=fs.readFileSync(path.join(root,'.nvmrc'),'utf8').trim().replace(/^v/,'');
if(nvmrc!=='22.23.2')throw new Error('BF-07 Node toolchain must remain pinned to .nvmrc 22.23.2');
const packageManager=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).packageManager;
if(packageManager!=='npm@10.9.8')throw new Error('BF-07 npm toolchain must match the npm bundled with Node 22.23.2');
const resolverPath=path.join(root,'scripts/resolve-bf07.sh'),workflowPath=path.join(root,'.github/workflows/bf07-seal.yml');
const releaseCorePath=path.join(root,'scripts/bf07-release-provenance-core.mjs'),releaseWriterPath=path.join(root,'scripts/write-bf07-release-provenance.mjs'),releaseGatePath=path.join(root,'scripts/bf07-release-provenance-gate.mjs');
if(!fs.existsSync(resolverPath)||!fs.existsSync(workflowPath))throw new Error('BF-07 resolver/workflow is missing from the release boundary');
if(!fs.existsSync(releaseCorePath)||!fs.existsSync(releaseWriterPath)||!fs.existsSync(releaseGatePath))throw new Error('BF-07 exact-archive release provenance validator is missing from the release boundary');
const resolver=fs.readFileSync(resolverPath,'utf8'),workflow=fs.readFileSync(workflowPath,'utf8');
const releaseCore=fs.readFileSync(releaseCorePath,'utf8'),evidenceCore=fs.readFileSync(path.join(root,'scripts/bf07-evidence-core.mjs'),'utf8');
for(const x of ['mktemp -d','NPM_CONFIG_CACHE','npm ping','rm -f package-lock.json sbom.cdx.json audit-report.json','bf07-provenance.json','npm install --package-lock-only --ignore-scripts','npm ci --ignore-scripts','node scripts/dependency-audit.mjs --json','npm run release:check','npm run check:bf07-evidence','npm run check:bf07-provenance','VERIFY_CACHE_DIR','Independent verification cache is unexpectedly non-empty','EXPECTED_SIDECAR_SHA=','VERIFY_ARCHIVE_COPY=','cp "$SEALED_ZIP" "$VERIFY_ARCHIVE_COPY"','Verification snapshot does not match sealed archive hash captured before independent verification','Release sidecar changed before independent verification','unzip -Z1 "$VERIFY_ARCHIVE_COPY"','zipinfo -l "$VERIFY_ARCHIVE_COPY"','unzip -q "$VERIFY_ARCHIVE_COPY"','Verification snapshot changed during independent verification','BF07_VERIFIED_ARCHIVE_SHA256="$EXPECTED_ZIP_SHA"','BF07_VERIFIED_SIDECAR_SHA256="$EXPECTED_SIDECAR_SHA"','node scripts/write-bf07-release-provenance.mjs','node scripts/bf07-release-provenance-gate.mjs','Sealed archive changed after independent verification','Release sidecar changed after independent verification'])if(!resolver.includes(x))throw new Error(`BF-07 resolver control missing: ${x}`);
for(const x of ['buildReleaseProvenance','validateReleaseProvenance','sealedArchiveSha256','sealedSidecarSha256','policySha256','release SHA-256 sidecar names the wrong archive','BF07_VERIFIED_ARCHIVE_SHA256','BF07_VERIFIED_SIDECAR_SHA256','sealed archive does not match independently verified archive hash','release sidecar does not match independently verified sidecar hash'])if(!releaseCore.includes(x))throw new Error(`BF-07 exact-archive provenance control missing: ${x}`);
for(const rel of ['scripts/bf07-release-provenance-core.mjs','scripts/write-bf07-release-provenance.mjs','scripts/bf07-release-provenance-gate.mjs'])if(!evidenceCore.includes(`'${rel}'`))throw new Error(`BF-07 evidence policy hash set omits: ${rel}`);
const archiveCapture=resolver.indexOf('EXPECTED_SIDECAR_SHA='),snapshotCopy=resolver.indexOf('cp "$SEALED_ZIP" "$VERIFY_ARCHIVE_COPY"'),snapshotHash=resolver.indexOf('Verification snapshot does not match sealed archive hash captured before independent verification'),archiveList=resolver.indexOf('ARCHIVE_LIST="$(unzip -Z1 "$VERIFY_ARCHIVE_COPY")"'),independentLaunch=resolver.indexOf('npm run launch:gate >/dev/null'),snapshotPostCheck=resolver.indexOf('Verification snapshot changed during independent verification'),releaseWrite=resolver.indexOf('node scripts/write-bf07-release-provenance.mjs'),releaseGate=resolver.indexOf('node scripts/bf07-release-provenance-gate.mjs'),postArchiveCheck=resolver.indexOf('Sealed archive changed after independent verification'),postSidecarCheck=resolver.indexOf('Release sidecar changed after independent verification');
if(archiveCapture<0||snapshotCopy<=archiveCapture||snapshotHash<=snapshotCopy||archiveList<=snapshotHash||independentLaunch<=archiveList||snapshotPostCheck<=independentLaunch||releaseWrite<=snapshotPostCheck||releaseGate<=releaseWrite||postArchiveCheck<=releaseGate||postSidecarCheck<=postArchiveCheck)throw new Error('BF-07 final verification must use a hash-checked private archive snapshot, bind pre-verification hashes, and recheck release outputs only after independent sealed-archive verification');
if(!resolver.includes('if [[ "$SUCCESS" -ne 1 ]]')||!resolver.includes('rm -f "$SEALED_ZIP" "$SEALED_SHA" package-lock.json sbom.cdx.json audit-report.json'))throw new Error('Failed BF-07 resolver runs must destroy partial dependency evidence and sealed outputs');
if(/NPM_TOKEN|_authToken|always-auth\s*=\s*true/.test(workflow))throw new Error('BF-07 public-registry workflow must not require or embed an npm authentication token');
if(!workflow.includes('permissions:\n  contents: read'))throw new Error('BF-07 workflow must use read-only repository permissions');
if(!workflow.includes('runs-on: ubuntu-24.04')||workflow.includes('ubuntu-latest'))throw new Error('BF-07 workflow runner must be pinned to ubuntu-24.04');
if(!workflow.includes('expected_sha:')||!workflow.includes('EXPECTED_SHA: ${{ inputs.expected_sha }}')||!workflow.includes('dispatch SHA mismatch'))throw new Error('BF-07 workflow must require explicit full commit-SHA confirmation');
if(!workflow.includes('concurrency:')||!workflow.includes('cancel-in-progress: false'))throw new Error('BF-07 workflow must serialize seal runs per ref without cancelling an in-flight seal');
if(!workflow.includes('bf07-provenance.json')||!workflow.includes('release-provenance.json'))throw new Error('BF-07 workflow must retain embedded and final archive provenance');
if(!workflow.includes('npm run check:bf07-toolchain'))throw new Error('BF-07 workflow must verify the Node/npm distribution pair before resolution');
if(/npm install --global\s+["']?npm@/.test(workflow)||workflow.includes('bf07-npm-cli.'))throw new Error('BF-07 workflow must not bootstrap a second npm CLI before dependency resolution');
for(const sha of ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1','actions/setup-node@820762786026740c76f36085b0efc47a31fe5020','actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'])if(!workflow.includes(sha))throw new Error(`BF-07 workflow action is not commit-pinned: ${sha.split('@')[0]}`);

const npmrc=fs.readFileSync(path.join(root,'.npmrc'),'utf8');
if(!/^save-exact=true$/m.test(npmrc)||!/^engine-strict=true$/m.test(npmrc))throw new Error('npm policy must enforce exact saves and engine compatibility');
if(/_authToken|always-auth\s*=\s*true/.test(npmrc))throw new Error('Project .npmrc must not contain registry credentials or always-auth');
console.log('Artifact boundary gate passed: no secret/key/database files or symlinks; production edge and container surfaces are pinned');
