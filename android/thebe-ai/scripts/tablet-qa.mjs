#!/usr/bin/env node
// Local-only Thebe AI physical-tablet acceptance manifest.
// Manual observations are never inferred from CI/emulator results.
// Only structured statuses are accepted; raw device IDs, URLs, notes,
// account records, screenshots, voice recordings or customer data are forbidden.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CHECKS = Object.freeze([
  'apk-checksum-matched',
  'app-install-and-launch',
  'public-login-visible',
  'auth-login-synthetic',
  'auth-logout',
  'auth-session-return',
  'auth-account-isolation',
  'browser-url-and-auth-redirect',
  'browser-missing-safe-fallback',
  'network-offline-reconnect',
  'chat-edit-and-send',
  'chat-error-retry',
  'microphone-allow',
  'microphone-deny',
  'voice-orb-reacts-to-audio',
  'voice-interruption-recovery',
  'ai-pill-movable',
  'ai-dock-expand-collapse',
  'notification-bell-movable',
  'notification-full-text-and-actions',
  'dock-bell-bottom-navigation-clearance',
  'keyboard-no-clipping',
  'landscape-no-clipping',
  'zoom-200-percent',
  'gesture-navigation-and-back',
  'pdf-print-user-gesture',
  'file-chooser-user-gesture',
  'layout-css-320',
  'layout-css-375',
  'layout-css-414',
  'layout-css-430',
  'layout-css-768',
]);

const TABLET_CLASSES=['tablet-small','tablet-medium','tablet-large'];
const BROWSER_FAMILIES=['chrome','chromium','other-approved-browser'];
const STATES=['pass','fail','blocked','not_run'];
const allowed=(x,keys)=>!!x && typeof x==='object' && !Array.isArray(x) &&
  Object.keys(x).every(k=>keys.includes(k)) && keys.every(k=>Object.hasOwn(x,k));

export function template(){
  return {
    schemaVersion:1,
    deviceClass:'tablet-medium',
    androidApi:null,
    browserFamily:'chrome',
    browserMajor:null,
    sourceSha:'',
    apkSha256:'',
    checks:CHECKS.map(id=>({id,status:'not_run'})),
  };
}
export function assess(value){
  if(!allowed(value,['schemaVersion','deviceClass','androidApi','browserFamily','browserMajor','sourceSha','apkSha256','checks']))
    return {status:'invalid', reason:'unexpected or missing report fields'};
  if(value.schemaVersion!==1 || !TABLET_CLASSES.includes(value.deviceClass) ||
     !Number.isInteger(value.androidApi) || value.androidApi<26 || value.androidApi>50 ||
     !BROWSER_FAMILIES.includes(value.browserFamily) ||
     !Number.isInteger(value.browserMajor) || value.browserMajor<1 || value.browserMajor>999 ||
     typeof value.sourceSha!=='string' || !/^[a-f0-9]{40}$/i.test(value.sourceSha) ||
     typeof value.apkSha256!=='string' || !/^[a-f0-9]{64}$/i.test(value.apkSha256) ||
     /^0{64}$/.test(value.apkSha256.toLowerCase()))
    return {status:'invalid',reason:'incomplete or invalid device/build evidence metadata'};
  if(!Array.isArray(value.checks) || value.checks.length!==CHECKS.length)
    return {status:'invalid',reason:'missing or extra acceptance checks'};
  const seen=new Set(), counts={pass:0,fail:0,blocked:0,not_run:0};
  for(const check of value.checks){
    if(!check || typeof check!=='object' || Array.isArray(check))return {status:'invalid',reason:'invalid check record'};
    const keys=Object.keys(check).sort().join(',');
    if(keys!=='id,status' && keys!=='id,issue,status')
      return {status:'invalid',reason:'unexpected check fields: free-text or personal data not permitted'};
    if(typeof check.id!=='string' || !CHECKS.includes(check.id) || seen.has(check.id) || !STATES.includes(check.status))
      return {status:'invalid',reason:'duplicate, unknown, or invalid acceptance check'};
    if(Object.hasOwn(check,'issue')){
      if(!['fail','blocked'].includes(check.status) || typeof check.issue!=='string' ||
         !/^#[1-9][0-9]{0,7}$/.test(check.issue))
        return {status:'invalid',reason:'issue must be a short issue number for failed or blocked checks'};
    }
    seen.add(check.id);
    counts[check.status]++;
  }
  if(seen.size!==CHECKS.length)return {status:'invalid',reason:'incomplete acceptance coverage'};
  return {
    status:counts.pass===CHECKS.length ? 'complete' : 'incomplete',
    counts,
    total:CHECKS.length,
  };
}
export function run(args=process.argv.slice(2)){
  if(args.length===1 && args[0]==='--template'){
    process.stdout.write(JSON.stringify(template(),null,2)+'\n');
    return 0;
  }
  if(args.length!==2 || args[0]!=='--validate'){
    process.stderr.write('Usage: node tablet-qa.mjs --template OR --validate <local-redacted-report.json>\n');
    return 2;
  }
  let data;
  try {
    const info=fs.statSync(args[1]);
    if(!info.isFile() || info.size===0 || info.size>64*1024)throw new Error('invalid file');
    data=JSON.parse(fs.readFileSync(args[1],'utf8'));
  } catch {
    process.stderr.write('INVALID: inaccessible, oversized or non-JSON local QA manifest.\n');
    return 2;
  }
  const result=assess(data);
  if(result.status==='invalid'){
    process.stderr.write('INVALID: '+result.reason+'.\n');
    return 2;
  }
  const c=result.counts;
  // Print only aggregate status counts, never raw manifest content or metadata.
  process.stdout.write('Physical tablet QA: '+result.status.toUpperCase()+
    ' | passed='+c.pass+' failed='+c.fail+' blocked='+c.blocked+' not_run='+c.not_run+
    ' of '+result.total+'.\n');
  process.stdout.write('This validates a tester-authored checklist; it does not independently verify the device or build.\n');
  if(result.status!=='complete')process.stdout.write('BLOCKED: not all physical-device acceptance checks passed.\n');
  return result.status==='complete' ? 0 : 1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=run();
}
