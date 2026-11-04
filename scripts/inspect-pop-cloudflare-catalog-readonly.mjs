import {assessPopStagingCatalog} from './pop-staging-schema-policy.mjs';
// Read-only D1 POP schema inventory. Never prints credentials, rows or customer SQL.
// Intended for an independently reviewed manual workflow on current main only.
const env = process.env;
const production = '8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const staging = '812f9021-890b-41e6-8fa1-6001f90a9b53';
if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_REPOSITORY !== 'adinosassist-stack/botswana-compliance-platform' ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
    env.EXPECTED_MAIN_SHA !== env.GITHUB_SHA) {
  throw Error('pop_inventory_authority_invalid');
}
if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || '') ||
    !env.CLOUDFLARE_API_TOKEN) throw Error('pop_inventory_credentials_missing');
const SQL = "SELECT type,name,tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
async function inventory(id) {
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' +
    env.CLOUDFLARE_ACCOUNT_ID + '/d1/database/' + id + '/query';
  const response = await fetch(endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN,
      accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ sql: SQL, params: [] })
  });
  if (!response.ok) throw Error('pop_inventory_provider_unavailable');
  const payload = await response.json();
  if (payload.success !== true || !Array.isArray(payload.result) ||
      payload.result.some(x => x.success !== true || !Array.isArray(x.results)))
    throw Error('pop_inventory_provider_invalid');
  return payload.result.flatMap(x => x.results);
}
const [prod, stage] = await Promise.all([inventory(production), inventory(staging)]);
const report={...assessPopStagingCatalog(prod,stage),
 main_sha:env.GITHUB_SHA,production_uuid:production,staging_uuid:staging,
 customer_rows_read:false,mutation_performed: false};
console.log(JSON.stringify(report));
if(!report.catalog_matches_reviewed_pop_additions)process.exitCode=2;
