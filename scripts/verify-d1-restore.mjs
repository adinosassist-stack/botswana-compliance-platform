import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {DatabaseSync} from "node:sqlite";

const file=process.argv[2],requireData=process.argv.includes("--require-data");
if(!file){console.error("Usage: node --no-warnings scripts/verify-d1-restore.mjs path/to/d1-export.sql [--require-data]");process.exit(2)}
const full=path.resolve(file),stat=fs.statSync(full);
if(!stat.isFile()||stat.size<1024)throw new Error("D1 restore input is missing or implausibly small");
if(stat.size>256*1024*1024)throw new Error("D1 local restore verification is capped at 256 MiB; use an isolated D1 import/restore drill for larger exports");
const sql=fs.readFileSync(full,"utf8"),sha256=crypto.createHash("sha256").update(sql).digest("hex");
const db=new DatabaseSync(":memory:");
const requiredTables=[
  "users","tenants","memberships","sessions","app_state","audit_events","evidence",
  "auth_rate_limits","api_idempotency","deletion_requests","deletion_tombstones","payment_orders","payment_events",
  "executive_control_replacement_governance","platform_scheduled_runs"
];
try{
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(sql);
  const integrity=db.prepare("PRAGMA integrity_check").all().map(r=>String(r.integrity_check||""));
  if(integrity.length!==1||integrity[0]!=="ok")throw new Error(`SQLite integrity_check failed: ${integrity.join("; ")}`);
  const fk=db.prepare("PRAGMA foreign_key_check").all();
  if(fk.length)throw new Error(`SQLite foreign_key_check found ${fk.length} violation(s)`);
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));
  for(const table of requiredTables)if(!tables.has(table))throw new Error(`Restored database missing critical table: ${table}`);
  if(requireData){
    const tenantCount=Number(db.prepare("SELECT count(*) c FROM tenants").get()?.c||0);
    const userCount=Number(db.prepare("SELECT count(*) c FROM users").get()?.c||0);
    if(tenantCount<1||userCount<1)throw new Error("Restored production backup contains no tenant/user data");
  }
  const tableCount=Number(db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table'").get()?.c||0);
  console.log(JSON.stringify({ok:true,file:path.basename(full),bytes:stat.size,sha256,tableCount,requiredTables:requiredTables.length,requireData,integrity:"ok",foreignKeyViolations:0},null,2));
}finally{db.close()}
