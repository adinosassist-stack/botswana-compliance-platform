import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";

const input=process.argv[2],outArg=process.argv[3];
if(!input){console.error("Usage: node scripts/d1-recovery-drill.mjs path/to/d1-export.sql [report.json]");process.exit(2)}
const source=path.resolve(input),stat=fs.statSync(source);
if(!stat.isFile())throw new Error("D1 recovery drill source is not a file");
const run=(script,args=[])=>{const r=spawnSync(process.execPath,["--no-warnings",script,...args],{encoding:"utf8"});if(r.status!==0)throw new Error(`${script} failed: ${(r.stderr||r.stdout||"").trim().slice(0,1200)}`);const line=(r.stdout||"").trim();return JSON.parse(line)};
const shape=run("scripts/verify-d1-export.mjs",[source]);
const restore=run("scripts/verify-d1-restore.mjs",[source]);
const sha256=crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
if(shape.sha256!==sha256||restore.sha256!==sha256)throw new Error("Recovery drill checksum mismatch between verification stages");
const report={ok:true,drillVersion:"v1",performedAt:new Date().toISOString(),sourceFile:path.basename(source),bytes:stat.size,sha256,shape,restore,operatorNote:"For production disaster recovery, pair this D1 drill with an R2 evidence-object inventory/restore drill before declaring recovery readiness."};
const out=outArg==="-"?null:path.resolve(outArg||`d1-recovery-drill-${Date.now()}.json`);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({ok:true,report:out,sha256,tableCount:restore.tableCount,foreignKeyViolations:restore.foreignKeyViolations},null,2));
