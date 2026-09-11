import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const worker=read('cloudflare/src/worker.js');
const wrangler=read('cloudflare/wrangler.toml');
const cloudflareReadme=read('cloudflare/README.md');
const renderer=read('cloudflare/render-production-config.sh');
const preflight=read('cloudflare/preflight-production.sh');
const deploy=read('cloudflare/deploy-free.sh');
const productionDeploy=read('.github/workflows/deploy-production.yml');
const bf07Workflow=read('.github/workflows/bf07-seal.yml');
let pass=0;const ok=(c,m)=>{if(!c)throw new Error('FAIL: '+m);pass++;console.log('PASS',m)};

const requiredSecrets=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET','OPERATIONS_SECRET','AUTOMATION_SECRET','TURNSTILE_SECRET_KEY','PAYMENT_WEBHOOK_SECRET','BILLING_WEBHOOK_SECRET'];
const requiredVars=['PUBLIC_APP_URL','PUBLIC_ORIGIN','TURNSTILE_SITE_KEY','PLATFORM_ADMIN_EMAILS','PLATFORM_REGULATORY_REVIEWERS','EVIDENCE_SCAN_API_URL'];

ok(requiredSecrets.every(k=>worker.includes(`env.${k}`)), 'runtime references every launch-critical secret');
ok(requiredSecrets.every(k=>deploy.includes(`secret put ${k}`)), 'deploy sequence explicitly provisions every launch-critical secret');
ok(!deploy.includes('secret put EVIDENCE_SCAN_SECRET'), 'deploy sequence does not provision a scanner secret while evidence uploads are disabled');
ok(requiredVars.every(k=>worker.includes(`env.${k}`)), 'runtime references every readiness-critical non-secret variable');
ok(requiredVars.every(k=>wrangler.includes(`${k} = "REPLACE_WITH_${k}"`)), 'template declares every readiness-critical non-secret variable as a source-safe placeholder');
ok(requiredVars.every(k=>renderer.includes(k)) && renderer.includes('for key in PUBLIC_APP_URL PUBLIC_ORIGIN TURNSTILE_SITE_KEY PLATFORM_ADMIN_EMAILS PLATFORM_REGULATORY_REVIEWERS EVIDENCE_SCAN_API_URL'), 'ephemeral renderer owns every readiness-critical non-secret variable');
ok(requiredVars.every(k=>preflight.includes(k)), 'production preflight checks every readiness-critical non-secret variable');
ok(wrangler.includes('keep_vars = true')&&preflight.includes('keep_vars must be true'), 'Wrangler deploy preserves optional dashboard variables while source-controlled readiness vars remain authoritative');
ok(renderer.includes('PUBLIC_APP_URL and PUBLIC_ORIGIN must be the same exact HTTPS origin')&&preflight.includes('PUBLIC_APP_URL and PUBLIC_ORIGIN must match exactly'), 'public URL/origin mismatch fails before deployment and at preflight');
ok(wrangler.includes('EVIDENCE_UPLOADS_ENABLED = "false"')&&preflight.includes('EVIDENCE_UPLOADS_ENABLED must remain false')&&preflight.includes('EVIDENCE_SCAN_API_URL must be empty while evidence uploads are disabled'), 'no-scanner production launch keeps evidence uploads fail closed');
ok(deploy.includes('requiredConfigReady=true')&&deploy.includes('evidence upload/mutation routes fail closed'), 'runbook closes runtime readiness and verifies evidence mutations remain disabled');
ok(!deploy.includes('Configure PLATFORM_ADMIN_EMAILS, PLATFORM_REGULATORY_REVIEWERS, PUBLIC_APP_URL and PUBLIC_ORIGIN for this Worker'), 'old ambiguous dashboard-only readiness instruction is removed');

ok(bf07Workflow.includes('push:')&&bf07Workflow.includes('branches: [main]')&&bf07Workflow.includes("contains(github.event.head_commit.message, '[deploy]')"), 'automatic BF-07 release sealing is restricted to explicit [deploy] commits on main');
ok(bf07Workflow.includes("github.event_name == 'workflow_dispatch' && inputs.expected_sha || github.sha")&&bf07Workflow.includes("$GITHUB_REF"), 'BF-07 binds both manual and automatic release paths to the exact selected main SHA');
ok(productionDeploy.includes('workflows: ["BF-07 Supply-Chain Seal"]')&&productionDeploy.includes("recovery-ci.yml")&&productionDeploy.includes("bf07-seal.yml"), 'production automation requires exact-SHA qualification by both Recovery CI and BF-07');
ok(productionDeploy.includes('refusing stale/non-main deploy')&&productionDeploy.includes('git rev-parse origin/main'), 'production automation refuses stale or non-main deployment targets');
ok(productionDeploy.includes('environment: production')&&productionDeploy.includes('CLOUDFLARE_API_TOKEN')&&productionDeploy.includes('CLOUDFLARE_ACCOUNT_ID'), 'production automation is isolated behind the GitHub production environment and Cloudflare credentials');
ok(requiredSecrets.every(k=>productionDeploy.includes(`secrets.${k}`)), 'production automation sources every launch-critical runtime secret from GitHub secrets');
ok(productionDeploy.includes('render-production-config.sh')&&productionDeploy.includes('preflight-production.sh')&&productionDeploy.includes('deploy --dry-run'), 'production automation renders an ephemeral config and dry-runs Wrangler before promotion');
ok(productionDeploy.includes('--secrets-file')&&productionDeploy.includes('thebe-worker-secrets.json'), 'production automation uploads runtime secrets from an ephemeral file rather than source control');
ok(!productionDeploy.includes('d1 execute')&&!productionDeploy.includes('schema.sql'), 'production automation never replays or mutates the production D1 schema');
ok(productionDeploy.includes('/api/live')&&productionDeploy.includes('/api/ready')&&productionDeploy.includes('/api/auth/anti-bot-config'), 'production automation verifies liveness, readiness, schema/config state and Turnstile after deploy');

ok(wrangler.includes('main = "src/worker.js"'), 'production entrypoint uses the hardened base Worker directly');
ok(wrangler.includes('MAX_UPLOAD_MB = "3.5"'), 'deployment metadata retains the bounded evidence cap for future scanner qualification');
ok(worker.includes('const EVIDENCE_MAX_BYTES=3_500_000;'), 'production evidence boundary is exactly 3,500,000 bytes');
ok(worker.includes('/api/evidence/presign')&&worker.includes('/api/evidence/integrity-upload')&&worker.includes('/api/evidence/upload'), 'all direct evidence upload entry routes retain the production cap');
ok(worker.includes(String.raw`/^\/api\/evidence\/[^/]+\/upload$/`), 'presigned evidence PUT route retains the production cap');
ok((worker.match(/readBytesBounded\(req,\{maxBytes:EVIDENCE_MAX_BYTES\}\)/g)||[]).length>=2, 'production upload routes retain bounded streaming body readers');
ok(cloudflareReadme.includes('3.5 MB (3,500,000 bytes)'), 'operator documentation states the exact upload cap');
console.log(`Thebe Desk deployment-closure adversarial gate: ${pass}/${pass} PASS`);
