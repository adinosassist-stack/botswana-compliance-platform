import fs from "node:fs";
import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pkg=JSON.parse(read("package.json")),profile=JSON.parse(read("RELEASE_PROFILE.json"));
const worker=read("cloudflare/src/worker.js"),schema=read("cloudflare/schema.sql"),migration=read("cloudflare/migrations/038_v78_scheduled_run_observability.sql"),server=read("server/server.js"),sw=read("public/sw.js"),launch=read("docs/LAUNCH.md"),deploy=read("cloudflare/deploy-free.sh"),backup=read("docs/BACKUP_RESTORE.md"),shape=read("scripts/verify-d1-export.mjs"),restore=read("scripts/verify-d1-restore.mjs"),routeAudit=read("scripts/route-security-audit.mjs");
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL ${checks}: ${m}`)};
ok(["1.21.53","1.21.54","1.21.55","1.21.56","1.21.57","1.21.58","1.21.59","1.21.60","1.21.61","1.21.62","1.21.63","1.21.64","1.21.65","1.21.66","1.21.67","1.21.68","1.21.69","1.21.70","1.21.71","1.21.72","1.21.73","1.21.74","1.21.75","1.21.76","1.21.77","1.21.78","1.21.79","1.21.80","1.21.81","1.21.82","1.21.83","1.21.84","1.21.85","1.21.86","1.21.87","1.21.88","1.21.89","1.21.90","1.21.91","1.21.92","1.21.93","1.21.94","1.21.95","1.21.96","1.21.97","1.21.98","1.21.99","1.21.100","1.21.101"].includes(pkg.version),"package identifies v1.21.53 or reviewed successor");
ok(profile.package_version===pkg.version&&profile.software_release_candidate===`v78.${pkg.version}`,"release profile aligned");
ok(worker.includes(`const APP_RELEASE="v78.${pkg.version}"`)&&server.includes(`const APP_VERSION="${pkg.version}"`)&&sw.includes(pkg.version),"Worker, Node and service-worker release aligned");
ok(["038_v78_scheduled_run_observability.sql","039_v78_mutation_idempotency.sql","040_v78_authorization_reporting_concurrency.sql","041_v78_webhook_purge_claim_hardening.sql","042_v78_session_generation_revocation.sql","043_v78_session_inventory_hardening.sql"].includes(profile.latest_cloudflare_migration)&&worker.includes(`const EXPECTED_SCHEMA_DELTA="${profile.latest_cloudflare_migration}"`),"release and readiness preserve migration 038 or reviewed successor");
ok(launch.includes(profile.latest_cloudflare_migration)&&deploy.includes(profile.latest_cloudflare_migration),"launch/deploy runbooks require current migration floor");
ok(migration.includes("CREATE TABLE IF NOT EXISTS platform_scheduled_runs")&&schema.includes("CREATE TABLE IF NOT EXISTS platform_scheduled_runs"),"scheduled run ledger exists in migration and fresh schema");
ok(worker.includes('SELECT 1 ok FROM platform_scheduled_runs LIMIT 1'),"readiness probes scheduled-run ledger");
ok(profile.authenticated_route_branches===(["1.21.89","1.21.90","1.21.91","1.21.92","1.21.93","1.21.94","1.21.95","1.21.96","1.21.97","1.21.98","1.21.99","1.21.100","1.21.101"].includes(pkg.version)?253:252)&&routeAudit.includes(`release:"${pkg.version}"`),"route inventory metadata is current");

ok(worker.includes("async function readBytesBounded")&&worker.includes("async function readTextBounded"),"shared streaming body readers are present");
ok(!/req\.(?:text|arrayBuffer|json|formData|blob)\(/.test(worker),"Worker routes do not bypass bounded inbound-body readers");
ok(worker.includes('url.pathname==="/api/webhooks/whatsapp"')&&worker.includes('readTextBounded(req,{maxBytes:256*1024})'),"WhatsApp signed webhook body is capped at 256 KiB");
ok((worker.match(/readTextBounded\(req,\{maxBytes:256\*1024\}\)/g)||[]).length>=2,"payment and WhatsApp webhook raw bodies are capped");
ok((worker.match(/readBytesBounded\(req,\{maxBytes:EVIDENCE_MAX_BYTES\}\)/g)||[]).length>=2,"both evidence upload paths enforce the 8 MiB stream bound");
ok(profile.all_inbound_request_bodies_bounded===true&&profile.evidence_upload_stream_bound_bytes===8388608,"release profile records bounded inbound body policy");

ok(worker.includes("normalizePaymentWebhookEvent(body,env)")&&worker.includes('webhook_event_conflict'),"payment webhook identifiers are normalized and conflicting duplicate IDs fail closed");
ok(worker.includes("existing.payload_hash!==payloadHash||existing.event_type!==eventType"),"payment duplicate identity compares payload hash and event type");
ok(worker.includes("if(Number(existing.processed||0)===1)return {ok:true,duplicate:true,processed:true")&&worker.includes("webhook_processing_in_progress"),"processed duplicates short-circuit while unfinished duplicates are claim-protected");
ok(worker.includes("UPDATE payment_events SET processed=1,processed_at=CURRENT_TIMESTAMP,processing_error=NULL,processing_token=NULL,processing_started_at=NULL"),"successful webhook processing clears prior error and claim state");
ok(worker.includes('edgeScopedRateLimit(req,env,"payment-return"'),"browser payment return is edge-throttled before provider verification");
ok(!worker.includes('x-forwarded-for'),"authentication throttling does not trust X-Forwarded-For");
ok(worker.includes('oauth_callback_failed')&&worker.includes('return json({error:"oauth_failed",requestId}'),"OAuth callback errors are logged internally and redacted from clients");

ok(worker.includes("async function beginPlatformScheduledRun")&&worker.includes("async function finishPlatformScheduledRun")&&worker.includes("async function prunePlatformScheduledRuns"),"durable scheduled-run lifecycle helpers are present");
ok(migration.includes("run_key TEXT NOT NULL UNIQUE")&&migration.includes("CHECK(status IN ('running','completed','failed'))"),"scheduled ledger has a unique replay identity and bounded status states");
ok(worker.includes("completed_at<datetime('now','-90 days')")&&worker.includes("LIMIT 500"),"scheduled-run history pruning is bounded");
ok(worker.includes('url.pathname==="/api/platform/scheduled-runs"')&&worker.includes("ORDER BY scheduled_for DESC LIMIT 100"),"platform scheduled-run history endpoint is bounded");
ok(profile.scheduled_run_durable_ledger===true&&profile.scheduled_run_history_limit===100,"release profile records durable scheduled-run observability");

ok(shape.includes("createReadStream")&&shape.includes("createHash")&&shape.includes("platform_scheduled_runs"),"D1 export verifier streams content, hashes it and requires current schema");
ok(restore.includes('new DatabaseSync(":memory:")')&&restore.includes("PRAGMA integrity_check")&&restore.includes("PRAGMA foreign_key_check"),"D1 restore verifier executes SQL and validates integrity/FKs");
ok(restore.includes("256*1024*1024")&&backup.includes("256 MiB"),"local restore drill has an explicit memory safety ceiling");
ok(pkg.scripts["check:d1-backup-restore"]&&String(pkg.scripts.test).includes("check:d1-backup-restore"),"restore execution verifier is part of the full gate");

ok(worker.includes("const queueLimit=250")&&worker.includes("truncated:total>queueLimit"),"management rereview queue is bounded with truncation disclosure");
ok(worker.includes("const eventLimit=500,evidenceLimit=500,findingLimit=250")&&worker.includes("historyMeta:{"),"employment defense histories are bounded with metadata disclosure");
ok(server.includes('async function externalFetch(url,options={},timeoutMs=20000)')&&server.includes('redirect:"error"'),"Node fallback provider I/O has timeout and redirect refusal parity");
ok((server.match(/await externalFetch\(/g)||[]).length>=5,"Node OAuth, scanner and email provider calls use guarded transport");
ok(worker.includes('const SEO_RELEASE_LASTMOD="2026-09-03"')&&server.includes('const SEO_RELEASE_LASTMOD="2026-09-03"'),"Worker and Node sitemap release dates are aligned");

ok(fs.existsSync(path.join(root,"tests/v78-12153-payment-edge-runtime.mjs"))&&fs.existsSync(path.join(root,"tests/v78-12153-scheduled-run-runtime.mjs")),"v1.21.53 runtime gates are packaged");
ok(profile.v12153_payment_webhook_scheduled_restore_hardening===true,"release profile records v1.21.53 hardening");
console.log(`V78 1.21.53 payment/webhook/scheduled/restore hardening gate: ${checks}/${checks} PASS`);
