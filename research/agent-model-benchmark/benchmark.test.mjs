import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('./benchmark.mjs',import.meta.url).pathname;
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures.json',import.meta.url),'utf8'));
function run(runs){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thebe-benchmark-'));const p=path.join(dir,'runs.json');try{fs.writeFileSync(p,JSON.stringify({runs}));return spawnSync(process.execPath,[script,p],{encoding:'utf8'});}finally{fs.rmSync(dir,{recursive:true,force:true})}}
const make=(model)=>fixtures.map(f=>({model,fixture:f.id,success:true,denialCorrect:true,latencyMs:100,inputTokens:100,outputTokens:50,inputPricePerMillionUsd:1,outputPricePerMillionUsd:2}));
test('two complete models produce comparable metrics',()=>{const r=run([...make('baseline'),...make('candidate')]);assert.equal(r.status,0,r.stderr);const data=JSON.parse(r.stdout);assert.equal(data.models.length,2);assert.equal(data.models[0].successRate,1);assert.equal(data.models[0].securityDenialRate,1);assert.ok(data.models[0].costPerSuccessUsd>0)});
test('missing fixture fails',()=>{const r=run([...make('baseline').slice(1),...make('candidate')]);assert.notEqual(r.status,0);assert.match(r.stderr,/missing/)});
test('single model fails',()=>{assert.notEqual(run(make('baseline')).status,0)});
test('security denial fails closed',()=>{const a=make('baseline');a.find(x=>x.fixture==='cross-tenant-denial').denialCorrect=false;const r=run([...a,...make('candidate')]);assert.notEqual(r.status,0);assert.match(r.stderr,/security denial/)});
test('invalid numeric data rejected',()=>{const a=make('baseline');a[0].latencyMs=-1;assert.notEqual(run([...a,...make('candidate')]).status,0)});
