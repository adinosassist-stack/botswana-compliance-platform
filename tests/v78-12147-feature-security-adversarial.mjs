import fs from "node:fs";import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const worker=read("cloudflare/src/worker.js"),html=read("public/index.html"),api=read("public/js/api-client.js"),profile=JSON.parse(read("RELEASE_PROFILE.json"));
const schema=read("cloudflare/schema.sql"),migration=read("cloudflare/migrations/036_v78_api_auth_hardening.sql"),launch=read("docs/LAUNCH.md");
let n=0;const ok=(v,m)=>{n++;if(!v)throw new Error(`FAIL ${n}: ${m}`)};
// API input / auth abuse hardening
ok(worker.includes("const MAX_JSON_BODY_BYTES=1024*1024"),"API JSON bodies must have a hard size ceiling");
ok(worker.includes("async function readJson(req"),"bounded JSON parser must exist");
ok(!worker.includes("await req.json()"),"Worker routes must not bypass bounded JSON parsing");
ok(worker.includes('new HttpError(413,"payload_too_large")')&&worker.includes('new HttpError(400,"invalid_json")'),"oversized and malformed JSON must map to explicit client errors");
ok(worker.includes("error instanceof HttpError"),"top-level Worker error boundary must preserve bounded parser status");
ok(worker.includes("timingSafeText(supplied,expected)"),"CSRF comparison must be timing-safe");
ok((worker.includes('authRateLimit(env,req,"register"')||worker.includes('authRateLimit(env,req,"register-ip"'))&&worker.includes('authRateLimit(env,req,"login-ip"')&&(worker.includes('authRateLimit(env,req,"login-account"')||worker.includes('authSubjectRateLimit(env,"login-account"'))&&worker.includes('authRateLimit(env,req,"password-reset"'),"public credential endpoints must retain IP throttling plus account throttling");
ok(worker.includes("SESSION_SECRET+\"|auth-rate-v2\""),"auth throttling must store only keyed/HMAC bucket identifiers");
ok(worker.includes("u?.password_hash||DUMMY_PASSWORD_HASH"),"unknown-user login path must perform password verification work");
ok(schema.includes("CREATE TABLE IF NOT EXISTS auth_rate_limits")&&migration.includes("CREATE TABLE IF NOT EXISTS auth_rate_limits"),"fresh and upgrade schemas must both include auth rate limits");
ok(profile.v12147_auth_hardening_migration==="036_v78_api_auth_hardening.sql","release profile must retain migration 036 as the v1.21.47 auth-hardening delta");
ok(launch.includes(profile.latest_cloudflare_migration),"launch runbook must require the current reviewed migration for upgrades");
// Front-end transport and performance lifecycle
ok(html.includes("const publicApiClient=BW.api.createClient"),"public reporter/passport flows must use the common HTTP-error client");
ok(!html.includes('fetch(`/api/auth/${authMode}`'),"authentication must use the production API client");
ok(!html.includes('fetch("/api/auth/me"'),"session bootstrap must use the production API client");
ok(!html.includes('fetch("/public/daily-reporting/access"')&&!html.includes('fetch("/public/daily-reporting/submit"')&&!html.includes('fetch("/public/passport/verify"'),"public JSON flows must not reimplement fetch/error handling");
ok((html.match(/\bfetch\s*\(/g)||[]).length===0&&((api.match(/\bfetch\s*\(/g)||[]).length===2),"feature code must not bypass centralized transport; only the API client may call fetch");
ok(html.includes('const shouldRender=view=>{if(!roleCanView(view))return false;')&&html.includes('const run=(view,fn)=>{if(!shouldRender(view)||typeof fn!=="function")return;')&&html.includes('run("accountdata",renderDeletionStatus)')&&!html.includes('isAsync=fn.constructor?.name==="AsyncFunction"'),"hidden server-backed views must not fetch during global render");
ok(html.includes("queueMicrotask(()=>renderAll())"),"navigation must refresh the newly active server-backed view");
ok(api.includes("AbortController")&&api.includes('credentials:"same-origin"')&&api.includes("429,502,503,504"),"common API client must retain timeout, credential and retry protections");
// Feature-specific validation and bounded list hardening
ok(worker.includes('title=boundedReportText(body.title,180)')&&worker.includes('tender_title_required')&&worker.includes('invalid_closing_date')&&worker.includes('https_source_url_required'),"tender creation must bound text and validate closing date/source URL");
ok(worker.includes('allowedCaseTypes=new Set(["disciplinary","grievance","absence","performance","termination-review"])')&&worker.includes('allowedRisks=new Set(["low","medium","high","critical"])')&&worker.includes('SELECT id FROM employees WHERE id=? AND tenant_id=? LIMIT 1'),"HR cases must validate enum inputs and tenant-scoped employee references");
ok(worker.includes('fullName=boundedReportText(b.fullName,160)')&&worker.includes('roleTitle=boundedReportText(b.roleTitle,120)')&&worker.includes('employmentType=boundedReportText(b.employmentType||"unknown",40)')&&worker.includes('end_before_start'),"employee creation must bound strings and enforce date ordering");
ok(worker.includes('allowedActionTypes=new Set(["annual-return","beneficial-owner-change","director-change","shareholder-change","registered-office-change","constitution-review"])')&&worker.includes('action_payload_too_large'),"company actions must use an allowlist and bounded payloads");
ok(worker.includes('body.sourceType?boundedReportText(body.sourceType,80):null')&&worker.includes('body.sourceId?boundedReportText(body.sourceId,120):null')&&worker.includes('boundedReportText(body.notes,1200)'),"service orders must bound user-supplied reference and notes fields");
ok(worker.includes('operating_locations WHERE tenant_id=? ORDER BY active DESC,name LIMIT 250')&&worker.includes('service_catalog WHERE active=1 ORDER BY sort_order,name LIMIT 100')&&worker.includes('compliance_schedules WHERE tenant_id=? ORDER BY schedule_type LIMIT 200')&&worker.includes('ai_credit_packs WHERE active=1 ORDER BY sort_order,credits LIMIT 100'),"high-use feature catalog/location/schedule/AI-pack reads must be bounded");
console.log(`V78 1.21.48 feature security adversarial gate: ${n}/${n} PASS`);
