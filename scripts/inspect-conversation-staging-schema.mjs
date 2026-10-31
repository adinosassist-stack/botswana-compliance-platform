// Read-only staging schema check. All SQL statements are constant SELECTs.
// This is not permission to migrate, provision identities or activate a Worker.
export async function inspectConversationStagingSchema({accountId,token,databaseId,fetcher=fetch}={}){
 const expected="95c48030-0395-44cb-aa95-622beaf4efdf";
 if(databaseId!==expected||!/^[a-f0-9]{32}$/i.test(String(accountId||""))||!token)
   throw Error("isolated_staging_credentials_required");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+accountId+"/d1/database/"+expected+"/query";
 const response=await fetcher(endpoint,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({sql:"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"})});
 if(!response.ok)throw Error("staging_schema_read_failed_"+response.status);
 const payload=await response.json();
 if(payload?.success!==true||payload?.result?.[0]?.success!==true)throw Error("staging_schema_inspection_failed");
 const tables=new Set((payload.result[0].results||[]).map(row=>row.name));
 const required=["thebe_conversation_staging_identity","thebe_conversations_rehearsal","thebe_conversation_members_rehearsal","thebe_conversation_messages_rehearsal","sessions","users","memberships","tenants"];
 const missing=required.filter(name=>!tables.has(name));
 return {databaseId:expected,readOnly:true,schemaReady:missing.length===0,missingTables:missing};
}
