import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const env=fs.readFileSync(new URL("../.env.example",import.meta.url),"utf8");
const magicMatch=w.match(/function fileSignatureMatches\(contentType,buf\)\{.*?\n\}/s);
const magicRuntime=magicMatch?new Function(`${magicMatch[0]};return fileSignatureMatches`)():null;
const pdfBytes=new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31]).buffer;
const badPdf=new Uint8Array([0x4d,0x5a,0x90,0x00,0x00]).buffer;
const pngBytes=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).buffer;
const checks=[
 ["scan columns",s.includes("scan_attempts INTEGER")&&s.includes("scanner_provider TEXT")&&s.includes("clean_object_key TEXT")],
 ["scan event ledger",s.includes("evidence_scan_events")&&s.includes("'CLEAN'")&&s.includes("'INFECTED'")],
 ["access event ledger",s.includes("evidence_access_events")&&s.includes("'DOWNLOAD_BLOCKED'")],
 ["legacy approved reset",s.includes("v66_malware_scan_required_before_approval")&&s.includes("scan_status='legacy_unscanned'")],
 ["downstream obligation reset",s.includes("UPDATE obligation_evidence_requirements")&&s.includes("status='attached'")],
 ["downstream control reset",s.includes("UPDATE tenant_control_status")&&s.includes("evidence_health='missing'")],
 ["downstream passport reset",s.includes("v66_evidence_scan_reverification_required")&&s.includes("UPDATE passport_verifications")],
 ["downstream packs stale",s.includes("UPDATE inspection_packs")&&s.includes("UPDATE dispute_defense_packs")],
 ["scanner safe public HTTPS required",w.includes("safeExternalServiceUrl(env.EVIDENCE_SCAN_API_URL)")],
 ["scanner request signed",w.includes('"x-evidence-signature":signature')],
 ["scanner response signed",w.includes("x-evidence-scan-signature")&&w.includes("scanner_response_signature_invalid")],
 ["scanner response bound to file",w.includes("scanner_response_identity_mismatch")&&w.includes("data.evidenceId")&&w.includes("data.sha256")],
 ["scanner verdict only clean infected",w.includes('!["clean","infected"].includes(verdict)')],
 ["scan clean promotion",w.includes("/clean/${row.id}/")&&w.includes("scan_status='clean'")],
 ["infected rejected",w.includes("scan_status='infected'")&&w.includes("review_status='rejected'")],
 ["clean required for approval",w.includes("clean_malware_scan_required")],
 ["clean required for obligation",w.includes("evidence_not_approved_or_scan_clean")],
 ["clean required for HR",w.includes("approved_clean_evidence_required")],
 ["clean required for control",w.includes("evidenceScanReady(ev)")],
 ["defense pack clean only",w.includes('approved=evidence.filter(x=>x.review_status==="approved"&&evidenceScanReady(x))')],
 ["continuous assurance scan aware",w.includes("!evidenceScanReady(e)||e.superseded_at")],
 ["magic validation",w.includes("function fileSignatureMatches")&&w.includes("file_signature_mismatch")],
 ["magic validation runtime",!!magicRuntime&&magicRuntime("application/pdf",pdfBytes)&&!magicRuntime("application/pdf",badPdf)&&magicRuntime("image/png",pngBytes)],
 ["presign hides object key",w.includes('uploadUrl:`/api/evidence/${eid}/upload`')&&!w.includes("objectKey:key")],
 ["safe attachment download",w.includes('"content-disposition":`attachment; filename=')&&w.includes('"cache-control":"private, no-store"')&&w.includes('"x-content-type-options":"nosniff"')],
 ["download audit",w.includes("EVIDENCE_DOWNLOADED")&&w.includes("recordEvidenceAccess")],
 ["bounded scan sweep",w.includes("processEvidenceScanQueue(env,10)")&&w.includes("scan_attempts<5")],
 ["manual retry resets attempts",w.includes("scan_status='queued',scan_attempts=0")],
 ["duplicate inheritance recent only",w.includes("30*86400000")&&w.includes("scanned_at>datetime('now','-30 days')")],
 ["unconfigured scanner no hammer",w.includes("scannerConfigured:false")],
 ["deployment readiness scan",w.includes('{key:"EVIDENCE_SCAN_API_URL",required:evidenceUploadsEnabled')&&w.includes('{key:"EVIDENCE_SCAN_SECRET",required:evidenceUploadsEnabled')&&w.includes("const evidenceUploadsEnabled=bool01(env.EVIDENCE_UPLOADS_ENABLED)")],
 ["env scanner documented",env.includes("EVIDENCE_SCAN_API_URL=")&&env.includes("EVIDENCE_SCAN_SECRET=")],
 ["evidence UI",h.includes("Evidence Security")&&h.includes("Scanner not configured · approval remains blocked")],
 ["runtime v66+",/version:"v(?:6[6-9]|7[0-9]|[89][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
