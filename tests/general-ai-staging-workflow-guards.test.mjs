import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow=readFileSync(new URL('../.github/workflows/general-ai-private-staging-qualification.yml',import.meta.url),'utf8');
const config=readFileSync(new URL('../cloudflare/wrangler.general-ai-staging.toml',import.meta.url),'utf8');
const guard=workflow.match(/node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/)[1].replace(/^          /gm,'');
function runConfig(content){
  const dir=mkdtempSync(join(tmpdir(),'thebe-staging-guard-'));
  try{
    mkdirSync(join(dir,'cloudflare'));
    writeFileSync(join(dir,'cloudflare/wrangler.general-ai-staging.toml'),content);
    return spawnSync(process.execPath,['--input-type=module','-e',guard],{cwd:dir,encoding:'utf8'});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('actual workflow accepts the reviewed private config',()=>assert.equal(runConfig(config).status,0));
for(const directive of ['route = "example.com/*"','  routes = ["example.com/*"]','\tzone_id = "zone"','[[routes]]\npattern = "example.com/*"']){
  test(`actual workflow rejects public route directive ${JSON.stringify(directive)}`,()=>{
    const result=runConfig(directive+'\n'+config);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/public_route_prohibited/);
  });
}
test('deployment credentials fail closed with actionable, value-free diagnostics',()=>{
  const block=workflow.match(/- name: Validate dedicated staging credentials\n([\s\S]*?)(?=\n      - )/);
  assert.ok(block,'protected deployment must validate dedicated credentials');
  const shell=block[1].split('        run: |\n')[1].replace(/^          /gm,'');
  const token='synthetic-token-do-not-log';
  for(const [env,error] of [
    [{},'GENERAL_AI_STAGING_CLOUDFLARE_TOKEN is missing'],
    [{CLOUDFLARE_API_TOKEN:token},'GENERAL_AI_STAGING_CLOUDFLARE_ACCOUNT_ID is missing'],
    [{CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:'wrong-account'},'GENERAL_AI_STAGING_CLOUDFLARE_ACCOUNT_ID does not match'],
    [{CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d'},null]
  ]){
    const result=spawnSync('bash',['-c',shell],{env:{PATH:process.env.PATH,...env},encoding:'utf8'});
    assert.equal(result.status,error?1:0);
    if(error)assert.ok(result.stderr.includes(error));
    assert.ok(!(result.stdout+result.stderr).includes(token));
    assert.ok(!(result.stdout+result.stderr).includes('wrong-account'));
  }
});
