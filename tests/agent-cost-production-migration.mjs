import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {runProductionAgentCostMigration} from "../scripts/migrate-production-agent-cost-accounting.mjs";
import {verifyAgentCostProductionAuthority} from "../scripts/agent-cost-production-authority.mjs";
import {createAgentCostProductionTransport} from "../scripts/agent-cost-production-transport.mjs";
const REPO_ID=1366439580;
const SHA='a'.repeat(40),HEAD='b'.repeat(40),REPO='adinosassist-stack/botswana-compliance-platform';
const manifest=JSON.parse(readFileSync('scripts/manifests/agent-cost-schema.json','utf8'));
const review={headSha:HEAD,sourceScope:'pass',runtimeSecurity:'pass',evidenceIntegrity:'pass',unresolvedFindings:0,activation:'HOLD'};
const dir=mkdtempSync(join(tmpdir(),'thebe-068-production-test-')),db=new DatabaseSync(':memory:');
const previousToken=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-must-not-reach-wrangler';
try{
  db.exec(readFileSync('cloudflare/schema.sql','utf8'));
  for(const f of readdirSync('cloudflare/migrations').filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=44&&Number(f.slice(0,3))<68).sort())db.exec(readFileSync('cloudflare/migrations/'+f,'utf8'));
  const cli=join(dir,'wrangler/bin/wrangler.js');mkdirSync(join(dir,'wrangler/bin'),{recursive:true});writeFileSync(cli,'// mock only');writeFileSync(join(dir,'wrangler/package.json'),'{"version":"4.135.0"}');
  const env={GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'adinosassist-stack',GITHUB_SHA:SHA,
    EXPECTED_MAIN_SHA:SHA,GH_TOKEN:'synthetic-github-token',MIGRATION_MODE:'plan',EXPECTED_SOURCE_SHA256:manifest.source.sha256,
    CLOUDFLARE_API_TOKEN:'synthetic-cloudflare-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),D1_DATABASE_ID:'00000000-0000-0000-0000-000000000001',
    WRANGLER_JS:cli,GITHUB_STEP_SUMMARY:join(dir,'summary.md')};
  let execs=0,bookmarks=0,cfCalls=0,stale=false,badTarget=false,missingReview=false,failedLatest=false,authorityRace=false,unhealthy=false,emptyRefs=false,wrongRunRepo=false,wrongRunBranch=false,wrongRunPr=false,wrongRunHead=false;
  const response=result=>new Response(JSON.stringify(result));
  const fetchImpl=async(url,options)=>{
    assert.equal(options.redirect,'error');assert.ok(options.signal);
    const u=new URL(url);
    if(u.hostname==='thebedesk.com'){assert.equal(options.headers.authorization,undefined);return response({ok:!unhealthy,schemaReady:!unhealthy,requiredConfigReady:true})}
    if(u.hostname==='api.github.com'){
      assert.equal(options.headers.authorization,'Bearer synthetic-github-token');
      if(u.pathname.endsWith('/branches/main'))return response({commit:{sha:stale?HEAD:SHA}});
      if(u.pathname.endsWith('/commits/'+SHA))return response({sha:SHA,parents:[{sha:'c'.repeat(40)},{sha:HEAD}]});
      if(u.pathname.endsWith('/pulls'))return response([{number:1291,merged_at:'2026-10-09',merge_commit_sha:SHA,base:{ref:'main',repo:{full_name:REPO}},head:{sha:HEAD,ref:'reviewed-branch',repo:{id:REPO_ID,full_name:REPO}},body:missingReview?'':`<!-- THEBE_AGENT_COST_REVIEW\n${JSON.stringify(review)}\n-->`}]);
      if(u.pathname.endsWith('/runs')){const head=u.searchParams.get('head_sha'),event=u.searchParams.get('event');
        const run={id:1,head_sha:wrongRunHead?SHA:head,event,head_branch:wrongRunBranch?'unrelated':event==='pull_request'?'reviewed-branch':'main',head_repository:{id:wrongRunRepo?999:REPO_ID,full_name:wrongRunRepo?'other/repository':REPO},pull_requests:emptyRefs?[]:[{number:wrongRunPr?999:1291}],status:'completed',conclusion:'success'};
        return response({workflow_runs:failedLatest?[{...run,id:2,conclusion:'failure'},run]:[run]})}
      throw Error('unexpected Github endpoint');
    }
    assert.equal(u.hostname,'api.cloudflare.com');cfCalls++;
    assert.equal(options.headers.authorization,'Bearer synthetic-cloudflare-token');
    if(u.pathname.endsWith('/'+env.D1_DATABASE_ID))return response({success:true,result:{uuid:env.D1_DATABASE_ID,name:badTarget?'wrong':'bw-compliance-os'}});
    if(u.pathname.endsWith('/query')){const sql=JSON.parse(options.body).sql;return response({success:true,result:[{success:true,results:db.prepare(sql).all()}]})}
    if(u.pathname.endsWith('/time_travel/bookmark')){bookmarks++;if(authorityRace)stale=true;return response({success:true,result:{bookmark:'synthetic-bookmark'}})}
    throw Error('unexpected Cloudflare endpoint');
  };
  const execImpl=async(command,args,options)=>{
    execs++;assert.equal(command,process.execPath);assert.equal(args[0],resolve(cli));assert.ok(args.includes('--remote'));assert.ok(!args.includes('deploy'));
    assert.equal(options.env.CLOUDFLARE_API_TOKEN,'synthetic-cloudflare-token');
    assert.equal(options.env.GH_TOKEN,undefined,'GitHub authority token must not reach Wrangler');
    const file=args[args.indexOf('--file')+1],config=JSON.parse(readFileSync(args[args.indexOf('--config')+1],'utf8'));
    assert.equal(config.d1_databases[0].database_id,env.D1_DATABASE_ID);
    assert.ok(readFileSync(env.GITHUB_STEP_SUMMARY,'utf8').includes('synthetic-bookmark'),'bookmark must be recorded before remote apply');
    db.exec(readFileSync(file,'utf8'));return {stdout:'mocked',stderr:''};
  };
  const run=overrides=>runProductionAgentCostMigration({env:{...env,...overrides},fetchImpl,execImpl});
  assert.equal((await run()).code,'migration_plan_ready');assert.equal(execs,0);assert.equal(bookmarks,0);
  assert.equal((await run({GITHUB_EVENT_NAME:'push',ACCOUNTING_068_AUTOPLAN:'1'})).code,'migration_plan_ready');
  const beforeRejectedAutoApply=cfCalls;
  await assert.rejects(run({GITHUB_EVENT_NAME:'push',ACCOUNTING_068_AUTOPLAN:'1',MIGRATION_MODE:'apply'}),/migration_workflow_context_invalid/);
  assert.equal(cfCalls,beforeRejectedAutoApply,'automatic push must reject apply before Cloudflare access');
  await assert.rejects(run({GITHUB_EVENT_NAME:'push'}),/migration_workflow_context_invalid/);
  // GitHub omits merged PR associations on historical successful runs.
  emptyRefs=true;assert.equal((await run()).code,'migration_plan_ready');
  assert.equal(execs,0);assert.equal(bookmarks,0);
  for(const change of ['repository','branch','head','association']){
    const before=cfCalls;
    wrongRunRepo=change==='repository';wrongRunBranch=change==='branch';wrongRunHead=change==='head';
    wrongRunPr=change==='association';emptyRefs=change!=='association';
    await assert.rejects(run(),/migration_qualification_missing/);assert.equal(cfCalls,before);
  }
  wrongRunRepo=wrongRunBranch=wrongRunHead=wrongRunPr=false;emptyRefs=true;
  failedLatest=true;await assert.rejects(run(),/migration_qualification_missing/);failedLatest=false;emptyRefs=false;
  await assert.rejects(run({GITHUB_REF:'refs/heads/feature'}),/migration_workflow_context_invalid/);
  stale=true;const callsBefore=cfCalls;await assert.rejects(run(),/migration_authority_stale/);assert.equal(cfCalls,callsBefore);stale=false;
  missingReview=true;await assert.rejects(run(),/migration_adversarial_review_missing/);missingReview=false;
  failedLatest=true;await assert.rejects(run(),/migration_qualification_missing/);failedLatest=false;
  badTarget=true;await assert.rejects(run(),/migration_target_mismatch/);badTarget=false;
  const t=createAgentCostProductionTransport({token:'synthetic',accountId:env.CLOUDFLARE_ACCOUNT_ID,databaseId:env.D1_DATABASE_ID,verifyAuthority:async()=>{},fetchImpl});
  await assert.rejects(t.query('SELECT 1; DELETE FROM tenants'),/migration_query_forbidden/);
  authorityRace=true;
  const race=await run({MIGRATION_MODE:'apply'});assert.equal(race.code,'migration_apply_failed');assert.equal(race.bookmark,'synthetic-bookmark');assert.equal(execs,0);
  authorityRace=false;stale=false;
  assert.equal((await run({MIGRATION_MODE:'apply'})).code,'migration_applied');assert.equal(execs,1);assert.equal(bookmarks,2);
  assert.equal((await run({MIGRATION_MODE:'apply'})).code,'migration_already_applied');assert.equal(execs,1);
  unhealthy=true;assert.equal((await run({MIGRATION_MODE:'apply'})).code,'migration_health_check_failed');assert.equal(execs,1);unhealthy=false;
  await assert.rejects(verifyAgentCostProductionAuthority({sha:'bad',token:'synthetic',fetchImpl}),/migration_authority_invalid/);
  const workflow=readFileSync('.github/workflows/migrate-production-agent-cost-accounting.yml','utf8');
  const triggers=workflow.slice(workflow.indexOf('on:'),workflow.indexOf('permissions:'));
  assert.ok(triggers.includes('workflow_dispatch:'));assert.ok(triggers.includes('push:'));assert.ok(!triggers.includes('pull_request:'));
  assert.match(triggers,/branches: \[main\]/);assert.match(triggers,/migrate-production-agent-cost-accounting\.yml/);
  assert.match(triggers,/default: plan/);
  assert.match(workflow,/ACCOUNTING_068_AUTOPLAN/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.mode \|\| 'plan'/);
  assert.ok(workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN')>workflow.indexOf('name: Inspect or apply governed migration 068'),'production credentials must be confined to the gated operation step');
  assert.doesNotMatch(workflow,/wrangler[^\n]*deploy|AGENT_MODEL_EXECUTION_ENABLED/);
  console.log('Production migration 068: exact-main/review/latest-CI gates, target identity, dispatch and plan-only push, read-only plan, recorded bookmark and pinned mocked remote apply PASS');
}finally{db.close();rmSync(dir,{recursive:true,force:true});if(previousToken===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=previousToken}
