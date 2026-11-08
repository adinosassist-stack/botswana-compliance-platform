// Offline staging qualification only. This script makes NO Cloudflare API calls.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
export const STAGING_D1="adfa3871-5ecf-4672-8d2f-be9b142d5fc1";
export const STAGING_NAME="employee-self-service-isolated";
const configPath="cloudflare/wrangler.employee-self-service-staging.toml";
const workerPath="cloudflare/src/employee-self-service-staging-entry.js";
export function qualifyEmployeeStagingConfig(){
 const config=read(configPath),worker=read(workerPath);
 const line=(key,value)=>assert.match(config,new RegExp("^"+key+" = \""+value+"\"$","m"),key);
 const bool=(key,value)=>assert.match(config,new RegExp("^"+key+" = "+value+"$","m"),key);
 line("name","bw-employee-self-service-staging");
 line("main","src/employee-self-service-staging-entry.js");
 bool("workers_dev","false");
 bool("preview_urls","false");
 bool("keep_vars","false");
 line("APP_ENV","staging");
 line("DEPLOYMENT_PROFILE",STAGING_NAME);
 line("STAFF_STAGING_SOURCE_SHA","UNQUALIFIED");
 line("STAFF_STAGING_D1_ID",STAGING_D1);
 line("THEBE_STAFF_PORTAL_ENABLED","false");
 line("STAFF_STAGING_WRITES_ENABLED","false");
 line("REGISTRATION_MODE","hold");
 line("PAYMENT_PROVIDER","none");
 line("binding","DB");
 line("database_name","bw-employee-self-service-staging");
 line("database_id",STAGING_D1);
 for(const key of ["THEBE_GENERAL_AI_ENABLED","THEBE_AI_EXPORTS_ENABLED","THEBE_INTERNAL_AUTONOMY_ENABLED","THEBE_LIVE_VOICE_ENABLED","POP_UPLOAD_STAGING_ENABLED","EVIDENCE_UPLOADS_ENABLED"])line(key,"false");
 assert.equal((config.match(/^\[\[d1_databases\]\]$/gm)||[]).length,1,"exactly one dedicated D1");
 assert.doesNotMatch(config,/^\s*(?:routes?\s*=|zone_id\s*=|route\s*=|custom_domain\s*=|^\[\[routes\]\]|^\[assets\]|^\[\[queues\.[^\]]+\]\]|^\[triggers\])/m,"no public route, assets, zone, trigger or queue");
 assert.doesNotMatch(config,/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce|bw-compliance-os\b|thebedesk\.com/,"no production references");
 assert.match(worker,/employee_staging_configuration_unqualified/);
 assert.match(worker,/employee_staging_database_unqualified/);
 assert.match(worker,/employee_staging_route_disabled/);
 assert.match(worker,/THEBE_STAFF_PORTAL_ENABLED!=="false"/);
 assert.doesNotMatch(worker,/import\s+.*(?:release-governance-entry|worker\.js|employee-self-service\.js)/,"inert Worker may not delegate to production/employee handlers");
 return {worker:"bw-employee-self-service-staging",database:STAGING_D1,enabled:false,routes:0,sourceQualified:false};
}
export function employeeStagingIdentitySql(){
 // An isolated D1 operator may run this against the IDENTIFIED staging DB only.
 // Never use against production. This inserts no tenant or staff records.
 const id=STAGING_D1,name=STAGING_NAME;
 return "CREATE TABLE IF NOT EXISTS employee_self_service_staging_identity (id INTEGER PRIMARY KEY CHECK(id=1), database_id TEXT NOT NULL, environment TEXT NOT NULL);\n"+
  "INSERT INTO employee_self_service_staging_identity(id,database_id,environment) VALUES(1,'"+id+"','"+name+"') ON CONFLICT(id) DO UPDATE SET database_id=excluded.database_id,environment=excluded.environment;\n";
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fileURLToPath(process.argv[1])).href){
 try{
  const evidence=qualifyEmployeeStagingConfig();
  if(process.argv[2]==="--identity-sql")process.stdout.write(employeeStagingIdentitySql());
  else console.log(JSON.stringify({status:"PASS",qualification:"inert_offline_only",...evidence}));
 }catch(error){console.error("Employee staging qualification failed:",error.message);process.exitCode=1}
}
