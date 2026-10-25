import {splitSqliteMigrationStatements} from './sqlite-migration-statements.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const wranglerJs=String(process.env.WRANGLER_JS||'').trim();
const wranglerConfig=String(process.env.WRANGLER_CONFIG||'').trim();
const execFile=promisify(execFileCallback);
const specs=Object.freeze([
  {path:'cloudflare/migrations/20261021_employee_ai_workflows.sql',blob:'f1d125bf2bef57f973f75c38447c472e5468750a'},
  {path:'cloudflare/migrations/20261021_employee_ai_proposal_reviews.sql',blob:'7f61304cdf8d621e032f696c17c907db814cf082'},
  {path:'cloudflare/migrations/20261022_employee_ai_proposal_provenance.sql',blob:'9c47ccf18f7ead7555640e7ec7da39570ab3b730'},
  {path:'cloudflare/migrations/20261024_employee_dispatch.sql',blob:'3abcc47fd3c0184a1ccf2be09a139555bc9f6984'}
]);

function fail(message){throw new Error(`Production D1 employee workflow migration refused: ${message}`)}
if(!token)fail('CLOUDFLARE_API_TOKEN is empty');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(databaseId))fail('D1_DATABASE_ID is invalid');
if(!wranglerJs||!wranglerConfig)fail('Wrangler migration transport is incomplete');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
const safe=value=>String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,500);

async function cf(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
  const raw=await response.text();
  let body=null;try{body=raw?JSON.parse(raw):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(e=>`${e?.code??'unknown'}:${e?.message??'unknown'}`).join(' | '):safe(raw);
    throw new Error(`Cloudflare API ${path} failed HTTP ${response.status}: ${errors}`);
  }
  return body;
}

async function query(sql,params=[]){
  const body=await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',body:JSON.stringify({sql,params})});
  const results=Array.isArray(body?.result)?body.result:[];
  if(!results.length||results.some(r=>r?.success===false))fail(`D1 query failed: ${safe(sql)}`);
  return results.flatMap(r=>Array.isArray(r?.results)?r.results:[]);
}
async function names(type){return new Set((await query('SELECT name FROM sqlite_master WHERE type=?',[type])).map(r=>String(r.name||'')))}
async function columns(table){return new Set((await query(`PRAGMA table_info(${table})`)).map(r=>String(r.name||'')))}
async function objectSql(type,name){
  const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return String(rows?.[0]?.sql||'');
}

const expectedObjects=[];
function canonical(sql){return sql.replace(/--[^\n]*/g,'').replace(/\bIF\s+NOT\s+EXISTS\b/gi,'').replace(/[\s;]+/g,'').toLowerCase();}
async function verifyPrerequisites(){
  const employeeColumns=await columns('employees');
  for(const name of ['id','tenant_id','start_date','end_date','status'])if(!employeeColumns.has(name))fail(`employees missing prerequisite column ${name}`);
}
async function verifySchema(){
  let complete=true;
  for(const expected of expectedObjects){
    const actual=await objectSql(expected.type,expected.name);
    if(!actual){complete=false;continue;}
    if(canonical(actual)!==canonical(expected.sql))fail(`existing schema differs: ${expected.name}`);
  }
  return complete;
}
async function verifyCurrentMain(){
  const sha=String(process.env.GITHUB_SHA||'');
  if(!/^[a-f0-9]{40}$/.test(sha)||process.env.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||process.env.GITHUB_REF!=='refs/heads/main'||!process.env.GH_TOKEN)fail('invalid workflow authority');
  const response=await fetch('https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/branches/main',{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok||(await response.json()).commit?.sha!==sha)fail('current main changed before migration');
}
async function executeMigration(spec){
  await verifyCurrentMain();
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},maxBuffer:8*1024*1024});
    console.log(`Wrangler D1 employee workflow migration completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){
    throw new Error(`Employee workflow migration Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`);
  }
}

// Verify every pinned migration before reading or mutating production schema.
for(const spec of specs){
  const sql=await readFile(spec.path,'utf8');
  const actualBlob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
  if(actualBlob!==spec.blob)fail(`reviewed migration blob changed: ${spec.path}`);
  for(const statement of splitSqliteMigrationStatements(sql)){
    const clean=statement.replace(/--[^\n]*/g,'').trim();
    const match=clean.match(/^CREATE\s+(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
    if(!match)fail('unexpected migration statement');
    expectedObjects.push({type:match[1].toLowerCase(),name:match[2],sql:clean});
  }
}
await verifyCurrentMain();
await verifyPrerequisites();
if(await verifySchema()){
  if((await query('PRAGMA foreign_key_check')).length)fail('foreign key verification failed');
  console.log('Employee workflow schemas already present and verified; no mutation required.');
  process.exit(0);
}
const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark: ${bookmark}`);
for(const spec of specs)await executeMigration(spec);
if(!(await verifySchema()))fail('post-migration verification failed');
if((await query('PRAGMA foreign_key_check')).length)fail('foreign key verification failed');
console.log('Production employee workflow schemas verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
