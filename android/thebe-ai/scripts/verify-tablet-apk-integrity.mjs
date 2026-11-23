#!/usr/bin/env node
// LOCAL, READ-ONLY Thebe AI debug APK byte-integrity preflight.
// This verifies only a checksum obtained independently from trusted CI.
// It does NOT validate APK signing, GitHub provenance, login, device hardware,
// website trust, production release readiness, or permissions.
import {createHash, timingSafeEqual} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {basename} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_BYTES=100*1024*1024;
export const EXPECTED_APK_NAME='app-debug.apk';

export function normalizeSha256(value){
  if(typeof value!=='string')return null;
  const clean=value.trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(clean) || /^0{64}$/.test(clean))return null;
  return clean;
}

export async function checkLocalApk(apkFile,expectedSha){
  const expected=normalizeSha256(expectedSha);
  if(!expected)return {status:'invalid',reason:'expected SHA-256 digest must be 64 nonzero hex characters'};
  if(typeof apkFile!=='string' || !apkFile || basename(apkFile)!==EXPECTED_APK_NAME)
    return {status:'invalid',reason:'expected internal app-debug.apk file'};
  let info;
  try {info=await lstat(apkFile);}
  catch {return {status:'invalid',reason:'local APK is unavailable'};}
  if(!info.isFile() || info.isSymbolicLink() || !Number.isSafeInteger(info.size) ||
     info.size<=0 || info.size>MAX_BYTES)
    return {status:'invalid',reason:'APK is not a nonempty regular file within the internal test size limit'};
  let actual;
  try {
    const hash=createHash('sha256');
    for await (const chunk of createReadStream(apkFile))hash.update(chunk);
    actual=hash.digest();
  } catch {
    return {status:'invalid',reason:'unable to read local APK'};
  }
  const trusted=Buffer.from(expected,'hex');
  if(!timingSafeEqual(actual,trusted))
    return {status:'mismatch',reason:'APK bytes differ from independently supplied digest'};
  return {status:'match',reason:'local APK bytes match expected digest'};
}

export async function run(args=process.argv.slice(2)){
  if(args.length===1 && args[0]==='--help'){
    process.stdout.write('Read-only integrity check: --apk <app-debug.apk> --expected-sha256 <trusted-SHA256>.\\n');
    return 0;
  }
  if(args.length!==4 || args[0]!=='--apk' || args[2]!=='--expected-sha256'){
    process.stderr.write('BLOCKED: expected --apk <app-debug.apk> --expected-sha256 <trusted-SHA256>.\\n');
    return 2;
  }
  const result=await checkLocalApk(args[1],args[3]);
  if(result.status!=='match'){
    process.stderr.write((result.status==='mismatch'?'BLOCKED: ':'INVALID: ')+result.reason+'.\\n');
    return result.status==='mismatch'?1:2;
  }
  process.stdout.write('MATCH: internal debug APK bytes match the independently supplied SHA-256 digest.\\n');
  process.stdout.write('NOT VERIFIED: origin of digest, GitHub source SHA, APK signature, physical tablet, trusted full-screen mode or release readiness.\\n');
  return 0;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  process.exitCode=await run();
