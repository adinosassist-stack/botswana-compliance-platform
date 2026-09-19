import {prepareWhatsAppPurposeForPrincipal} from "./agentic-whatsapp-core.js";

const MAX_INBOUND_MESSAGES=100;
const clean=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

export function normalizeWhatsAppInboundNumber(value){
  let number=clean(value,32).replace(/[\s().-]/g,"");
  if(/^7\d{7}$/.test(number))number=`+267${number}`;
  else if(/^2677\d{7}$/.test(number))number=`+${number}`;
  return /^\+2677\d{7}$/.test(number)?number:null;
}

export function classifyWhatsAppInboundCommand(value){
  let command=clean(value,160).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  command=command.replace(/^(?:hey\s+)?thebe\s+/,"");
  const groups=[
    ["owner_daily_brief",new Set(["brief","daily brief","owner brief","business brief","business status","status","overview"])],
    ["finance_exception",new Set(["finance","finance brief","reconciliation","reconcile","cash position"])],
    ["compliance_followup",new Set(["compliance","compliance follow up","deadline","deadlines","burs","cipa","licence","license"])],
    ["operations_update",new Set(["operations","operations update","workflow","workflows","daily operations"])]
  ];
  for(const [purpose,commands] of groups)if(commands.has(command))return purpose;
  return null;
}

async function linkedPrincipal(env,phoneE164){
  const rows=await env.DB.prepare(`SELECT c.tenant_id,c.user_id,m.role
    FROM whatsapp_consents c
    JOIN memberships m ON m.tenant_id=c.tenant_id AND m.user_id=c.user_id AND m.status='active'
    JOIN notification_preferences p ON p.user_id=c.user_id AND p.whatsapp_enabled=1
    WHERE c.phone_e164=? AND c.status='active' AND m.role IN ('owner','manager')
    ORDER BY c.tenant_id,c.user_id LIMIT 3`).bind(phoneE164).all();
  const matches=rows.results||[];
  if(matches.length===0)return {state:"unlinked"};
  if(matches.length!==1)return {state:"ambiguous"};
  return {state:"linked",principal:{tenant_id:String(matches[0].tenant_id),user_id:String(matches[0].user_id),role:String(matches[0].role).toLowerCase()}};
}

function receivedAt(timestamp){
  const seconds=Number(timestamp);
  return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():new Date().toISOString();
}

export async function processWhatsAppInboundMessages(env,items){
  const selected=(Array.isArray(items)?items:[]).slice(0,MAX_INBOUND_MESSAGES);
  const summary={received:selected.length,prepared:0,replayed:0,unlinked:0,ambiguous:0,unsupported:0,unrecognized:0,wrongNumber:0,blocked:0};
  const principalCache=new Map();
  for(const item of selected){
    const message=item?.message||{},phoneNumberId=clean(item?.phoneNumberId,40);
    if(phoneNumberId&&String(env.WHATSAPP_PHONE_NUMBER_ID||"")&&phoneNumberId!==String(env.WHATSAPP_PHONE_NUMBER_ID)){summary.wrongNumber++;continue}
    const providerMessageId=clean(message?.id,200),sender=normalizeWhatsAppInboundNumber(message?.from);
    if(!providerMessageId||!sender||String(message?.type||"")!=="text"||typeof message?.text?.body!=="string"){summary.unsupported++;continue}
    let binding=principalCache.get(sender);
    if(!binding){binding=await linkedPrincipal(env,sender);principalCache.set(sender,binding)}
    if(binding.state==="unlinked"){summary.unlinked++;continue}
    if(binding.state==="ambiguous"){summary.ambiguous++;continue}
    const purpose=classifyWhatsAppInboundCommand(message.text.body);
    if(!purpose){summary.unrecognized++;continue}
    const result=await prepareWhatsAppPurposeForPrincipal({
      env,
      auth:binding.principal,
      purpose,
      idempotencyKey:`whatsapp_inbound_${providerMessageId}`,
      source:"whatsapp_inbound",
      sourceContext:{providerMessageId,receivedAt:receivedAt(message?.timestamp)}
    });
    if(result.status>=500)throw new Error("whatsapp_inbound_prepare_failed");
    if(result.body?.ok===true){
      summary.prepared++;
      if(result.body.replayed===true)summary.replayed++;
      continue;
    }
    summary.blocked++;
  }
  return summary;
}

export const __whatsappInboundTest=Object.freeze({linkedPrincipal,receivedAt,MAX_INBOUND_MESSAGES});
