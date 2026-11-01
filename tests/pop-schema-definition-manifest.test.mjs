import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
function run(objects){const dir=mkdtempSync(join(tmpdir(),'pop-catalog-'));try{const p=join(dir,'manifest.json');writeFileSync(p,JSON.stringify({objects}));return spawnSync(process.execPath,['scripts/validate-pop-schema-definition-manifest.mjs',p],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
test('valid metadata-only manifest reports no writes',()=>{const r=run([{name:'tenants',type:'table',tbl_name:'tenants',ddl_length:140}]);assert.equal(r.status,0);const out=JSON.parse(r.stdout);assert.equal(out.productionWritePerformed,false);assert.equal(out.stagingCompatibilityProven,false);});
test('empty manifests fail closed',()=>assert.equal(run([]).status,2));
test('missing DDL fails closed',()=>assert.equal(run([{name:'x',type:'table',tbl_name:'x',ddl_length:0}]).status,2));
test('duplicate object fails closed',()=>{const x={name:'x',type:'table',tbl_name:'x',ddl_length:4};assert.notEqual(run([x,x]).status,0);});
test('reject unsupported types',()=>assert.notEqual(run([{name:'x',type:'secret',tbl_name:'x',ddl_length:4}]).status,0));
