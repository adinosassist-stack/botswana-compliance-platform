import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {DatabaseSync} from "node:sqlite";

const sqlFile=process.argv[2],inventoryFile=process.argv[3];
if(!sqlFile||!inventoryFile){console.error("Usage: node --no-warnings scripts/verify-evidence-r2-inventory.mjs d1-export.sql r2-inventory.(txt|json)");process.exit(2)}
const sqlPath=path.resolve(sqlFile),invPath=path.resolve(inventoryFile),sqlStat=fs.statSync(sqlPath),invStat=fs.statSync(invPath);
if(!sqlStat.isFile()||!invStat.isFile())throw new Error("D1 export and R2 inventory must both be files");
if(sqlStat.size>256*1024*1024)throw new Error("R2 cross-layer verification requires a D1 export <=256 MiB for isolated local restore");
const parseInventory=(raw)=>{
  const text=raw.trim();if(!text)return new Set();
  if(text.startsWith("[")||text.startsWith("{")){
    const data=JSON.parse(text),values=Array.isArray(data)?data:(data.keys||data.objects||data.items||[]);
    return new Set(values.map(v=>String(typeof v==="string"?v:(v?.key??v?.name??"")).trim()).filter(Boolean));
  }
  return new Set(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")));
};
const sql=fs.readFileSync(sqlPath,"utf8"),inventory=parseInventory(fs.readFileSync(invPath,"utf8"));
const db=new DatabaseSync(":memory:");
try{
  db.exec("PRAGMA foreign_keys=ON;");db.exec(sql);
  const cols=new Set(db.prepare("PRAGMA table_info(evidence)").all().map(r=>String(r.name)));
  if(!cols.has("object_key"))throw new Error("Restored D1 export has no evidence.object_key column");
  const hasClean=cols.has("clean_object_key"),hasStorageDeleted=cols.has("storage_deleted_at");
  const where=hasStorageDeleted?"WHERE storage_deleted_at IS NULL":"";
  const select=hasClean?`SELECT object_key,clean_object_key FROM evidence ${where}`:`SELECT object_key,NULL clean_object_key FROM evidence ${where}`;
  const rows=db.prepare(select).all(),expected=new Set();
  for(const row of rows)for(const key of [row.object_key,row.clean_object_key])if(String(key||"").trim())expected.add(String(key).trim());
  const missing=[...expected].filter(k=>!inventory.has(k)).sort(),extraCount=[...inventory].filter(k=>!expected.has(k)).length;
  const d1Sha256=crypto.createHash("sha256").update(sql).digest("hex"),inventorySha256=crypto.createHash("sha256").update(fs.readFileSync(invPath)).digest("hex");
  if(missing.length)throw new Error(`R2 inventory is missing ${missing.length} evidence object(s): ${missing.slice(0,10).join(", ")}${missing.length>10?" …":""}`);
  console.log(JSON.stringify({ok:true,d1File:path.basename(sqlPath),inventoryFile:path.basename(invPath),d1Sha256,inventorySha256,evidenceRows:rows.length,expectedObjectKeys:expected.size,inventoryKeys:inventory.size,extraInventoryKeys:extraCount,missingObjectKeys:0},null,2));
}finally{db.close()}
