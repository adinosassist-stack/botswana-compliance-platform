import {pathToFileURL} from 'node:url';

// Metadata only: no SQL endpoint, provisioning, or settings mutation.
export async function discover({token, productionId, fetchImpl = fetch}) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!token || !uuid.test(productionId || '')) throw new Error('Staging token and production exclusion UUID required');
  async function pages(path) {
    const rows = [];
    for (let page = 1; page <= 20; page++) {
      let response, data;
      try {
        response = await fetchImpl(`https://api.cloudflare.com/client/v4${path}?page=${page}&per_page=50`, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: {Authorization: `Bearer ${token}`},
        });
        data = await response.json();
      } catch { throw new Error('Cloudflare metadata request failed; provider details suppressed'); }
      if (!response.ok || data.success !== true || !Array.isArray(data.result)) throw new Error('Cloudflare metadata access denied or malformed; provider details suppressed');
      rows.push(...data.result);
      if (data.result.length < 50 || (Number.isInteger(data.result_info?.total_pages) && page >= data.result_info.total_pages)) return rows;
    }
    throw new Error('Metadata pagination limit reached; no partial discovery accepted');
  }
  const accounts = await pages('/accounts');
  const candidates = [];
  for (const account of accounts) {
    if (!/^[a-f0-9]{32}$/i.test(account.id || '')) throw new Error('Malformed account identifier');
    for (const db of await pages(`/accounts/${account.id}/d1/database`)) {
      if (uuid.test(db.uuid || '') && db.uuid.toLowerCase() !== productionId.toLowerCase() &&
          typeof db.name === 'string' && db.name.length <= 128 && /^[a-z0-9_-]+$/i.test(db.name) &&
          /(^|[-_])(staging|evaluation|sandbox|test)([-_]|$)/i.test(db.name)) {
        candidates.push({accountId: account.id, databaseId: db.uuid, databaseName: db.name});
      }
    }
  }
  return {readOnly: true, metadataOnly: true, noApprovalOrImport: true, decision: 'human_target_selection_required', candidates};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await discover({token: process.env.REGULATORY_STAGING_CLOUDFLARE_TOKEN, productionId: process.env.PRODUCTION_D1_DATABASE_ID}), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
