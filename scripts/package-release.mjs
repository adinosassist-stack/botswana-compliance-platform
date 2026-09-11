import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const excludedDirs=new Set(['.git','node_modules','dist','coverage','.wrangler']);
const excludedNames=new Set(['.env','.dev.vars','.npmrc.local','.DS_Store']);
const forbiddenExt=/\.(?:zip|pem|key|p12|pfx|sqlite|sqlite3|log)$/i;
const out=path.resolve(process.argv[2]||path.join(root,'dist',`THEBE_DESK_V81_RECOVERY_R1_${pkg.version.replaceAll('.','')}_RELEASE_SEALED.zip`));
const sidecar=out+'.sha256';

for(const f of ['package-lock.json','sbom.cdx.json','audit-report.json','bf07-evidence.json','bf07-provenance.json','.nvmrc','scripts/resolve-bf07.sh','.github/workflows/bf07-seal.yml']){
  if(!fs.existsSync(path.join(root,f)))throw new Error(`Release packaging blocked: ${f} is missing`);
}
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.rmSync(out,{force:true});fs.rmSync(sidecar,{force:true});

function shouldSkipFile(name){return excludedNames.has(name)||forbiddenExt.test(name);}
function hashFile(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function snapshotFile(base,full){
  const rel=path.relative(base,full).replaceAll(path.sep,'/');
  const fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const st=fs.fstatSync(fd);if(!st.isFile())throw new Error(`Release snapshot entry is not a regular file: ${rel}`);const digest=crypto.createHash('sha256').update(fs.readFileSync(fd)).digest('hex');return [rel,digest,st.mode&0o777];}
  finally{fs.closeSync(fd);}
}
function snapshot(base){
  const entries=[];
  function walk(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const full=path.join(dir,e.name),rel=path.relative(base,full).replaceAll(path.sep,'/');
      if(e.isSymbolicLink())throw new Error(`Symlink cannot be release-snapshotted: ${rel}`);
      if(e.isDirectory()){if(excludedDirs.has(e.name))continue;walk(full);continue;}
      if(!e.isFile()||shouldSkipFile(e.name))continue;
      entries.push(snapshotFile(base,full));
    }
  }
  walk(base);return entries;
}
function sameSnapshot(a,b){return a.length===b.length&&a.every((x,i)=>x[0]===b[i][0]&&x[1]===b[i][1]&&x[2]===b[i][2]);}

const before=snapshot(root);
const release=spawnSync('npm',['run','release:check'],{cwd:root,stdio:'inherit',env:{...process.env,BF07_PACKAGER:'1'}});
if(release.status!==0)process.exit(release.status||1);
const after=snapshot(root);
if(!sameSnapshot(before,after))throw new Error('Release packaging blocked: source tree changed during release:check');

const stage=fs.mkdtempSync(path.join(os.tmpdir(),'bw-release-'));
try{
  function copy(src,dst){
    const st=fs.lstatSync(src);if(st.isSymbolicLink())throw new Error(`Symlink cannot be packaged: ${path.relative(root,src)}`);
    if(st.isDirectory()){if(excludedDirs.has(path.basename(src)))return;fs.mkdirSync(dst,{recursive:true});for(const n of fs.readdirSync(src).sort())copy(path.join(src,n),path.join(dst,n));return;}
    if(shouldSkipFile(path.basename(src)))return;
    fs.copyFileSync(src,dst);
  }
  for(const n of fs.readdirSync(root).sort())copy(path.join(root,n),path.join(stage,n));
  const staged=snapshot(stage);
  if(!sameSnapshot(before,staged))throw new Error('Release packaging blocked: staged archive input differs from the fully tested source snapshot');

  const epoch=Number(process.env.SOURCE_DATE_EPOCH||1788480000);
  function normalize(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())normalize(p);fs.utimesSync(p,epoch,epoch);}fs.utimesSync(dir,epoch,epoch)}
  normalize(stage);
  const files=staged.map(([rel])=>rel);
  const zip=spawnSync('zip',['-X','-9','-q',out,'-@'],{cwd:stage,input:files.join('\n')+'\n',encoding:'utf8'});
  if(zip.status!==0)throw new Error(`zip failed: ${zip.stderr||zip.stdout}`);
  const digest=hashFile(out);fs.writeFileSync(sidecar,`${digest}  ${path.basename(out)}\n`);
  console.log(`Release package sealed from unchanged fully tested source: ${out}`);console.log(`SHA-256 ${digest}`);
} finally {
  fs.rmSync(stage,{recursive:true,force:true});
}
