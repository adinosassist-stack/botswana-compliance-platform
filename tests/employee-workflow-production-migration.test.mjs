import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

// Execute the real production script against real SQLite. Only GitHub/Cloudflare
// transport and Wrangler process boundaries are replaced; no network is used.
function run(mode){
 const dir=mkdtempSync(join(tmpdir(),'employee-migration-'));
 const preload=join(dir,'transport.mjs');
 writeFileSync(preload,`
 import cp from 'node:child_process';
 import {syncBuiltinESMExports} from 'node:module';
 const file=${JSON.stringify(join(dir,'db.sqlite'))};
 const mode=${JSON.stringify(mode)};
 function sql(query,params=[]){
  const r=cp.spawnSync('python3',['-c',\`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.row_factory=sqlite3.Row
q,p=json.loads(sys.stdin.read()); r=c.execute(q,p)
print(json.dumps([dict(x) for x in r.fetchall()])); c.commit()\`,file],{input:JSON.stringify([query,params]),encoding:'utf8'});
  if(r.status!==0)throw Error(r.stderr);
  return JSON.parse(r.stdout);
 }
 function apply(path){
  const r=cp.spawnSync('python3',['-c','import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(open(sys.argv[2]).read()); c.commit()',file,path],{encoding:'utf8'});
  if(r.status!==0)throw Error(r.stderr);
 }
 sql('CREATE TABLE employees(id TEXT,tenant_id TEXT,start_date TEXT,end_date TEXT,status TEXT)');
 if(mode==='existing')for(const path of ['cloudflare/migrations/20261021_employee_ai_workflows.sql','cloudflare/migrations/20261021_employee_ai_proposal_reviews.sql'])apply(path);
 if(mode==='drift')sql('CREATE TABLE employee_ai_workflows(tenant_id TEXT)');
 globalThis.fetch=async(url,options={})=>{
  if(url==='https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/branches/main')return {ok:true,json:async()=>({commit:{sha:mode==='stale'?'b'.repeat(40):'a'.repeat(40)}})};
  if(url.endsWith('/time_travel/bookmark')){console.log('BOOKMARK');return {ok:true,text:async()=>JSON.stringify({success:true,result:{bookmark:'test-bookmark'}})};}
  if(url.endsWith('/query')){
   const {sql:query,params}=JSON.parse(options.body);
   return {ok:true,text:async()=>JSON.stringify({success:true,result:[{success:true,results:sql(query,params)}]})};
  }
  throw Error('Unexpected network request');
 };
 cp.execFile=(exe,args,options,callback)=>{
  try{
   const path=args.find(x=>x.startsWith('--file=')).slice(7);
   apply(path);console.log('APPLY '+path);callback(null,{stdout:'applied',stderr:''});
  }catch(error){callback(error);}
 };
 syncBuiltinESMExports();
 `);
 try{return spawnSync(process.execPath,['--import',preload,resolve('scripts/migrate-production-employee-workflows.mjs')],{encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ACCOUNT_ID:'1'.repeat(32),D1_DATABASE_ID:'11111111-1111-1111-1111-111111111111',WRANGLER_JS:'wrangler.js',WRANGLER_CONFIG:'config.toml',GH_TOKEN:'test',GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform'}});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('production employee migration applies pinned schemas after a recovery bookmark and verifies SQLite definitions',()=>{
 const r=run('fresh');assert.equal(r.status,0,r.stderr+r.stdout);
 assert.equal((r.stdout.match(/APPLY /g)||[]).length,2);
 assert.ok(r.stdout.indexOf('BOOKMARK')<r.stdout.indexOf('APPLY '));
 assert.match(r.stdout,/schemas verified successfully/);
});
test('verified existing production schemas cause no migration writes',()=>{
 const r=run('existing');assert.equal(r.status,0,r.stderr+r.stdout);
 assert.doesNotMatch(r.stdout,/APPLY |BOOKMARK/);
 assert.match(r.stdout,/no mutation required/);
});
for(const mode of ['drift','stale'])test(`production ${mode} blocks migration before mutation`,()=>{
 const r=run(mode);assert.notEqual(r.status,0);
 assert.doesNotMatch(r.stdout,/APPLY |BOOKMARK/);
 assert.match(r.stderr,mode==='drift'?/existing schema differs/:/current main changed/);
});
