import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CHECKS,template,assess} from '../android/thebe-ai/scripts/tablet-qa.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'android/thebe-ai/scripts/tablet-qa.mjs');
const passed=()=>{
  const a=template();
  a.deviceClass='tablet-medium';
  a.androidApi=35;
  a.browserMajor=132;
  a.sourceSha='a'.repeat(40);
  a.apkSha256='b'.repeat(64);
  a.checks=a.checks.map(c=>({...c,status:'pass'}));
  return a;
};

test('new template is explicitly not run, never a passing device result',()=>{
  const t=template();
  assert.equal(t.schemaVersion,1);
  assert.equal(t.checks.length,CHECKS.length);
  assert.deepEqual(new Set(t.checks.map(c=>c.id)).size,CHECKS.length);
  assert.ok(t.checks.every(c=>c.status==='not_run'));
  assert.equal(assess(t).status,'invalid'); // missing build/device metadata is a blocker
});
test('every manual check is required and only all-pass is complete',()=>{
  const r=passed();
  assert.deepEqual(assess(r),{status:'complete',counts:{pass:CHECKS.length,fail:0,blocked:0,not_run:0},total:CHECKS.length});
  for(const status of ['fail','blocked','not_run']){
    const item=structuredClone(r);
    item.checks[0].status=status;
    const result=assess(item);
    assert.equal(result.status,'incomplete');
    assert.equal(result.counts[status],1);
  }
});
test('missing, duplicate and invented checks are invalid',()=>{
  for(const mode of ['missing','duplicate','unknown','extra']){
    const r=passed();
    if(mode==='missing')r.checks.pop();
    if(mode==='duplicate')r.checks[1].id=r.checks[0].id;
    if(mode==='unknown')r.checks[0].id='paid-activation';
    if(mode==='extra')r.checks.push({id:'custom',status:'pass'});
    assert.equal(assess(r).status,'invalid',mode);
  }
});
test('free-text, account and device identification fields are rejected',()=>{
  for(const field of ['deviceId','email','account','recording','notes','screenshotPath','signedOffBy']){
    const r=passed();r[field]='private@example.com';
    assert.equal(assess(r).status,'invalid');
    const s=passed();s.checks[0][field]='private@example.com';
    assert.equal(assess(s).status,'invalid');
  }
});
test('device/build identity requires real-looking digests without asserting provenance',()=>{
  const variations=[
    ['androidApi',25],['androidApi',null],['androidApi','35'],
    ['browserMajor',null],['browserMajor','132'],
    ['deviceClass','unknown'],['browserFamily','other'],
    ['sourceSha','bad'],['apkSha256','0'.repeat(64)],
  ];
  for(const [field,val] of variations){
    const r=passed();r[field]=val;
    assert.equal(assess(r).status,'invalid',field);
  }
});
test('GitHub issue number allowed only for a failing or blocked case',()=>{
  const r=passed();
  r.checks[0].issue='#2715';
  assert.equal(assess(r).status,'invalid');
  r.checks[0].status='blocked';
  assert.equal(assess(r).status,'incomplete');
  for(const v of ['https://github.com/example/1','2715','#0','#123456789','private@example.com']){
    r.checks[0].issue=v;
    assert.equal(assess(r).status,'invalid');
  }
});
test('CLI returns nonzero on not-run, malformed and privacy-unsafe records; output is aggregate only',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'thebe-android-qa-'));
  try {
    const file=path.join(directory,'report.json');
    const run=(data)=>{
      fs.writeFileSync(file,JSON.stringify(data));
      return spawnSync(process.execPath,[script,'--validate',file],{encoding:'utf8'});
    };
    const pass=run(passed());
    assert.equal(pass.status,0);
    assert.match(pass.stdout,/COMPLETE/);
    const incomplete=passed();incomplete.checks[5].status='not_run';
    const blocked=run(incomplete);
    assert.equal(blocked.status,1);
    assert.match(blocked.stdout,/not_run=1/);
    assert.doesNotMatch(blocked.stdout,/sourceSha|apkSha256|private@example/);
    const unsafe=passed();unsafe.checks[1].notes='private@example.com';
    const fail=run(unsafe);
    assert.equal(fail.status,2);
    assert.doesNotMatch(fail.stderr,/private@example/);
    const tmpl=spawnSync(process.execPath,[script,'--template'],{encoding:'utf8'});
    assert.equal(tmpl.status,0);
    assert.equal(JSON.parse(tmpl.stdout).checks.length,CHECKS.length);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
