const STATUSES=new Set(["pending","verified","failed","not_started","partially_verified","partially_failed"]);
export function senderDomainStatus(sender,listing){
  const address=String(sender||"").trim().match(/<([^<>]+)>$/)?.[1]||String(sender||"").trim();
  const domain=address.split("@").at(-1)?.toLowerCase();
  if(!domain||!address.includes("@"))return "sender_invalid";
  const items=Array.isArray(listing?.data)?listing.data:[];
  const match=items.find(item=>String(item?.name||"").toLowerCase()===domain);
  if(!match)return listing?.has_more===true?"not_visible_in_page":"not_listed";
  return STATUSES.has(match.status)?match.status:"status_unknown";
}
export async function readSenderDomainStatus({cfHeaders,resendHeaders,accountId}){
  try{
    const config=await fetch("https://api.cloudflare.com/client/v4/accounts/"+accountId+"/workers/scripts/bw-compliance-os/settings",{headers:cfHeaders,signal:AbortSignal.timeout(5000)});
    if(!config.ok)return "settings_http_"+config.status;
    const bindings=(await config.json())?.result?.bindings;
    const sender=Array.isArray(bindings)?bindings.find(item=>item.name==="EMAIL_FROM")?.text:"";
    const response=await fetch("https://api.resend.com/domains?limit=100",{headers:resendHeaders,signal:AbortSignal.timeout(5000)});
    if(!response.ok)return "domains_http_"+response.status;
    return senderDomainStatus(sender,await response.json());
  }catch{return "diagnostic_unavailable"}
}
