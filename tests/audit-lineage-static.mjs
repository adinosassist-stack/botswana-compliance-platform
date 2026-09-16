import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const e=fs.readFileSync(new URL("../cloudflare/src/agentic-entry.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["audit seq",s.includes("tenant_seq INTEGER")],
 ["audit chain state",s.includes("audit_chain_state")],
 ["audit failures",s.includes("audit_write_failures")],
 ["lineage snapshots",s.includes("control_lineage_snapshots")],
 ["lineage sequence unique",s.includes("control_lineage_snapshot_seq_unique")],
 ["correct actor column",w.includes("actor_user_id,event_type")&&!w.includes("INSERT INTO audit_events(tenant_id,user_id")],
 ["no silent audit catch",!w.includes("async function auditEvent(env,tenantId,userId,eventType,eventData={}){\\n  try{")],
 ["terminal audit failure is marked at deployed entry",e.includes("AUDIT_WRITE_FAILURE_INSERT")&&e.includes("audit_write_failures")&&e.includes("withAuditWriteFailureGuard")],
 ["successful response fails closed after audit failure",e.includes("auditFailClosedResponse")&&e.includes('x-thebe-audit-fail-closed')&&e.includes('status:500')],
 ["background audit failure rejects waitUntil",e.includes('if(state.failed)throw new Error("audit_write_failed")')&&e.includes('target.waitUntil(Promise.resolve(promise).then')],
 ["server audit hmac chain",w.includes("appendAuditEvent")&&w.includes("AUDIT_INTEGRITY_SECRET")&&w.includes("hmacHex(integritySecret")],
 ["chunked audit verify",w.includes("LIMIT 500")&&w.includes("afterSeq")],
 ["audit verify",w.includes("verifyAuditChain")],
 ["client audit post disabled",w.includes("client_authored_audit_events_disabled")],
 ["state audit",w.includes("WORKSPACE_STATE_UPDATED")],
 ["lineage capture",w.includes("captureControlLineageSnapshot")],
 ["lineage api",w.includes("control-lineage")&&w.includes("currentControlLineage")],
 ["lineage entitlement",s.includes("'control_lineage'")],
 ["audit integrity ui",h.includes('id="auditintegrity"')],
 ["lineage ui",h.includes('id="controllineage"')],
 ["browser not authoritative",h.includes("browser can no longer manufacture authoritative audit entries")],
 ["no local pseudo audit",h.includes("UI activity is not authoritative audit history")],
 ["material snapshots",w.includes("const material={control:lineage.control")],
 ["snapshot concurrency",w.includes("snapshot_seq")&&w.includes("attempt<4")],
 ["lineage keyed chain",w.includes("lineageSecret")&&w.includes("hmacHex(lineageSecret")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
