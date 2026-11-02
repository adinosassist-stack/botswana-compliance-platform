/** Read-only D1 General AI staging auth verification. */
export const STAGING_AUTH_DATABASE_ID="ff229eef-7724-49ae-9d68-d3a1db669b63";
const required={users:["id","email","session_generation"],memberships:["user_id","tenant_id","role","status"],sessions:["token_hash","user_id","tenant_id","csrf_token","session_generation","expires_at"]};
export async function verifyGeneralAiStagingAuth({accountId,token,fetchFn=fetch,databaseId=STAGING_AUTH_DATABASE_ID}={}){
 if(!/^[a-f0-9]{32}$/i.test(accountId||"")||!token)throw Error("read_only_cloudflare_credentials_required");
 if(databaseId!==STAGING_AUTH_DATABASE_ID)throw Error("dedicated_staging_database_required");
 const endpoint=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
 async function query(sql){
  if(!/^\s*(SELECT|PRAGMA table_info\(|PRAGMA foreign_key_list\()/i.test(sql))throw Error("read_only_sql_required");
  const response=await fetchFn(endpoint,{method:"POST",redirect:"error",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({sql}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error("cloudflare_read_failed:"+response.status);
  const payload=await response.json();
  if(!payload.success||!payload.result?.[0]?.success)throw Error("d1_inspection_failed");
  return payload.result[0].results||[];
 }
 const names=(await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','memberships','sessions')")).map(row=>row.name);
 for(const name of Object.keys(required))if(!names.includes(name))throw Error("missing_staging_table:"+name);
 for(const [name,columns] of Object.entries(required)){
  const actual=(await query(`PRAGMA table_info(${name})`)).map(row=>row.name);
  for(const col of columns)if(!actual.includes(col))throw Error("missing_staging_column:"+name+"."+col);
 }
 const fks=await query("PRAGMA foreign_key_list(sessions)");
 if(!fks.some(x=>x.table==="memberships"&&x.from==="user_id")||!fks.some(x=>x.table==="memberships"&&x.from==="tenant_id"))throw Error("missing_tenant_membership_fk");
 const counts={};for(const name of Object.keys(required))counts[name]=Number((await query(`SELECT COUNT(*) AS n FROM ${name}`))[0]?.n??-1);
 return {database:"bw-general-ai-auth-staging",tables:Object.keys(required),counts,tenantBoundaryVerified:true,readOnly:true};
}
if(import.meta.url===`file://${process.argv[1]}`)verifyGeneralAiStagingAuth({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
