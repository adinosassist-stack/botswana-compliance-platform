import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export function sha256Bytes(value){return crypto.createHash('sha256').update(value).digest('hex');}
export function sha256File(file){return sha256Bytes(fs.readFileSync(file));}

function exactVersion(value){return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(value||''));}
function componentNameFromPath(pkgPathKey){return pkgPathKey.split('node_modules/').pop();}
function purl(name,version){
  if(name.startsWith('@')){const slash=name.indexOf('/');return `pkg:npm/${encodeURIComponent(name.slice(0,slash))}/${encodeURIComponent(name.slice(slash+1))}@${version}`;}
  return `pkg:npm/${encodeURIComponent(name)}@${version}`;
}
function serialFromLock(rawLock){
  const lockHash=crypto.createHash('sha256').update(rawLock).digest();
  const uuid=Buffer.from(lockHash.subarray(0,16));uuid[6]=(uuid[6]&0x0f)|0x50;uuid[8]=(uuid[8]&0x3f)|0x80;
  const h=uuid.toString('hex');
  return `urn:uuid:${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function validateLockAndBuildSbom(root){
  const pkgPath=path.join(root,'package.json'),lockPath=path.join(root,'package-lock.json');
  if(!fs.existsSync(lockPath))throw new Error('BF-07 release blocker: package-lock.json is missing. Generate it with the pinned npm toolchain in a registry-enabled clean environment; do not synthesize a lockfile.');
  const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  if(!/^npm@\d+\.\d+\.\d+$/.test(String(pkg.packageManager||'')))throw new Error('package.json must pin packageManager as npm@<exact-version>');
  const rawLock=fs.readFileSync(lockPath),lock=JSON.parse(rawLock);
  if(Number(lock.lockfileVersion)<3)throw new Error('package-lock.json must use lockfileVersion 3+');
  if(lock.name!==pkg.name||lock.version!==pkg.version)throw new Error('package-lock root metadata does not match package.json');
  const rootMeta=lock.packages?.[''];
  if(!rootMeta||rootMeta.name!==pkg.name||rootMeta.version!==pkg.version)throw new Error('package-lock root package metadata is missing or stale');

  for(const section of ['dependencies','devDependencies']){
    const declared=pkg[section]||{},lockedRoot=rootMeta[section]||{};
    for(const [name,version] of Object.entries(declared)){
      if(!exactVersion(version))throw new Error(`Direct ${section} must be exact-pinned for BF-07: ${name}=${version}`);
      if(String(lockedRoot[name])!==String(version))throw new Error(`package-lock root ${section} mismatch for ${name}`);
      const meta=lock.packages?.[`node_modules/${name}`];
      if(!meta?.version)throw new Error(`package-lock is missing direct ${section} package ${name}`);
      if(String(meta.version)!==String(version))throw new Error(`package-lock version mismatch for ${name}: expected ${version}, got ${meta.version}`);
    }
    for(const name of Object.keys(lockedRoot))if(!(name in declared))throw new Error(`package-lock root contains stale ${section} entry ${name}`);
  }

  const componentsByRef=new Map();
  let lockedCount=0;
  for(const [pkgPathKey,meta] of Object.entries(lock.packages||{})){
    if(!pkgPathKey||!meta?.version)continue;
    lockedCount++;
    if(meta.link)throw new Error(`linked package is not allowed in release lock: ${pkgPathKey}`);
    const resolved=String(meta.resolved||'');
    if(!resolved.startsWith('https://registry.npmjs.org/'))throw new Error(`non-registry or missing resolved source for ${pkgPathKey}`);
    const integrity=String(meta.integrity||'');
    if(!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity))throw new Error(`missing/unsupported sha512 integrity for ${pkgPathKey}`);
    const hex=Buffer.from(integrity.slice('sha512-'.length),'base64').toString('hex');
    if(hex.length!==128)throw new Error(`invalid sha512 integrity length for ${pkgPathKey}`);
    const name=componentNameFromPath(pkgPathKey),version=String(meta.version),ref=purl(name,version);
    if(componentsByRef.has(ref))continue;
    const component={type:'library',name,version,'bom-ref':ref,purl:ref,hashes:[{alg:'SHA-512',content:hex}]};
    const license=typeof meta.license==='string'?meta.license.trim():'';
    if(/^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(license))component.licenses=[{license:{id:license}}];
    componentsByRef.set(ref,component);
  }
  if(lockedCount===0)throw new Error('package-lock contains no resolved package components');

  const lockSha256=sha256Bytes(rawLock);
  const components=[...componentsByRef.values()].sort((a,b)=>a['bom-ref'].localeCompare(b['bom-ref']));
  const appRef=purl(pkg.name,pkg.version);
  const bom={
    bomFormat:'CycloneDX',specVersion:'1.5',serialNumber:serialFromLock(rawLock),version:1,
    metadata:{component:{type:'application',name:pkg.name,version:pkg.version,'bom-ref':appRef,purl:appRef},properties:[{name:'bw.release.lock.sha256',value:lockSha256},{name:'bw.release.package-manager',value:pkg.packageManager}]},
    components
  };
  return {pkg,lock,rawLock,lockSha256,components,bom,serialized:JSON.stringify(bom,null,2)+'\n'};
}
