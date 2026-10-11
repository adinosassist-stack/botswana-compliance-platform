const CF_API='https://api.cloudflare.com/client/v4';
const FOUNDATION_PACK_KEY='botswana-foundation-v1';

const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();

function fail(message){throw new Error(`Regulatory production activation gate failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};

async function rows(label,sql,params=[]){
  const statement=String(sql||'').trim();
  assert(/^SELECT\b/i.test(statement),`refusing non-read-only D1 query for ${label}`);
  const response=await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',headers,body:JSON.stringify({sql:statement,params})
  });
  const text=await response.text();
  let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(x=>`${x?.code??'unknown'}:${x?.message??'unknown'}`).join(' | '):`HTTP ${response.status}`;
    fail(`${label}: ${errors}`);
  }
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`${label} query did not complete successfully`);
  return sets.flatMap(x=>Array.isArray(x?.results)?x.results:[]);
}

function count(value){const n=Number(value||0);return Number.isFinite(n)?n:0}

const principals=await rows('active regulatory principals',`SELECT user_id,role FROM platform_regulatory_principals WHERE active=1 ORDER BY role,user_id`);
const editors=principals.filter(row=>['editor','admin'].includes(String(row.role||'')));
const reviewers=principals.filter(row=>['reviewer','admin'].includes(String(row.role||'')));
const makerCheckerReady=editors.some(editor=>reviewers.some(reviewer=>String(editor.user_id)!==String(reviewer.user_id)));

const latestImport=(await rows('foundation pack import',`SELECT pack_key,pack_version,status,created_at FROM regulatory_pack_imports WHERE pack_key=? ORDER BY created_at DESC LIMIT 1`,[FOUNDATION_PACK_KEY]))[0]||null;
const sources=(await rows('approved regulatory sources',`SELECT
  COUNT(*) total,
  SUM(CASE WHEN status='approved' AND verification_status='verified' AND latest_snapshot_version>0 AND approved_by_user_id IS NOT NULL THEN 1 ELSE 0 END) verified_approved
  FROM regulatory_sources`))[0]||{};
const rules=(await rows('published regulatory rules',`SELECT
  COUNT(*) total,
  SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published
  FROM regulatory_rules`))[0]||{};
const conflicts=(await rows('open regulatory conflicts',`SELECT COUNT(*) AS count FROM regulatory_conflicts WHERE status='open'`))[0]||{};

const state={
  makerCheckerReady,
  packImported:!!latestImport,
  packCompleted:!!latestImport&&String(latestImport.status||'')==='completed',
  packKey:latestImport?String(latestImport.pack_key||''):'',
  packVersion:latestImport?String(latestImport.pack_version||''):'',
  verifiedApprovedSources:count(sources.verified_approved),
  publishedRules:count(rules.published),
  openConflicts:count(conflicts.count)
};

console.log(`INFO unrestricted regulatory launch gate maker_checker_ready=${state.makerCheckerReady} pack_imported=${state.packImported} pack_completed=${state.packCompleted} pack_key=${state.packKey||'none'} pack_version=${state.packVersion||'none'} sources_verified_approved=${state.verifiedApprovedSources} rules_published=${state.publishedRules} open_conflicts=${state.openConflicts}`);

assert(state.packImported,`required foundation pack ${FOUNDATION_PACK_KEY} has not been imported`);
assert(state.packCompleted,`required foundation pack ${FOUNDATION_PACK_KEY} is not completed`);
assert(state.makerCheckerReady,'independent regulatory maker-checker principals are not ready');
assert(state.verifiedApprovedSources>0,'no verified and approved regulatory source is active');
assert(state.publishedRules>0,'no published regulatory rule is active');
assert(state.openConflicts===0,`${state.openConflicts} regulatory conflict(s) remain open`);

console.log('REGULATORY_PRODUCTION_ACTIVATION_GATE_PASS');
