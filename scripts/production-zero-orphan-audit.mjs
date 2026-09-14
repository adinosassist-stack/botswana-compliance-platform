import fs from 'node:fs';

const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();

function fail(message){throw new Error(`Zero-orphan production audit failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');

async function d1Count(label,sql){
  const statement=String(sql||'').trim();
  assert(/^SELECT\b/i.test(statement),`refusing non-read-only D1 query for ${label}`);
  const response=await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({sql:statement})
  });
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false)fail(`Cloudflare D1 ${label} HTTP ${response.status}: ${safe(text)}`);
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 query failed for ${label}`);
  const rows=sets.flatMap(x=>Array.isArray(x?.results)?x.results:[]);
  const count=Number(rows?.[0]?.count);
  assert(Number.isFinite(count),`D1 count missing for ${label}`);
  return count;
}

const orphanTenants=await d1Count('orphan tenants',`SELECT COUNT(*) AS count FROM tenants t WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=t.id)`);
const orphanUsers=await d1Count('orphan users',`SELECT COUNT(*) AS count FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id)`);
assert(orphanTenants===0,`orphan tenants detected: ${orphanTenants}`);
assert(orphanUsers===0,`orphan users detected: ${orphanUsers}`);

const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
const tableRe=/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\((.*?)\);/gis;
const danglingChecks=[];
for(const match of schema.matchAll(tableRe)){
  const table=match[1],body=match[2];
  assert(/^[A-Za-z0-9_]+$/.test(table),`unsafe schema table identifier ${safe(table)}`);
  if(table==='tenants')continue;
  const tenantColumns=[...new Set([...body.matchAll(/\b([A-Za-z0-9_]*tenant_id)\b/gi)].map(x=>x[1]))];
  for(const column of tenantColumns){
    assert(/^[A-Za-z0-9_]+$/.test(column),`unsafe schema tenant column identifier ${safe(column)}`);
    danglingChecks.push([table,column]);
  }
}
assert(danglingChecks.length>0,'tenant-reference inventory is empty');
let danglingRows=0;
for(const [table,column] of danglingChecks){
  danglingRows+=await d1Count(`${table}.${column} dangling tenant reference`,`SELECT COUNT(*) AS count FROM ${table} r WHERE r.${column} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=r.${column})`);
}
assert(danglingRows===0,`dangling tenant-reference rows detected: ${danglingRows}`);
mark('zero-orphan production baseline',`orphanTenants=0 orphanUsers=0 danglingTenantReferences=0 checkedColumns=${danglingChecks.length}`);
