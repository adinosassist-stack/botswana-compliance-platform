import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["review events",s.includes("evidence_review_events")],
 ["hash",s.includes("content_sha256")],
 ["quarantine",s.includes("review_status")&&w.includes("'quarantined'")],
 ["sha helper",w.includes("sha256ArrayBuffer")],
 ["dedupe",w.includes("EVIDENCE_DUPLICATE_DETECTED")],
 ["upload api",w.includes("/api/evidence/upload")],
 ["review api",w.includes("/review")],
 ["approved requirement",w.includes("evidence_not_approved")],
 ["clean scan requirement",w.includes("clean_malware_scan_required")&&w.includes("evidenceScanReady")],
 ["mime allowlist",w.includes("unsupported_file_type")],
 ["scanner response auth",w.includes("scanner_response_signature_invalid")&&w.includes("x-evidence-scan-signature")],
 ["safe download",w.includes("content-disposition")&&w.includes('"cache-control":"private, no-store"')],
 ["legacy reset",s.includes("v66_malware_scan_required_before_approval")],
 ["UI",h.includes('id="evidenceintegrity"')&&h.includes("Quarantine is not antivirus.")],
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
