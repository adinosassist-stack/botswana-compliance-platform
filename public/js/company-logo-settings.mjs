/** Authenticated Thebe Desk company logo settings UI. No localStorage or tokens in URLs. */
import {mountCompanyQuotationLogoEditor} from "./quotation-logo-api-client.mjs";
const status=document.getElementById("company-logo-status");
const root=document.getElementById("company-logo-editor");
const say=text=>{if(status)status.textContent=text};
async function start(){
 try{
  const createClient=globalThis.BW?.api?.createClient;
  if(typeof createClient!=="function")throw Error("Secure application transport is unavailable.");
  let csrf="";
  const client=createClient({getCsrfToken:()=>csrf,retries:0});
  const data=await client.request("/api/auth/me",{method:"GET"});
  csrf=data?.csrfToken||"";
  if(!data?.user||!["owner","manager"].includes(data.user.role)||data.landingPath)
   throw Error("Only an authorized company owner or manager can change the logo.");
  if(typeof data.csrfToken!=="string"||data.csrfToken.length<12)
   throw Error("Your security session must be refreshed.");
  say("Loading the saved logo for "+String(data.user.tenantName||"your business")+"…");
  const {editor}=await mountCompanyQuotationLogoEditor(root,{
   companyId:data.user.tenantId,
   capability:{enabled:true,authenticated:true},
   fetchImpl:(url,options)=>client.requestRaw(url,options),csrfToken:csrf,
   pdfPreviewEnabled:false
  });
  say("Ready. Choose a logo, adjust its size and position, and press Save company logo.");
  addEventListener("pagehide",()=>editor.destroy(),{once:true});
 }catch(error){
  say(error?.message||"Logo settings are unavailable.");
 }
}
start();
