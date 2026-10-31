// Read-only Cloudflare D1 staging inventory: never deploys, migrates, creates, or writes.
import {conversationStagingConfig} from "./render-conversation-staging-config.mjs";
export async function checkConversationStagingD1(env=process.env,fetcher=fetch){
 const config=conversationStagingConfig(env);
 const token=String(env.CLOUDFLARE_API_TOKEN||"");
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||"");
 if(!token||!/^[a-f0-9]{32}$/i.test(account))throw Error("cloudflare_credentials_required");
 const id=config.d1_databases[0].database_id;
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+id;
 const response=await fetcher(endpoint,{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
 if(!response.ok)throw Error("staging_d1_read_failed_"+response.status);
 const payload=await response.json();
 if(payload?.success!==true||payload?.result?.uuid?.toLowerCase()!==id||
    payload?.result?.name!=="bw-conversation-staging")throw Error("staging_d1_identity_mismatch");
 return Object.freeze({ok:true,databaseName:payload.result.name,databaseId:id,isolated:true,apiReadOnly:true,workerActivated:false});
}
if(import.meta.url==="file://"+process.argv[1]){
 checkConversationStagingD1().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
