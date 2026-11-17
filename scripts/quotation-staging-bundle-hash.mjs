/**
 * Deterministic manifest of offline Wrangler build files.
 * Not evidence of Cloudflare upload, binding verification or owner sign-off.
 */
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,statSync} from "node:fs";
import {resolve,relative,join} from "node:path";
const fail=reason=>{throw Error("quotation_bundle_"+reason)};
export function hashBundleDirectory(dir){
 const root=resolve(dir);
 const files=[];
 function descend(path){
  for(const item of readdirSync(path,{withFileTypes:true})){
   const name=join(path,item.name);
   if(item.isSymbolicLink())fail("symlink_forbidden");
   if(item.isDirectory())descend(name);
   else if(item.isFile())files.push(name);
   else fail("unsupported_file");
  }
 }
 descend(root);
 if(!files.length)fail("empty");
 const entries=files.map(path=>{
  const key=relative(root,path).replaceAll("\\","/");
  const bytes=readFileSync(path);
  return {path:key,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
 }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const payload=JSON.stringify(entries);
 return Object.freeze({entries,manifestSha256:createHash("sha256").update(payload).digest("hex")});
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const [dir,sourceSha]=process.argv.slice(2);
 if(!/^[0-9a-f]{40}$/.test(sourceSha||""))fail("invalid_source");
 process.stdout.write(JSON.stringify({sourceSha,mode:"OFFLINE_BUILD_ONLY",
  ...hashBundleDirectory(dir),deployAuthorized:false},null,2)+"\n");
}
