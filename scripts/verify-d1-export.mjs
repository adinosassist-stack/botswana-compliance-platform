import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {StringDecoder} from "node:string_decoder";

const file=process.argv[2],requireData=process.argv.includes("--require-data");
if(!file){console.error("Usage: node scripts/verify-d1-export.mjs path/to/d1-export.sql [--require-data]");process.exit(2)}
const full=path.resolve(file),stat=fs.statSync(full);
if(!stat.isFile()||stat.size<1024)throw new Error("D1 export is missing or implausibly small");
if(stat.size>5*1024*1024*1024)throw new Error("D1 export exceeds the supported streaming verification size of 5 GiB");
const requiredTables=[
  "users","tenants","sessions","memberships","app_state","audit_events","evidence",
  "auth_rate_limits","api_idempotency","executive_control_replacement_governance","deletion_requests","deletion_tombstones","platform_scheduled_runs"
];
const found=new Set(),hash=crypto.createHash("sha256"),decoder=new StringDecoder("utf8");
let tail="",hasIndex=false,hasInsert=false,hasPlaceholder=false;
const tablePatterns=new Map(requiredTables.map(table=>[table,new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+[\\"\\\`]?(?:main\\.)?[\\"\\\`]?${table}[\\"\\\`]?`,"i")]));
for await(const chunk of fs.createReadStream(full,{highWaterMark:1024*1024})){
  hash.update(chunk);
  const text=tail+decoder.write(chunk);
  for(const [table,re] of tablePatterns)if(!found.has(table)&&re.test(text))found.add(table);
  if(!hasIndex&&/CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(text))hasIndex=true;
  if(!hasInsert&&/INSERT\s+(?:OR\s+\w+\s+)?INTO/i.test(text))hasInsert=true;
  if(!hasPlaceholder&&/REPLACE_WITH_D1_DATABASE_ID|changeme|placeholder_secret/i.test(text))hasPlaceholder=true;
  tail=text.slice(-2048);
}
const finalText=tail+decoder.end();
for(const [table,re] of tablePatterns)if(!found.has(table)&&re.test(finalText))found.add(table);
for(const table of requiredTables)if(!found.has(table))throw new Error(`D1 export missing required table schema: ${table}`);
if(!hasIndex)throw new Error("D1 export contains no indexes");
if(requireData&&!hasInsert)throw new Error("D1 export contains no data rows; use a full export for a production backup");
if(hasPlaceholder)throw new Error("D1 export unexpectedly contains deployment placeholders");
console.log(JSON.stringify({ok:true,file:path.basename(full),bytes:stat.size,requiredTables:requiredTables.length,requireData,sha256:hash.digest("hex"),streaming:true},null,2));
