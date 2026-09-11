import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["task hardening",s.includes("action_key TEXT")&&s.includes("partner_tasks_action_unique")&&s.includes("partner_task_events")],
 ["refresh history",s.includes("partner_portfolio_refresh_runs")],
 ["partner-only entitlement",s.includes("('partner','partner_action_center',1")&&s.includes("('pro','partner_action_center',0")],
 ["active consent filter",w.includes("partner_client_access")&&w.includes("pa.status='active'")],
 ["read scope filter",w.includes("json_each(pa.scopes_json)")&&w.includes("value='read'")],
 ["HR scope filter",w.includes("can_hr_review")&&w.includes("r.category<>'employment' OR a.can_hr_review=1")&&w.includes("bw.employment.%")],
 ["client HR detail filter",w.includes('const canHr=gate.scopes.includes("hr_review")')&&w.includes("event_category<>'workforce'")],
 ["single query action feed",w.includes("WITH authorized AS")&&w.includes("UNION ALL")],
 ["no per-action task lookup",w.includes("existingMap=new Map")&&!w.includes('SELECT id,status,source_status FROM partner_tasks WHERE partner_tenant_id=? AND client_tenant_id=? AND action_key=?')],
 ["bounded task batches",w.includes("stmts.splice(0,50)")&&w.includes("await env.DB.batch(chunk)")],
 ["refresh log only material changes",w.includes("const materiallyChanged=")&&w.includes("if(materiallyChanged)stmts.push")],
 ["event impact actions",w.includes("business_event_impacts")],
 ["risk actions",w.includes("business_risk_events")],
 ["regulatory actions",w.includes("regulatory_impacts")],
 ["stale inspection actions",w.includes("inspection_packs")&&w.includes("p.status='stale'")],
 ["task does not resolve client source",w.includes("Partner task status does not alter the client's underlying compliance or risk record.")],
 ["task list rechecks consent",w.includes("JOIN partner_client_access pa ON pa.partner_tenant_id=p.partner_tenant_id")&&w.includes("EXISTS(SELECT 1 FROM json_each(pa.scopes_json) WHERE value='read')")],
 ["revocation purges cached tasks",w.includes("cachedPartnerTasksPurged:true")&&w.includes("DELETE FROM partner_tasks WHERE partner_tenant_id=? AND client_tenant_id=?")],
 ["client detail scope gate",w.includes('partnerAccess(env,a.tenant_id,clientTenantId,"read")')],
 ["shared helper enforces read scope",w.includes('if(!scopes.includes(scope))return {ok:false,error:"partner_scope_required",scope}')],
 ["invite fails closed",w.includes('if(!env.SESSION_SECRET)return json({error:"session_secret_not_configured"},503)')&&!w.includes('env.SESSION_SECRET||"partner-invite"')],
 ["invite email binding",w.includes("invite_email_mismatch")],
 ["action center UI",h.includes('id="partneractioncenter"')&&h.includes("Client Impact Desk")],
 ["consent copy",h.includes("Client consent remains authoritative")],
 ["runtime current",/version:"v(?:62|6[3-9]|[7-9][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
