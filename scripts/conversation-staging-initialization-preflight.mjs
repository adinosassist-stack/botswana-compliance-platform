// Read-only eligibility check for an empty isolated conversation staging database.
// Never authorizes DDL, enables a feature, or accepts customer records.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
const ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d";
const DATABASE="95c48030-0395-44cb-aa95-622beaf4efdf";
export async function checkConversationInitialization({accountId,databaseId,token,sourceSha,fetcher=fetch}={}){
 if(accountId!==ACCOUNT||databaseId!==DATABASE||typeof token!=="string"||!token.trim()||!(/^[a-f0-9]{40}$/).test(sourceSha||""))throw Error("invalid_staging_target");
 const sql=readFileSync(new URL("../docs/rehearsals/conversation-storage-schema.sql",import.meta.url));
 const schemaSha256=createHash("sha256").update(sql).digest("hex");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/d1/database/"+DATABASE+"/query";
 const res=await fetcher(endpoint,{method:"POST",redirect:"error",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({sql:"SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"})});
 if(!res.ok)throw Error("staging_catalog_unavailable");
 const payload=await res.json();
 const results=payload?.result;
 if(payload?.success!==true||!Array.isArray(results)||results.length!==1||results[0]?.success!==true||!Array.isArray(results[0].results))throw Error("invalid_catalog_response");
 const objects=results[0].results;
 if(objects.some(x=>typeof x?.name!=="string"||typeof x?.type!=="string"))throw Error("invalid_catalog_entry");
 const unexpected=objects.filter(x=>x.name!=="_cf_KV"||x.type!=="table");
 return {accountId:ACCOUNT,databaseId:DATABASE,sourceSha,schemaSha256,readOnly:true,emptyCandidate:unexpected.length===0,unexpectedObjects:unexpected.map(x=>({name:x.name,type:x.type})),migrationAuthorized:false,activationAuthorized:false,remaining:["independent schema approval","privacy and retention approval","rollback evidence","isolated authentication schema and synthetic fixtures","protected staging migration authorization"]};
}
