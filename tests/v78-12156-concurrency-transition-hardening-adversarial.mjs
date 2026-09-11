import fs from "fs";
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const api=fs.readFileSync("public/js/api-client.js","utf8");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
let checks=0;function ok(v,m){checks++;if(!v)throw new Error(`FAIL ${m}`);console.log(`PASS ${m}`)}

ok(["1.21.56","1.21.57","1.21.58","1.21.59","1.21.60","1.21.61","1.21.62","1.21.63","1.21.64","1.21.65","1.21.66","1.21.67","1.21.68","1.21.69","1.21.70","1.21.71","1.21.72","1.21.73","1.21.74","1.21.75","1.21.76","1.21.77","1.21.78","1.21.79","1.21.80","1.21.81","1.21.82","1.21.83","1.21.84","1.21.85","1.21.86","1.21.87","1.21.88","1.21.89","1.21.90","1.21.91","1.21.92","1.21.93","1.21.94","1.21.95","1.21.96","1.21.97","1.21.98","1.21.99","1.21.100","1.21.101"].includes(pkg.version),"package identifies v1.21.56 or reviewed successor");
ok(profile.package_version===pkg.version&&profile.software_release_candidate===`v78.${pkg.version}`,"release profile aligned");
ok(worker.includes(`const APP_RELEASE="v78.${pkg.version}"`),"worker release aligned");
ok(worker.includes("async function claimBusinessEventEffect(env,effect)"),"business event claim helper exists");
ok(worker.includes("WHERE id=? AND event_id=? AND tenant_id=? AND status=? RETURNING *"),"business event effect claim is compare-and-set");
ok(worker.includes("if(!claimed)return {claimed:false,contention:true}"),"claim contention fails closed without executing effect");
ok(worker.includes("if(r.claimed===false)continue;"),"event processor skips effects lost to concurrent claimant");
ok(!worker.includes("UPDATE business_event_effects SET status='running',attempts=attempts+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),last_error=NULL WHERE id=?"),"legacy unconditional effect claim removed");

ok(worker.includes('idempotentJsonMutation(env,a,req,"company-action-advance"'),"company action advance replay protected");
ok(worker.includes("WHERE tenant_id=? AND id=? AND status=?"),"company action transition compare-and-set status");
ok(worker.includes("state_changed_during_transition"),"company action concurrent transition conflict surfaced");
const companyAdvanceStart=worker.indexOf('if(url.pathname.match(/^\\/api\\/company-actions\\/[^/]+\\/advance$/)');
const companyAdvanceEnd=worker.indexOf('if(url.pathname==="/api/licences"',companyAdvanceStart);
const companyAdvanceBlock=worker.slice(companyAdvanceStart,companyAdvanceEnd);
ok(companyAdvanceStart>=0&&companyAdvanceEnd>companyAdvanceStart&&companyAdvanceBlock.indexOf("state_changed_during_transition")<companyAdvanceBlock.indexOf("DELETE FROM management_review_assignments"),"review assignment cleanup happens only after winning transition");

ok(worker.includes('idempotentJsonMutation(env,a,req,"licence-renew"'),"licence renewal replay protected");
ok(worker.includes("COALESCE(renewal_due_at,'')=COALESCE(?,'')"),"licence renewal compare-and-set due date");
ok(worker.includes("licence_changed_during_renewal"),"licence renewal concurrent conflict surfaced");
ok(worker.includes('eventKey:`licence:${licenceId}:renewed:${renewalDueAt}`'),"licence renewal business event deterministic per target date");

ok(worker.includes('idempotentJsonMutation(env,a,req,"business-event-report"'),"manual business event report replay protected");
ok(api.includes('"POST /api/business-events/report"'),"browser auto idempotency includes manual business event report");
ok(api.includes('/^\\/api\\/company-actions\\/[^/]+\\/advance$/'),"browser auto idempotency recognizes company action transitions");
ok(api.includes('/^\\/api\\/licences\\/[^/]+\\/renew$/'),"browser auto idempotency recognizes licence renewal");
ok(profile.v12156_business_event_concurrency_hardening===true&&profile.business_event_effect_compare_and_set_claim===true,"release profile records concurrency hardening");
ok(profile.transition_mutations_retry_safe===true&&profile.manual_business_event_reporting_idempotent===true,"release profile records retry safety");

console.log(`V78 1.21.56 concurrency/transition hardening gate: ${checks}/${checks} PASS`);
