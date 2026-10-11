import {BOTSWANA_FOUNDATION_PACK_V1} from '../cloudflare/src/regulatory-pack-registry.js';

const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const pack=BOTSWANA_FOUNDATION_PACK_V1;

function fail(message){throw new Error(`Regulatory import diagnostic failed: ${message}`)}
function assert(value,message){if(!value)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}

assert(String(process.env.GITHUB_ACTIONS||'')==='true','refusing to run outside GitHub Actions');
assert(token.length>=20,'CLOUDFLARE_API_TOKEN is unavailable or too short');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(pack?.packKey==='botswana-foundation-v1','unexpected foundation pack key');

const headers={authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json'};
async function query(sql,params=[]){
  const trimmed=String(sql||'').trim();
  assert(/^SELECT\b/i.test(trimmed),'diagnostic permits SELECT statements only');
  assert(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|VACUUM|PRAGMA|ATTACH|DETACH)\b/i.test(trimmed),'diagnostic SQL contains a forbidden mutation keyword');
  const response=await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',headers,body:JSON.stringify({sql:trimmed,params}),signal:AbortSignal.timeout(20000)
  });
  const text=await response.text();
  let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(x=>`${x?.code??'unknown'}:${x?.message??'unknown'}`).join(' | '):safe(text);
    fail(`Cloudflare D1 query HTTP ${response.status}: ${errors}`);
  }
  const result=Array.isArray(body?.result)?body.result[0]:null;
  assert(result?.success!==false,'D1 query result was unsuccessful');
  return Array.isArray(result?.results)?result.results:[];
}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0}
function countByStatus(rows){return Object.fromEntries(rows.map(r=>[String(r.status||'unknown'),number(r.count)]))}

const seedRows=await query(`SELECT entity_type, COUNT(*) AS count FROM regulatory_seed_registry WHERE pack_key=? GROUP BY entity_type ORDER BY entity_type`,[pack.packKey]);
const sourceRows=await query(`SELECT status, COUNT(*) AS count FROM regulatory_sources GROUP BY status ORDER BY status`);
const ruleRows=await query(`SELECT status, COUNT(*) AS count FROM regulatory_rules GROUP BY status ORDER BY status`);
const conflictRows=await query(`SELECT status, COUNT(*) AS count FROM regulatory_conflicts GROUP BY status ORDER BY status`);
const importRows=await query(`SELECT pack_key, CAST(pack_version AS TEXT) AS pack_version, status, sources_created, sources_existing, rules_created, rules_existing, conflicts_created, conflicts_existing, created_at FROM regulatory_pack_imports WHERE pack_key=? ORDER BY created_at DESC LIMIT 10`,[pack.packKey]);

const seeds=Object.fromEntries(seedRows.map(r=>[String(r.entity_type||'unknown'),number(r.count)]));
const expected={source:pack.sources.length,conflict:pack.conflicts.length,rule:pack.rules.length};
console.log('READ_ONLY_REGULATORY_IMPORT_DIAGNOSTIC');
console.log(`pack=${pack.packKey} version=${pack.version}`);
console.log(`expectedSeeds source=${expected.source} conflict=${expected.conflict} rule=${expected.rule}`);
console.log(`observedSeeds source=${number(seeds.source)} conflict=${number(seeds.conflict)} rule=${number(seeds.rule)}`);
console.log(`sourceStatus=${JSON.stringify(countByStatus(sourceRows))}`);
console.log(`ruleStatus=${JSON.stringify(countByStatus(ruleRows))}`);
console.log(`conflictStatus=${JSON.stringify(countByStatus(conflictRows))}`);
console.log(`importRecords=${importRows.length}`);
for(const row of importRows){
  console.log(`import pack=${String(row.pack_key)} version=${String(row.pack_version)} status=${String(row.status)} sourcesCreated=${number(row.sources_created)} sourcesExisting=${number(row.sources_existing)} rulesCreated=${number(row.rules_created)} rulesExisting=${number(row.rules_existing)} conflictsCreated=${number(row.conflicts_created)} conflictsExisting=${number(row.conflicts_existing)} createdAt=${String(row.created_at||'')}`);
}
console.log('Diagnostic completed with fixed SELECT-only queries; no production data was mutated.');
