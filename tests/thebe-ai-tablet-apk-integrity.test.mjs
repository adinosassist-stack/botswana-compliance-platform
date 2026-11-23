import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {normalizeSha256,checkLocalApk,EXPECTED_APK_NAME} from '../android/thebe-ai/scripts/verify-tablet-apk-integrity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(root,'android/thebe-ai/scripts/verify-tablet-apk-integrity.mjs');
const sha=(b)=>createHash('sha256').update(b).digest('hex');

test('digest parser requires exactly one nonzero SHA-256 hex value',()=>{
  const d='ab'.repeat(32);
  assert.equal(normalizeSha256(d.toUpperCase()),d);
  assert.equal(normalizeSha256('  '+d+'  '),d);
  for(const bad of [null,'','ABC',d.slice(0,-1),'g'.repeat(64),'0'.repeat(64),d+'extra',123])
    assert.equal(normalizeSha256(bad),null);
});
test('local byte-integrity check distinguishes mismatch and match without claiming signing',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thebe-apk-'));
  try{
    const apk=path.join(dir,EXPECTED_APK_NAME);
    const contents=Buffer.from('Synthetic fixture only; not a valid APK.');
    fs.writeFileSync(apk,contents);
    assert.equal((await checkLocalApk(apk,sha(contents))).status,'match');
    assert.equal((await checkLocalApk(apk,'a'.repeat(64))).status,'mismatch');
    assert.equal((await checkLocalApk(apk,'invalid')).status,'invalid');
    assert.equal((await checkLocalApk(path.join(dir,'missing.apk'),sha(contents))).status,'invalid');
    const renamed=path.join(dir,'something-else.apk');
    fs.writeFileSync(renamed,contents);
    assert.equal((await checkLocalApk(renamed,sha(contents))).status,'invalid');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('symlink, directory, zero byte and oversized APK are rejected',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thebe-apk-'));
  try{
    const apk=path.join(dir,EXPECTED_APK_NAME);
    fs.writeFileSync(apk,'');
    assert.equal((await checkLocalApk(apk,'b'.repeat(64))).status,'invalid');
    fs.truncateSync(apk,100*1024*1024+1); // sparse metadata, never read the oversized file
    assert.equal((await checkLocalApk(apk,'b'.repeat(64))).status,'invalid');
    fs.unlinkSync(apk);
    fs.symlinkSync(path.join(dir,'target'),apk);
    assert.equal((await checkLocalApk(apk,'b'.repeat(64))).status,'invalid');
    fs.unlinkSync(apk);
    fs.mkdirSync(apk);
    assert.equal((await checkLocalApk(apk,'b'.repeat(64))).status,'invalid');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI logs only aggregate byte-integrity finding and has no installation side effects',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thebe-apk-'));
  try{
    const apk=path.join(dir,EXPECTED_APK_NAME);
    const secretPath=path.join(dir,'local-sensitive-folder');
    const fixture=Buffer.from('A fixture that is not a real APK.');
    fs.writeFileSync(apk,fixture);
    const run=(digest)=>spawnSync(process.execPath,[cli,'--apk',apk,'--expected-sha256',digest],{encoding:'utf8'});
    const match=run(sha(fixture));
    assert.equal(match.status,0,match.stderr);
    assert.match(match.stdout,/MATCH: internal debug APK bytes match/);
    assert.match(match.stdout,/NOT VERIFIED:/);
    const fail=run('f'.repeat(64));
    assert.equal(fail.status,1);
    assert.match(fail.stderr,/BLOCKED:/);
    const invalid=run('not-sha');
    assert.equal(invalid.status,2);
    const noArg=spawnSync(process.execPath,[cli],{encoding:'utf8'});
    assert.equal(noArg.status,2);
    for(const result of [match,fail,invalid,noArg])
      assert.doesNotMatch(result.stdout+result.stderr,new RegExp('local-sensitive-folder|thebe-apk-|app-debug\\.apk\\/'));
    const source=fs.readFileSync(cli,'utf8');
    assert.doesNotMatch(source,/\b(?:adb|fetch\(|https?:\/\/|upload|execFile|execSync|spawn\(|writeFile|unlink|rmSync)\b/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
