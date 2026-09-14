const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
if(!token)throw new Error('CLOUDFLARE_API_TOKEN missing');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))throw new Error('CLOUDFLARE_ACCOUNT_ID invalid');
if(!/^[0-9a-fA-F-]{36}$/.test(databaseId))throw new Error('D1_DATABASE_ID invalid');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
async function query(sql,params=[]){
  const response=await fetch(`${API}/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false)throw new Error(`D1 query failed HTTP ${response.status}`);
  const result=Array.isArray(body?.result)?body.result:[];
  if(!result.length||result.some(x=>x?.success===false))throw new Error(`D1 query execution failed: ${sql.slice(0,100)}`);
  return result.flatMap(x=>Array.isArray(x.results)?x.results:[]);
}

const expected=['users','tenants','memberships','subscriptions','platform_regulatory_principals','auth_rate_limits'];
const tableRows=await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','tenants','memberships','subscriptions','platform_regulatory_principals','auth_rate_limits') ORDER BY name");
const tables=new Set(tableRows.map(x=>String(x.name||'')));
const missing=expected.filter(x=>!tables.has(x));
console.log(`D1 registration tables present=${[...tables].join(',')||'none'} missing=${missing.join(',')||'none'}`);
if(missing.length)throw new Error(`Missing registration prerequisites: ${missing.join(',')}`);

for(const table of expected){
  const columns=await query(`PRAGMA table_info(${table})`);
  const names=columns.map(x=>String(x.name||'')).filter(Boolean);
  console.log(`D1 schema ${table}: columns=${names.join(',')}`);
}

const counts=await query(`SELECT
 (SELECT count(*) FROM users) users,
 (SELECT count(*) FROM tenants) tenants,
 (SELECT count(*) FROM memberships) memberships,
 (SELECT count(*) FROM subscriptions) subscriptions,
 (SELECT count(*) FROM platform_regulatory_principals) platform_regulatory_principals,
 (SELECT count(*) FROM auth_rate_limits) auth_rate_limits`);
const c=counts[0]||{};
console.log(`D1 aggregate counts users=${c.users??'?'} tenants=${c.tenants??'?'} memberships=${c.memberships??'?'} subscriptions=${c.subscriptions??'?'} platformPrincipals=${c.platform_regulatory_principals??'?'} authRateRows=${c.auth_rate_limits??'?'}`);

const rateColumns=await query('PRAGMA table_info(auth_rate_limits)');
const rateNames=new Set(rateColumns.map(x=>String(x.name||'')));
const hasScope=rateNames.has('scope');
const hasExpires=rateNames.has('expires_at');
const hasWindow=rateNames.has('window_start');
if(hasScope){
  const select=["scope","count(*) rows"];
  if(hasExpires)select.push("sum(CASE WHEN expires_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END) active_rows");
  else if(hasWindow)select.push("sum(CASE WHEN window_start>=datetime('now','-1 hour') THEN 1 ELSE 0 END) active_rows");
  const rate=await query(`SELECT ${select.join(',')} FROM auth_rate_limits GROUP BY scope ORDER BY scope`);
  for(const row of rate){
    const scope=String(row.scope||'');
    if(scope.startsWith('register'))console.log(`D1 registration rate scope=${scope} rows=${row.rows??'?'} active=${row.active_rows??'n/a'}`);
  }
}else{
  console.log('D1 auth_rate_limits has no scope column; no bucket identifiers were printed.');
}

const fk=await query('PRAGMA foreign_key_check');
console.log(`D1 foreign-key violations=${fk.length}`);
if(fk.length)throw new Error(`Production D1 has ${fk.length} foreign-key violation(s)`);
console.log('LIVE_D1_REGISTRATION_AUDIT_PASS');
