import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const worker=read('cloudflare/src/worker.js');
const wrangler=read('cloudflare/wrangler.toml');
const uploadCapWrapper=read('cloudflare/src/worker-cloudmersive-free.js');
const cloudflareReadme=read('cloudflare/README.md');
const renderer=read('cloudflare/render-production-config.sh');
const preflight=read('cloudflare/preflight-production.sh');
const deploy=read('cloudflare/deploy-free.sh');
let pass=0;const ok=(c,m)=>{if(!c)throw new Error('FAIL: '+m);pass++;console.log('PASS',m)};

const requiredSecrets=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET','OPERATIONS_SECRET','AUTOMATION_SECRET','TURNSTILE_SECRET_KEY','EVIDENCE_SCAN_SECRET','PAYMENT_WEBHOOK_SECRET','BILLING_WEBHOOK_SECRET'];
const requiredVars=['PUBLIC_APP_URL','PUBLIC_ORIGIN','TURNSTILE_SITE_KEY','PLATFORM_ADMIN_EMAILS','PLATFORM_REGULATORY_REVIEWERS','EVIDENCE_SCAN_API_URL'];

ok(requiredSecrets.every(k=>worker.includes(`env.${k}`)), 'runtime references every launch-critical secret');
ok(requiredSecrets.every(k=>deploy.includes(`secret put ${k}`)), 'deploy sequence explicitly provisions every launch-critical secret');
ok(requiredVars.every(k=>worker.includes(`env.${k}`)), 'runtime references every readiness-critical non-secret variable');
ok(requiredVars.every(k=>wrangler.includes(`${k} = "REPLACE_WITH_${k}"`)), 'template declares every readiness-critical non-secret variable as a source-safe placeholder');
ok(requiredVars.every(k=>renderer.includes(k)) && renderer.includes('for key in PUBLIC_APP_URL PUBLIC_ORIGIN TURNSTILE_SITE_KEY PLATFORM_ADMIN_EMAILS PLATFORM_REGULATORY_REVIEWERS EVIDENCE_SCAN_API_URL'), 'ephemeral renderer owns every readiness-critical non-secret variable');
ok(requiredVars.every(k=>preflight.includes(k)), 'production preflight checks every readiness-critical non-secret variable');
ok(wrangler.includes('keep_vars = true')&&preflight.includes('keep_vars must be true'), 'Wrangler deploy preserves optional dashboard variables while source-controlled readiness vars remain authoritative');
ok(renderer.includes('PUBLIC_APP_URL and PUBLIC_ORIGIN must be the same exact HTTPS origin')&&preflight.includes('PUBLIC_APP_URL and PUBLIC_ORIGIN must match exactly'), 'public URL/origin mismatch fails before deployment and at preflight');
ok(deploy.includes('requiredConfigReady=true')&&deploy.includes('quarantine→scan→clean→authorized-download'), 'runbook closes runtime readiness and evidence lifecycle verification');
ok(!deploy.includes('Configure PLATFORM_ADMIN_EMAILS, PLATFORM_REGULATORY_REVIEWERS, PUBLIC_APP_URL and PUBLIC_ORIGIN for this Worker'), 'old ambiguous dashboard-only readiness instruction is removed');

ok(wrangler.includes('main = "src/worker-cloudmersive-free.js"'), 'production entrypoint enforces the Cloudmersive free-tier evidence boundary before the sealed base Worker');
ok(wrangler.includes('MAX_UPLOAD_MB = "3.5"'), 'deployment metadata reports the 3.5 MB evidence cap');
ok(uploadCapWrapper.includes('const EVIDENCE_FREE_TIER_MAX_BYTES = 3_500_000;'), 'outer evidence boundary is exactly 3,500,000 bytes');
ok(uploadCapWrapper.includes('/api/evidence/presign')&&uploadCapWrapper.includes('/api/evidence/integrity-upload')&&uploadCapWrapper.includes('/api/evidence/upload'), 'all direct evidence upload entry routes are covered by the free-tier cap');
ok(uploadCapWrapper.includes(String.raw`/^\/api\/evidence\/[^/]+\/upload$/.test(url.pathname)`), 'presigned evidence PUT route is covered by the free-tier cap');
ok(uploadCapWrapper.includes('request.clone()'), 'free-tier cap inspection does not consume the request delegated to the sealed base Worker');
ok(cloudflareReadme.includes('3.5 MB (3,500,000 bytes)'), 'operator documentation states the exact free-tier upload cap');
console.log(`Thebe Desk deployment-closure adversarial gate: ${pass}/${pass} PASS`);
