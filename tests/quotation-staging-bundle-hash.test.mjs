import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {hashBundleDirectory} from "../scripts/quotation-staging-bundle-hash.mjs";
test("offline bundle receipt hashes every file deterministically",()=>{
 const dir=mkdtempSync(join(tmpdir(),"quote-bundle-"));
 try{
  mkdirSync(join(dir,"nested"));
  writeFileSync(join(dir,"nested","worker.mjs"),"export default {}");
  writeFileSync(join(dir,"metadata.json"),"{}");
  const a=hashBundleDirectory(dir),b=hashBundleDirectory(dir);
  assert.deepEqual(a,b);
  assert.equal(a.entries.length,2);
  assert.match(a.manifestSha256,/^[0-9a-f]{64}$/);
  writeFileSync(join(dir,"nested","worker.mjs"),"export default {fetch(){}}");
  assert.notEqual(hashBundleDirectory(dir).manifestSha256,a.manifestSha256);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("empty or symlinked bundle fails closed",()=>{
 const dir=mkdtempSync(join(tmpdir(),"quote-empty-"));
 try{
  assert.throws(()=>hashBundleDirectory(dir),/quotation_bundle_empty/);
  writeFileSync(join(dir,"script.js"),"code");
  symlinkSync(join(dir,"script.js"),join(dir,"alias.js"));
  assert.throws(()=>hashBundleDirectory(dir),/quotation_bundle_symlink_forbidden/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
