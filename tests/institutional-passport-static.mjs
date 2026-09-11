import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["passport state",s.includes("CREATE TABLE IF NOT EXISTS passport_state")&&s.includes("revision INTEGER")],
 ["share invalidation fields",s.includes("invalidated_at TEXT")&&s.includes("issued_revision INTEGER")],
 ["public receipts",s.includes("passport_public_receipts")&&s.includes("snapshot_hash")&&s.includes("receipt_signature")],
 ["keyed receipt",w.includes('SESSION_SECRET+"passport-receipt"')&&w.includes("expectedSignature")&&w.includes('integrity=timingSafeText')],
 ["share lifecycle",s.includes("passport_share_events")],
 ["pro/partner entitlement",s.includes("('pro','institutional_passport',1")&&s.includes("('business','institutional_passport',0")],
 ["query token disabled",w.includes("passport_token_must_not_be_sent_in_url")&&!w.includes('url.searchParams.get("token")')],
 ["POST bearer verification",w.includes('url.pathname==="/public/passport/verify"&&req.method==="POST"')&&w.includes("body.shareToken")],
 ["public no referrer",w.includes('referrer-policy":"no-referrer"')],
 ["atomic view claim",w.includes("max_views IS NULL OR view_count<max_views")&&w.includes("claim.meta?.changes")],
 ["cheap view limit before assurance",w.includes('return json({error:"share_view_limit_reached"},410,PASSPORT_PUBLIC_HEADERS)\n      }\n      const fresh=await passportShareFreshAgainstAssurance(env,share)')],
 ["revision race guard",w.includes("share_changed_during_verification_retry")&&w.includes("issued_revision=?")],
 ["material invalidation",w.includes("invalidatePassportState")&&w.includes("share_stale_reissue_required")],
 ["assurance freshness gate",w.includes("passportShareFreshAgainstAssurance")&&w.includes("assurance_changed_since_share")],
 ["receipt time staleness",w.includes("timeStale")&&w.includes("c.expiresAt")],
 ["business event invalidates passport",w.includes('invalidatePassportState(env,effect.tenant_id,"business_event",effect.event_id)')],
 ["manual verification blocked",w.includes("manual_passport_verification_not_allowed")],
 ["assurance-derived verification",w.includes("derivedPassportStatus")&&w.includes("current_evidence_backed_control")],
 ["legacy verification reset",s.includes("assurance_reverification_required")&&s.includes("WHERE status='verified'")],
 ["legacy share reset",s.includes("v63_security_reissue_required")&&s.includes("UPDATE passport_shares")],
 ["verification needs healthy evidence",w.includes('control.evidence_health==="healthy"')],
 ["verification needs strong assurance",w.includes('["evidence_backed","reviewed"].includes(control.assurance_level)')],
 ["explicit controls required",w.includes("select_at_least_one_control")&&w.includes("selectedControls")],
 ["share expiry capped",w.includes("share_expiry_must_be_within_30_days")],
 ["default view cap",w.includes("body.maxViews==null?25")],
 ["receipt lookup",w.includes("public\\/passport\\/receipt")&&w.includes("superseded")],
 ["receipt verification url",w.includes("receiptUrl")&&w.includes("verifyUrl")],
 ["share no raw token query url",w.includes('shareUrl=`${origin}/#passport=')&&!w.includes("return json({ok:true,id:sid,shareToken:raw")],
 ["public fragment stripped",h.includes('history.replaceState(null,"",location.pathname+location.search)')],
 ["public POST viewer",h.includes('publicApiClient.request("/public/passport/verify",{method:"POST"')],
 ["least privilege UI",h.includes("Select only the controls the recipient needs")&&h.includes("passportControlSelect")],
 ["institutional copy",h.includes("Institutional sharing")&&h.includes("Verification receipt")],
 ["runtime current",/version:"v(?:63|6[4-9]|[7-9][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
