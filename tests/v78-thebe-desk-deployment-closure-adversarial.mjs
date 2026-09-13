import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const worker=read('cloudflare/src/worker.js');
const wrangler=read('cloudflare/wrangler.toml');
const productionEntry=read('cloudflare/src/production-entry.js');
const ownerBrief=read('public/js/owner-command-centre.js');
const ownerBriefCompact=ownerBrief.replace(/\s+/g,'');
const ownerBriefCss=read('public/assets/owner-command-centre.css');
const cloudflareReadme=read('cloudflare/README.md');
const renderer=read('cloudflare/render-production-config.sh');
const preflight=read('cloudflare/preflight-production.sh');
const deploy=read('cloudflare/deploy-free.sh');
const productionDeploy=read('.github/workflows/deploy-production.yml');
const bf07Workflow=read('.github/workflows/bf07-seal.yml');
const provenanceCore=read('scripts/bf07-provenance-core.mjs');
const projectedState=worker.slice(worker.indexOf('function projectWorkspaceStateForRole'),worker.indexOf('function mergeManagerWorkspaceState'));
let pass=0;const ok=(c,m)=>{if(!c)throw new Error('FAIL: '+m);pass++;console.log('PASS',m)};

const requiredSecrets=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET','OPERATIONS_SECRET','AUTOMATION_SECRET','TURNSTILE_SECRET_KEY','PAYMENT_WEBHOOK_SECRET','BILLING_WEBHOOK_SECRET','GOOGLE_OAUTH_CLIENT_SECRET','FACEBOOK_APP_SECRET','RESEND_API_KEY'];
const requiredVars=['PUBLIC_APP_URL','PUBLIC_ORIGIN','TURNSTILE_SITE_KEY','PLATFORM_ADMIN_EMAILS','PLATFORM_REGULATORY_REVIEWERS','EVIDENCE_SCAN_API_URL','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_REDIRECT_URI','FACEBOOK_APP_ID','FACEBOOK_OAUTH_REDIRECT_URI','EMAIL_FROM'];

ok(requiredSecrets.every(k=>worker.includes(`env.${k}`)), 'runtime references every launch-critical secret');
ok(requiredSecrets.every(k=>deploy.includes(`secret put ${k}`)), 'deploy sequence explicitly provisions every launch-critical secret');
ok(!deploy.includes('secret put EVIDENCE_SCAN_SECRET'), 'deploy sequence does not provision a scanner secret while evidence uploads are disabled');
ok(requiredVars.every(k=>worker.includes(`env.${k}`)), 'runtime references every readiness-critical non-secret variable');
ok(requiredVars.every(k=>wrangler.includes(`${k} = "REPLACE_WITH_${k}"`)), 'template declares every readiness-critical non-secret variable as a source-safe placeholder');
ok(requiredVars.every(k=>renderer.includes(k)) && renderer.includes('for key in PUBLIC_APP_URL PUBLIC_ORIGIN TURNSTILE_SITE_KEY PLATFORM_ADMIN_EMAILS PLATFORM_REGULATORY_REVIEWERS EVIDENCE_SCAN_API_URL GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_REDIRECT_URI FACEBOOK_APP_ID FACEBOOK_OAUTH_REDIRECT_URI EMAIL_FROM'), 'ephemeral renderer owns every readiness-critical non-secret variable');
ok(requiredVars.every(k=>preflight.includes(k)), 'production preflight checks every readiness-critical non-secret variable');
ok(wrangler.includes('keep_vars = true')&&preflight.includes('keep_vars must be true'), 'Wrangler deploy preserves optional dashboard variables while source-controlled readiness vars remain authoritative');
ok(renderer.includes('PUBLIC_APP_URL and PUBLIC_ORIGIN must be the same exact HTTPS origin')&&preflight.includes('PUBLIC_APP_URL and PUBLIC_ORIGIN must match exactly'), 'public URL/origin mismatch fails before deployment and at preflight');
ok(renderer.includes('GOOGLE_OAUTH_REDIRECT_URI must equal')&&renderer.includes('FACEBOOK_OAUTH_REDIRECT_URI must equal')&&preflight.includes('GOOGLE_OAUTH_REDIRECT_URI must equal the exact same-origin callback')&&preflight.includes('FACEBOOK_OAUTH_REDIRECT_URI must equal the exact same-origin callback'), 'OAuth callbacks fail closed unless they are exact same-origin production paths');
ok(renderer.includes('EMAIL_FROM must contain a real sender email address')&&preflight.includes('EMAIL_FROM must contain a real sender email address'), 'transactional email sender fails closed on missing or placeholder configuration');
ok(wrangler.includes('EVIDENCE_UPLOADS_ENABLED = "false"')&&preflight.includes('EVIDENCE_UPLOADS_ENABLED must remain false')&&preflight.includes('EVIDENCE_SCAN_API_URL must be empty while evidence uploads are disabled'), 'no-scanner production launch keeps evidence uploads fail closed');
ok(deploy.includes('requiredConfigReady=true')&&deploy.includes('evidence upload/mutation routes fail closed'), 'runbook closes runtime readiness and verifies evidence mutations remain disabled');
ok(!deploy.includes('Configure PLATFORM_ADMIN_EMAILS, PLATFORM_REGULATORY_REVIEWERS, PUBLIC_APP_URL and PUBLIC_ORIGIN for this Worker'), 'old ambiguous dashboard-only readiness instruction is removed');

ok(bf07Workflow.includes('push:')&&bf07Workflow.includes('branches: [main]')&&bf07Workflow.includes("contains(github.event.head_commit.message, '[deploy]')"), 'automatic BF-07 release sealing is restricted to explicit [deploy] commits on main');
ok(bf07Workflow.includes('EXPECTED_SHA: ${{ inputs.expected_sha }}')&&bf07Workflow.includes('[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]')&&bf07Workflow.includes('[[ "$EXPECTED_SHA" == "$GITHUB_SHA" ]]')&&bf07Workflow.includes('dispatch SHA mismatch'), 'manual BF-07 release path preserves explicit full-SHA confirmation');
ok(bf07Workflow.includes('[[ "$GITHUB_REF" == \'refs/heads/main\' ]]')&&bf07Workflow.includes('[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]'), 'automatic BF-07 release path binds the explicit main release marker to the exact pushed SHA');
ok(productionDeploy.includes('workflows: ["BF-07 Supply-Chain Seal"]')&&productionDeploy.includes('recovery-ci.yml')&&productionDeploy.includes('bf07-seal.yml'), 'production automation requires exact-SHA qualification by both Recovery CI and BF-07');
ok(productionDeploy.includes("await successful('recovery-ci.yml', 'Recovery CI', {wait: eventName === 'workflow_run'})")&&productionDeploy.includes('await sleep(10_000)'), 'automatic production promotion waits boundedly for exact-SHA Recovery CI to finish');
ok(productionDeploy.includes('refusing stale/non-main deploy')&&productionDeploy.includes('git rev-parse origin/main'), 'production automation refuses stale or non-main deployment targets');
ok(productionDeploy.includes('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c')&&productionDeploy.includes('name: bf07-sealed-${{ env.TARGET_SHA }}')&&productionDeploy.includes('run-id: ${{ steps.qualification.outputs.bf07_run_id }}')&&productionDeploy.includes('bf07_run_id=${bf07Run.id}'), 'production automation restores sealed BF-07 evidence from the exact qualified workflow run');
ok(productionDeploy.includes('bf07_run_attempt=${bf07Run.run_attempt}')&&productionDeploy.includes('BF07_EXPECTED_RUN_ID: ${{ steps.qualification.outputs.bf07_run_id }}')&&productionDeploy.includes('BF07_EXPECTED_RUN_ATTEMPT: ${{ steps.qualification.outputs.bf07_run_attempt }}')&&productionDeploy.includes('BF07_EXPECTED_SHA: ${{ env.TARGET_SHA }}')&&productionDeploy.includes('BF07_EXPECTED_REF: refs/heads/main'), 'production launch gate binds restored provenance to the exact BF-07 producer identity');
ok(provenanceCore.includes('expectedGithubSource(env)')&&provenanceCore.includes('BF07_EXPECTED_RUN_ID')&&provenanceCore.includes('BF-07 provenance does not match the exact qualified producer run')&&provenanceCore.includes('BF-07 provenance does not match the current GitHub execution context'), 'provenance validator accepts only an explicit exact producer handoff or the current generating run');
ok(productionDeploy.indexOf('Restore exact BF-07 seal evidence')>=0&&productionDeploy.indexOf('npm run launch:gate')>productionDeploy.indexOf('Restore exact BF-07 seal evidence'), 'production launch gate runs only after exact BF-07 evidence restoration');
ok(productionDeploy.includes('environment: production')&&productionDeploy.includes('CLOUDFLARE_API_TOKEN')&&productionDeploy.includes('CLOUDFLARE_ACCOUNT_ID'), 'production automation is isolated behind the GitHub production environment and Cloudflare credentials');
ok(requiredSecrets.every(k=>productionDeploy.includes(`secrets.${k}`)), 'production automation sources every launch-critical runtime secret from GitHub secrets');
ok(['GOOGLE_OAUTH_CLIENT_ID','FACEBOOK_APP_ID','EMAIL_FROM'].every(k=>productionDeploy.includes(`vars.${k}`))&&productionDeploy.includes('GOOGLE_OAUTH_REDIRECT_URI: https://thebedesk.com/api/auth/oauth/google/callback')&&productionDeploy.includes('FACEBOOK_OAUTH_REDIRECT_URI: https://thebedesk.com/api/auth/oauth/facebook/callback'), 'production automation sources public integration identities and pins exact OAuth callbacks');
ok(productionDeploy.includes('render-production-config.sh')&&productionDeploy.includes('preflight-production.sh')&&productionDeploy.includes('deploy --dry-run'), 'production automation renders an ephemeral config and dry-runs Wrangler before promotion');
ok(!productionDeploy.includes('wrangler@4.127.1 deploy --yes'), 'production deploy uses only supported Wrangler 4.127.1 flags');
ok(productionDeploy.includes('--secrets-file')&&productionDeploy.includes('thebe-worker-secrets.json'), 'production automation uploads runtime secrets from an ephemeral file rather than source control');
ok(!productionDeploy.includes('d1 execute')&&!productionDeploy.includes('schema.sql'), 'production automation never replays or mutates the production D1 schema');
ok(productionDeploy.includes('/api/live')&&productionDeploy.includes('/api/ready')&&productionDeploy.includes('/api/auth/registration-proof/challenge')&&productionDeploy.includes("proof.provider !== 'thebe_proof'")&&productionDeploy.includes('/api/auth/oauth/google/start')&&productionDeploy.includes('/api/auth/oauth/facebook/start'), 'production automation verifies liveness, readiness, first-party registration proof and both OAuth starts after deploy');

ok(wrangler.includes('main = "src/production-entry.js"')&&productionEntry.includes('import worker from "./worker.js"')&&productionEntry.includes('worker.fetch(request,env,ctx)')&&productionEntry.includes('worker.scheduled(event,env,ctx)'), 'production entrypoint wraps and delegates to the hardened base Worker');
ok(productionEntry.includes('/api/auth/registration-proof/challenge')&&productionEntry.includes('provider:"thebe_proof"')&&productionEntry.includes('usedRegistrationProofs')&&productionEntry.includes('hasLeadingZeroBits'), 'production entrypoint retains signed first-party registration proof, replay rejection and proof-of-work');
ok(productionEntry.includes('https://challenges.cloudflare.com')&&productionEntry.includes('Content-Security-Policy')&&productionEntry.includes('content-security-policy'), 'production entrypoint retains legacy Turnstile CSP compatibility while first-party proof protects registration');
ok(productionEntry.includes('missing-input-response')&&productionEntry.includes('invalid-input-secret')&&productionEntry.includes('turnstile_configuration_error'), 'production registration retains legacy Turnstile secret diagnostics without exposing the secret');
ok(productionEntry.includes('human_verification_retry')&&productionEntry.includes('retryable:true'), 'production registration retains explicit retryable legacy challenge handling');
ok(productionEntry.includes('/assets/thebe-desk-favicon-512.png?v=20260912b')&&productionEntry.includes('rel="icon"')&&productionEntry.includes('apple-touch-icon'), 'production HTML uses the optimized 512px Thebe Desk favicon asset with cache busting for maximum tab visibility');

// Owner command centre: the first owner-facing screen must explain the business, not merely display metrics.
ok(productionEntry.includes('injectOwnerCommandCentreAssets')&&productionEntry.includes('/assets/owner-command-centre.css')&&productionEntry.includes('/js/owner-command-centre.js')&&productionEntry.includes('x-thebe-owner-brief'), 'production HTML injects versioned same-origin owner command centre assets');
ok(ownerBrief.includes('Business owner brief')&&ownerBrief.includes('What needs your attention today')&&ownerBrief.includes('What Thebe recommends now')&&ownerBrief.includes('What happens if you act?'), 'owner command centre presents signal, recommendation and simulation flow');
ok(ownerBrief.includes('/api/daily-reporting/performance?date=')&&ownerBrief.includes('request("/api/state")'), 'owner brief uses authoritative performance intelligence plus tenant workspace state');
ok(worker.includes('if(url.pathname==="/api/daily-reporting/performance"&&req.method==="GET")')&&worker.includes('performanceIntelligenceView(env,a.tenant_id,reportDate,locationId)'), 'owner performance source remains tenant-scoped server intelligence');
ok(ownerBrief.includes('baseline7')&&ownerBrief.includes('baseline30')&&ownerBrief.includes('sampleDays'), 'owner brief compares recent location run-rate with learned historical baselines');
ok(['decisionMonthlyRevenueTargetBwp','decisionCurrentCashBwp','decisionMinimumCashBufferBwp','decisionMonthlyCashOutflowsBwp','decisionMonthlyLabourCostBwp','decisionPlannedPurchaseBwp','decisionOperatingDaysPerMonth','decisionSameMonthCollectionPct'].every(k=>ownerBrief.includes(k)), 'owner brief keeps financial targets and scenario assumptions explicit rather than inferred');
ok(ownerBrief.includes('Owner-entered financial assumptions')&&ownerBrief.includes('Transparent Thebe projection')&&ownerBrief.includes('historical reporting day'), 'owner brief visually distinguishes reported facts, owner inputs and projections');
ok(ownerBrief.includes('will not substitute missing data with invented advice')&&ownerBrief.includes('No decision threshold is currently strong enough for a specific financial recommendation'), 'owner brief fails closed instead of manufacturing recommendations');
ok(ownerBriefCompact.includes('currentCash+projectedMonthlyRevenue-outflows-(purchase||0)')&&ownerBriefCompact.includes('recommendedCashImpact=purchaseDelayImpact+(salesCashImpact||0)')&&ownerBriefCompact.includes('monthEndAfter=monthEndBefore!==null?monthEndBefore+recommendedCashImpact:null'), 'cash simulation exposes deterministic purchase and sales scenario impact');
ok(ownerBriefCompact.includes('constcanView=()=>["owner","manager"].includes(role())')&&ownerBriefCompact.includes('constcanEdit=()=>role()=="owner"')&&ownerBriefCompact.includes('constcanEditSales=()=>["owner","manager"].includes(role())'), 'owner command centre preserves management visibility, owner-only financial assumptions and owner-manager sales editing');
ok(ownerBriefCompact.includes('request("/api/state",{method:"PUT"')&&ownerBriefCompact.includes('version:latestStateEnvelope.version'), 'owner assumptions and sales records persist through the versioned tenant state boundary');
ok(!ownerBrief.includes('.innerHTML=')&&!ownerBrief.includes('.outerHTML=')&&!/\bfetch\s*\(/.test(ownerBrief), 'owner command centre avoids direct unsafe HTML assignment and raw API transport');
ok(ownerBriefCss.includes('.owner-command-centre')&&ownerBriefCss.includes('@media(max-width:700px)')&&ownerBriefCss.includes('.owner-sim-comparison')&&ownerBriefCss.includes('.owner-sales-workspace'), 'owner command centre has dedicated responsive decision, simulation and sales styling');

// Sales intelligence: recorded commercial evidence must drive conversion, dormant-quote and campaign recommendations.
ok(ownerBriefCompact.includes('constMAX_OPPORTUNITIES=500')&&ownerBriefCompact.includes('constMAX_CAMPAIGNS=50'), 'sales layer has bounded per-company record limits');
ok(ownerBrief.includes('salesIntelligence')&&ownerBrief.includes('opportunities')&&ownerBrief.includes('campaigns'), 'sales layer persists quotations and campaigns inside company-scoped tenant state');
ok(ownerBrief.includes('function conversionForPeriod')&&ownerBriefCompact.includes('row.status==="won"||row.status==="lost"')&&ownerBriefCompact.includes('resolved.length?won.length/resolved.length*100:null'), 'conversion uses only resolved won/lost quotation cohorts and excludes open quotes');
ok(ownerBriefCompact.includes('currentStart=addDays(date,-(windowDays-1))')&&ownerBriefCompact.includes('previousStart=addDays(previousEnd,-(windowDays-1))')&&ownerBriefCompact.includes('cur.resolved>=3&&prev.resolved>=3'), 'location conversion comparison uses consecutive 30-day cohorts and minimum resolved evidence');
ok(ownerBrief.includes('dormantDays')&&ownerBriefCompact.includes('daysSince(row.lastContactAt||row.quotedAt,date)')&&ownerBrief.includes('dormantValue'), 'dormant quotation detection is based on recorded follow-up age and quote value');
ok(ownerBrief.includes('Follow up ${model.sales.dormantCount} dormant quotation')&&ownerBrief.includes('recoveryRateSource'), 'dormant follow-up recommendation exposes its recovery-rate basis');
ok(ownerBriefCompact.includes('best.roas>=worst.roas*1.25')&&ownerBriefCompact.includes('Math.min(worst.monthlySpendBwp*.25,worst.monthlySpendBwp)')&&ownerBriefCompact.includes('incrementalRevenue:move*(best.roas-worst.roas)'), 'campaign reallocation requires material ROAS separation and models a bounded 25% shift');
ok(ownerBrief.includes('Move ${money(shift.move)} of monthly spend from ${shift.worst.name} to ${shift.best.name}')&&ownerBrief.includes('each with at least three resolved quotations'), 'campaign recommendation names exact spend movement only after evidence threshold');
ok(ownerBrief.toLowerCase().includes('same-month collection')&&ownerBrief.includes('salesRevenueScenario')&&ownerBrief.includes('salesCashImpact'), 'sales-to-cash simulation requires an explicit collection assumption');
ok(ownerBrief.includes('Do not enter phone numbers, identity numbers, banking details or other sensitive personal data'), 'sales capture explicitly minimizes unnecessary customer personal data');
ok(ownerBrief.includes('Sales intelligence & quotations')&&ownerBrief.includes('Add quotation / opportunity')&&ownerBrief.includes('Campaign economics')&&ownerBrief.includes('Recent quotations')&&ownerBrief.includes('Campaign performance'), 'sales workspace supports quotation capture, follow-up and campaign review');
ok(!projectedState.includes('salesIntelligence')&&ownerBriefCompact.includes('if(!canView()){shell.hidden=true;return}'), 'reviewer/auditor state projection and owner brief visibility do not expose sales records');
try{new Function(ownerBrief);ok(true,'owner command centre browser asset parses as JavaScript')}catch(error){ok(false,`owner command centre browser asset syntax error: ${error.message}`)}

ok(wrangler.includes('MAX_UPLOAD_MB = "3.5"'), 'deployment metadata retains the bounded evidence cap for future scanner qualification');
ok(worker.includes('const EVIDENCE_MAX_BYTES=3_500_000;'), 'production evidence boundary is exactly 3,500,000 bytes');
ok(worker.includes('/api/evidence/presign')&&worker.includes('/api/evidence/integrity-upload')&&worker.includes('/api/evidence/upload'), 'all direct evidence upload entry routes retain the production cap');
ok(worker.includes(String.raw`/^\/api\/evidence\/[^/]+\/upload$/`), 'presigned evidence PUT route retains the production cap');
ok((worker.match(/readBytesBounded\(req,\{maxBytes:EVIDENCE_MAX_BYTES\}\)/g)||[]).length>=2, 'production upload routes retain bounded streaming body readers');
ok(cloudflareReadme.includes('3.5 MB (3,500,000 bytes)'), 'operator documentation states the exact upload cap');
console.log(`Thebe Desk deployment-closure adversarial gate: ${pass}/${pass} PASS`);
