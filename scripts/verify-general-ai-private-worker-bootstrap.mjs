/** Credential-free, side-effect-free source gate for the one-time inert Worker. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const CONFIG = [
  'name = "bw-general-ai-private-queue-acceptance"',
  'main = "src/general-ai-private-worker-bootstrap.js"',
  'compatibility_date = "2026-09-03"',
  'workers_dev = false',
  'preview_urls = false',
].join('\n');

export function verifyBootstrapSource({config, entry, workflow}) {
  const effective = config.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#')).join('\n');
  assert.equal(effective, CONFIG, 'bootstrap must be exactly the five inert Worker settings');
  assert.doesNotMatch(config, /(?:\[\[?\s*(?:queues|d1_databases|services|kv_namespaces|r2_buckets|vars|triggers)|\b(?:route|routes|account_id|zone_id)\s*=)/i);
  assert.match(entry, /status:\s*503/);
  assert.match(entry, /'cache-control':\s*'no-store'/);
  assert.doesNotMatch(entry, /(?:\bqueue\s*\(|\bglobalThis\.fetch\s*\(|\bawait\s+fetch\s*\(|\benv\.|\bimport\s|\bprocess\.env\b|\baddEventListener\b|\bWebSocket\b)/);
  assert.match(workflow, /environment:\s*general-ai-private-staging/);
  assert.match(workflow, /BOOTSTRAP_PRIVATE_GENERAL_AI_WORKER/);
  assert.match(workflow, /GENERAL_AI_QUEUE_BOOTSTRAP_CLOUDFLARE_TOKEN/);
  assert.match(workflow, /GENERAL_AI_QUEUE_STAGING_CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/commits\/main"/);
  assert.match(workflow, /npx wrangler deploy --config cloudflare\/wrangler\.general-ai-private-worker-bootstrap\.toml/);
  assert.doesNotMatch(workflow, /(?:secrets\.(?:GENERAL_AI_STAGING_CLOUDFLARE_TOKEN|GENERAL_AI_QUEUE_STAGING_CLOUDFLARE_TOKEN|PRODUCTION_CLOUDFLARE_TOKEN)|--force|continue-on-error:\s*true)/);
  return true;
}

export function readAndVerifyBootstrapSource() {
  return verifyBootstrapSource({
    config: readFileSync(new URL('../cloudflare/wrangler.general-ai-private-worker-bootstrap.toml', import.meta.url), 'utf8'),
    entry: readFileSync(new URL('../cloudflare/src/general-ai-private-worker-bootstrap.js', import.meta.url), 'utf8'),
    workflow: readFileSync(new URL('../.github/workflows/general-ai-private-worker-bootstrap-protected.yml', import.meta.url), 'utf8'),
  });
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  readAndVerifyBootstrapSource();
  console.log('PASS: isolated, exact, private-only General AI Worker bootstrap candidate');
}
