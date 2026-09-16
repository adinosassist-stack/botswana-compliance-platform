import fs from "node:fs";
const wr=fs.readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const releaseEntry=fs.readFileSync(new URL("../cloudflare/src/release-governance-entry.js",import.meta.url),"utf8");
const deploy=fs.readFileSync(new URL("../cloudflare/deploy-free.sh",import.meta.url),"utf8");
const renderer=fs.readFileSync(new URL("../cloudflare/render-production-config.sh",import.meta.url),"utf8");
const preflight=fs.readFileSync(new URL("../cloudflare/preflight-production.sh",import.meta.url),"utf8");
const ignore=fs.readFileSync(new URL("../.gitignore",import.meta.url),"utf8");
const vars=(wr.match(/^\[vars\]$/gm)||[]).length;
const d1Create=deploy.indexOf('d1 create bw-compliance-os');
const r2Create=deploy.indexOf('r2 bucket create bw-compliance-evidence');
const cdCloudflare=deploy.indexOf('cd cloudflare');
const renderConfig=deploy.indexOf('./render-production-config.sh');
const preflightConfig=deploy.indexOf('./preflight-production.sh');
const deployConfig=deploy.indexOf('deploy --config');
const checks=[
 ["single vars table",vars===1],
 ["free-first deployment",wr.includes('DEPLOYMENT_PROFILE = "workers-free-first"')],
 ["safe launch disables paid checkout by default",wr.includes('PAYMENT_PROVIDER = "none"')&&!wr.includes('PAYMENT_PROVIDER = "dpo"')],
 ["registration remains on hold by default",wr.includes('REGISTRATION_MODE = "hold"')],
 ["cohort identities are never stored in public Wrangler vars",!/^REGISTRATION_COHORT_EMAILS\s*=/m.test(wr)],
 ["cohort membership is read only from the secret-backed runtime binding",releaseEntry.includes('env?.REGISTRATION_COHORT_EMAILS_SECRET')&&!releaseEntry.includes('env?.REGISTRATION_COHORT_EMAILS||')],
 ["empty cohort configuration fails closed",releaseEntry.includes('if(!cohort.size)return json({error:"registration_policy_invalid"')],
 ["audit secret documented",wr.includes("AUDIT_INTEGRITY_SECRET")],
 ["dedicated audit secret used",w.includes("env.AUDIT_INTEGRITY_SECRET")&&!w.includes("AUDIT_INTEGRITY_SECRET||env.SESSION_SECRET")],
 ["runtime version current",/version:"v(?:58(?:\.1)?|59|[6-9][0-9])",runtime:"cloudflare-worker"/.test(w)],
 ["resources provision before placeholder config is loaded",d1Create>=0&&r2Create>d1Create&&cdCloudflare>r2Create],
 ["temporary production config is rendered before preflight/deploy",renderConfig>cdCloudflare&&preflightConfig>renderConfig&&deployConfig>preflightConfig],
 ["production deploy uses explicit rendered config",deploy.includes('PROD_CONFIG=')&&deploy.includes('deploy --config')&&deploy.includes('secret put SESSION_SECRET --config')],
 ["runbook launches with payments disabled and documents explicit DPO opt-in",deploy.includes('PAYMENT_PROVIDER_OVERRIDE=none')&&deploy.includes('PAYMENT_PROVIDER_OVERRIDE=dpo')&&deploy.includes('Orange Money production activation is blocked')],
 ["renderer requires provisioned D1 UUID",renderer.includes('D1_DATABASE_ID')&&renderer.includes('provisioned D1 UUID')&&renderer.includes('template must contain exactly one D1 database_id placeholder')],
 ["renderer requires safe payment default and restricts activation",renderer.includes('PAYMENT_PROVIDER_OVERRIDE')&&renderer.includes('template PAYMENT_PROVIDER must default to none')&&renderer.includes('none|dpo')&&renderer.includes('orange_money remains blocked')],
 ["preflight rejects placeholder and malformed D1 IDs",preflight.includes('D1 database_id placeholder')&&preflight.includes('provisioned D1 UUID')],
 ["preflight enforces safe supported launch providers",preflight.includes('PAYMENT_PROVIDER must be none or dpo')&&preflight.includes('orange_money is blocked')],
 ["preflight enforces alternate-origin shutdown",preflight.includes('workers_dev must be false')&&preflight.includes('preview_urls must be false')],
 ["preflight enforces production resources without undeclared queue consumer",preflight.includes('binding = "DB"')&&preflight.includes('binding = "EVIDENCE"')&&!preflight.includes('TASK_QUEUE')&&!preflight.includes('bw-compliance-tasks')],
 ["ephemeral production config cannot be accidentally committed",ignore.includes('cloudflare/.wrangler-production.*.toml')]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
