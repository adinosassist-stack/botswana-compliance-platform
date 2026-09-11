import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const pkg=JSON.parse(read("package.json"));
const profile=JSON.parse(read("RELEASE_PROFILE.json"));
const sw=read("public/sw.js");
const readme=read("README.md");
const launch=read("docs/LAUNCH.md");
const status=read("docs/LAUNCH_STATUS.md");
const cfReadme=read("cloudflare/README.md");
const deployFree=read("cloudflare/deploy-free.sh");
const worker=read("cloudflare/src/worker.js");
const previewBuilder=read("scripts/build-release-preview.mjs");
const migrations=fs.readdirSync(path.join(root,"cloudflare/migrations")).filter(x=>/^\d{3}_.*\.sql$/.test(x)).sort();

let checks=0;
function ok(cond,msg){checks++; if(!cond) throw new Error(`FAIL ${checks}: ${msg}`);}

ok(/^1\.21\.(?:4[6-9]|[5-9]\d|\d{3,})$/.test(pkg.version),"package version must retain or supersede the 1.21.46 release line");
ok(profile.package_version===pkg.version,"release profile package version must match package.json");
ok(sw.includes(`bw-business-protection-v78-${pkg.version}`),"service-worker cache must match the current package version");
ok(readme.startsWith(`# Thebe Desk — v${pkg.version}`),"README must advertise the current deployable release first");
ok(profile.social_oauth_worker_port_complete===true,"release profile must not retain the superseded false OAuth port flag");
ok(profile.cloudflare_social_oauth_port_complete===true,"Cloudflare OAuth completion flag must remain true");
ok(migrations.includes("035_v78_control_replacement_governance.sql"),"migration 035 control-replacement governance must remain packaged");
ok(profile.launch_runbook_current===true && profile.release_docs_coherent===true,"release metadata coherence flags must be true");
ok(profile.software_release_candidate_code_ready===true,"software release candidate must be marked code-ready");
ok(profile.external_go_live_gates_still_required===true,"external go-live gates must remain explicit");
ok(Array.isArray(profile.launch_gate_open) && profile.launch_gate_open.length>0,"external launch gates must not be erased/faked as complete");
ok(profile.live_payment_provider_configured===false,"do not fabricate live payment-provider configuration");
ok(profile.live_dpo_credentials_tested===false,"do not fabricate DPO live credential verification");
ok(profile.whatsapp_production_configured===false,"do not fabricate WhatsApp production configuration");
ok(profile.cipa_live_sync_claimed===false,"do not fabricate CIPA live-sync readiness");

ok(migrations.at(-1)===profile.latest_cloudflare_migration,"release profile must identify the actual latest packaged migration");
const nums=migrations.map(x=>Number(x.slice(0,3)));
for(let i=1;i<nums.length;i++) ok(nums[i]===nums[i-1]+1,`migration sequence must be contiguous at ${migrations[i]}`);

ok(launch.includes("for a brand-new database"),"launch runbook must distinguish fresh database bootstrap");
ok(launch.includes("load the current `cloudflare/schema.sql`"),"fresh launch must use current full schema");
ok(launch.includes("apply only the pending release migrations"),"existing database upgrade must use pending deltas only");
ok(launch.includes(`through `+"`"+profile.latest_cloudflare_migration+"`"),"existing database upgrade must reach the current migration");
ok(!launch.includes("through `020_v78_ai_copilot_motion_security.sql`"),"launch runbook must not stop at stale migration 020");
ok(launch.includes("Worker code is newer than the production D1 schema"),"launch runbook must fail closed on code/schema drift");
ok(status.includes(`Schema requirement: current v${pkg.version} schema`),"launch status must surface current schema requirement");
ok(status.includes("Public go-live: CONDITIONAL"),"launch status must distinguish code-ready from external go-live");
ok(cfReadme.includes(`upgrade delta `+"`migrations/"+profile.latest_cloudflare_migration+"`"),"Cloudflare README must point to the current upgrade delta");
ok(cfReadme.includes("For a brand-new D1 database, load the current `schema.sql`"),"Cloudflare README must distinguish fresh bootstrap");
ok(!cfReadme.includes("Apply `migrations/020_v78_ai_copilot_motion_security.sql` after v77"),"Cloudflare README must not retain stale final-migration instruction");
ok(!deployFree.includes("SESSION_SECRET\\necho"),"fresh deploy helper must not contain the old malformed newline");
ok(deployFree.includes("--file=schema.sql"),"fresh deploy helper must load current full schema");
ok(deployFree.includes("DO NOT replay schema.sql"),"deploy helper must warn existing databases not to replay full schema");
ok(worker.includes(`const APP_RELEASE="v78.${pkg.version}"`),"Worker must expose exact current release identity");
ok(worker.includes(`const EXPECTED_SCHEMA_DELTA="${profile.latest_cloudflare_migration}"`),"Worker must declare current schema delta");
ok(worker.includes("async function currentSchemaReady(env)"),"Worker must probe current schema readiness");
ok(worker.includes("error:\"schema_outdated\""),"/api/ready must fail closed for stale schema");
ok(worker.includes("schemaReady:true"),"/api/ready must expose successful schema state");
ok(previewBuilder.includes(`process.argv[2]||"dist/THEBE_DESK_V81_RECOVERY_R1_${pkg.version.replaceAll(".","")}_`) && previewBuilder.includes("_Preview.html"),"npm build:preview must have a usable current/successor output");

console.log(`V78 1.21.46 launch metadata coherence adversarial gate: ${checks}/${checks} PASS`);
