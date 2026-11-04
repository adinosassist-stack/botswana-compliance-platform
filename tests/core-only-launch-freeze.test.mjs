import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {qualifyCoreOnly,verifyCoreOnlyFreeze} from '../scripts/qualify-core-only-release.mjs';

const config=readFileSync('cloudflare/wrangler.toml','utf8');
const worker=readFileSync('cloudflare/src/worker.js','utf8');
const exportSpec=readFileSync('docs/ai-export-private-safety-consolidation-20261103.md','utf8');
const workflow=readFileSync('.github/workflows/deploy-production.yml','utf8');

test('core-only production template and Worker are fail closed',()=>{
  assert.deepEqual(qualifyCoreOnly(),{scope:'core_only',popIngestionEnabled:false,advancedAiExportsEnabled:false});
});
test('production template cannot turn on POP or advanced exports',()=>{
  for(const name of ['POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED','THEBE_GENERAL_AI_ENABLED']){
    const changed=config.replace(name+' = "false"',name+' = "true"');
    assert.notEqual(changed,config);
    assert.throws(()=>verifyCoreOnlyFreeze({config:changed,worker,exportSpec}),/must be explicitly false/);
  }
});
test('production POP guard and disabled staging flag are independently required',()=>{
  assert.throws(()=>verifyCoreOnlyFreeze({
    config,worker:worker.replace('if(env?.APP_ENV==="production")return json({error:"pop_upload_disabled"},503);',''),exportSpec
  }),/production must never enter staging-only ingestion/);
  assert.throws(()=>verifyCoreOnlyFreeze({
    config,worker:worker.replace('if(String(env?.POP_UPLOAD_STAGING_ENABLED||"false")!=="true")return json({error:"pop_upload_disabled"},503);',''),exportSpec
  }),/pop_upload_disabled/);
});
test('newly mounted advanced export endpoint must stop core-only release',()=>{
  assert.throws(()=>verifyCoreOnlyFreeze({config,worker:worker+'\nconst forbidden="/api/ai/export";\n',exportSpec}),{code:'ERR_ASSERTION'});
});
test('production deployment checks freeze before dry-run and again before mutation',()=>{
  const marker='node scripts/qualify-core-only-release.mjs "$PROD_CONFIG"';
  assert.equal(workflow.split(marker).length-1,2);
  const first=workflow.indexOf(marker),second=workflow.lastIndexOf(marker);
  assert.ok(first>workflow.indexOf('sh cloudflare/preflight-production.sh "$PROD_CONFIG"'));
  assert.ok(second>workflow.indexOf('name: Deploy exact candidate to Cloudflare'));
  assert.ok(second<workflow.indexOf('test -s "$SECRETS_FILE"'));
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/BF-07 Supply-Chain Seal/);
});

test('production freeze rejects contradictory env-scope overrides and duplicate declarations',()=>{
  for(const [name,value] of [
    ['POP_UPLOAD_STAGING_ENABLED','false'],
    ['THEBE_AI_EXPORTS_ENABLED','false'],
    ['THEBE_GENERAL_AI_ENABLED','false'],
    ['APP_ENV','production']
  ]){
    const declaration=name+' = "'+value+'"';
    assert.ok(config.includes(declaration),'expected canonical declaration: '+name);
    for(const duplicate of [declaration,name+' = "'+(name==='APP_ENV'?'staging':'true')+'"']){
      const changed=config+'\n[env.production.vars]\n'+duplicate+'\n';
      assert.throws(()=>verifyCoreOnlyFreeze({config:changed,worker,exportSpec}),/exactly one global assignment/,name);
    }
  }
});
