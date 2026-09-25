import {
  prepareWhatsAppPurposeForPrincipal,
  prepareWhatsAppReadForPrincipal,
  prepareWhatsAppReconciliationForPrincipal
} from "./agentic-whatsapp-core.js";

const MAX_INBOUND_MESSAGES=100;
const clean=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

export function normalizeWhatsAppInboundNumber(value){
  let number=clean(value,32).replace(/[\s().-]/g,"");
  if(/^7\d{7}$/.test(number))number=`+267${number}`;
  else if(/^2677\d{7}$/.test(number))number=`+${number}`;
  return /^\+2677\d{7}$/.test(number)?number:null;
}

function normalizedCommand(value){
  let command=clean(value,500).toLowerCase().replace(/[^a-z0-9.+,'"-]+/g," ").replace(/\s+/g," ").trim();
  return command.replace(/^(?:hey\s+)?thebe\s+/,"");
}

export function classifyWhatsAppInboundCommand(value){
  const command=normalizedCommand(value).replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const groups=[
    ["owner_daily_brief",new Set(["brief","daily brief","owner brief","business brief","business status","status","overview"])],
    ["finance_exception",new Set(["finance","finance brief","reconciliation"])],
    ["compliance_followup",new Set(["compliance","compliance follow up","deadline","deadlines","burs","cipa","licence","license"])],
    ["operations_update",new Set(["operations","operations update","workflow","workflows","daily operations"])]
  ];
  for(const [purpose,commands] of groups)if(commands.has(command))return purpose;
  return null;
}

export function classifyWhatsAppInboundIntent(value){
  const command=normalizedCommand(value);
  if(/\b(cash position|cash balance|how much (?:cash|money) (?:do we|we) have|what(?:'s| is) our cash)\b/.test(command))return {kind:"read",readKey:"cash_position"};
  if(/\b(how much (?:did we )?(?:collect|collected|receive|received) today|collections? today|money in today|positive inflows? today|inflows? today)\b/.test(command))return {kind:"read",readKey:"finance_inflows_today"};
  if(/\b(finance data quality|finance quality|ledger quality|is (?:our )?finance data (?:clean|current|up to date))\b/.test(command))return {kind:"read",readKey:"finance_data_quality"};
  const customerBalanceMatch=
    command.match(/^(?:how much does|what does)\s+(.+?)\s+owe(?:\s+us)?$/)||
    command.match(/^(?:customer\s+)?balance\s+(?:for|of)\s+(.+)$/)||
    command.match(/^does\s+(.+?)\s+owe\s+us$/);
  if(customerBalanceMatch){
    const customerQuery=clean(customerBalanceMatch[1],160).replace(/^["']|["']$/g,"").trim();
    if(customerQuery.length>=2)return {kind:"read",readKey:"receivable_customer",params:{customerQuery}};
  }
  if(/\b(which customers? (?:still )?owe|who (?:still )?owes|customer balances?|receivables?|outstanding invoices?|overdue invoices?)\b/.test(command))return {kind:"read",readKey:"receivables"};
  if(/\b(reconcile|reconciliation)\b/.test(command))return {kind:"reconcile",command};
  const purpose=classifyWhatsAppInboundCommand(value);
  return purpose?{kind:"prepare",purpose}:null;
}

function botswanaDate(now=new Date(),offsetDays=0){
  const shifted=new Date(now.getTime()+2*60*60*1000+offsetDays*86400000);
  return shifted.toISOString().slice(0,10);
}
function moneyMinor(value){
  const raw=String(value??"").replace(/,/g,"");
  if(!/^-?\d+(?:\.\d{1,2})?$/.test(raw))return null;
  const amount=Number(raw);
  if(!Number.isFinite(amount))return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)?minor:null;
}

export function parseWhatsAppReconciliationRequest(value,{now=new Date()}={}){
  const command=normalizedCommand(value);
  let statementFrom=null,statementTo=null;
  const range=command.match(/\bfrom\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\b/);
  const single=command.match(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/);
  if(range){statementFrom=range[1];statementTo=range[2]}
  else if(single){statementFrom=single[1];statementTo=single[1]}
  else if(/\byesterday\b/.test(command)){statementFrom=botswanaDate(now,-1);statementTo=statementFrom}
  else if(/\btoday\b/.test(command)){statementFrom=botswanaDate(now,0);statementTo=statementFrom}

  const opening=command.match(/\bopening(?:\s+balance)?\s*(?:[:=]\s*)?(?:p|bwp)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)/);
  const closing=command.match(/\bclosing(?:\s+balance)?\s*(?:[:=]\s*)?(?:p|bwp)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)/);
  const accountMatch=command.match(/\baccount(?:\s+id)?\s+["']?(.+?)["']?(?=\s+(?:from|on|today|yesterday|opening|closing)\b|$)/);
  return {
    accountRef:accountMatch?clean(accountMatch[1],120):null,
    statementFrom,
    statementTo,
    openingBalanceMinor:opening?moneyMinor(opening[1]):null,
    closingBalanceMinor:closing?moneyMinor(closing[1]):null
  };
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

async function resolveFinanceAccount(env,tenantId,accountRef){
  const rows=await env.DB.prepare("SELECT id,name FROM finance_accounts WHERE tenant_id=? AND status='active' ORDER BY name LIMIT 50").bind(tenantId).all();
  const items=rows.results||[];
  if(accountRef){
    const ref=String(accountRef).trim().toLowerCase();
    const matches=items.filter(item=>String(item.id||"").toLowerCase()===ref||String(item.name||"").trim().toLowerCase()===ref);
    return matches.length===1?{state:"resolved",account:matches[0]}:{state:matches.length?"ambiguous":"not_found",count:items.length};
  }
  return items.length===1?{state:"resolved",account:items[0]}:{state:items.length?"ambiguous":"not_found",count:items.length};
}

function receivedAt(timestamp){
  const seconds=Number(timestamp);
  return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():new Date().toISOString();
}

function reconciliationGuidance(parsed,accountState){
  const missing=[];
  if(!parsed.statementFrom||!parsed.statementTo)missing.push("date (today, yesterday, or YYYY-MM-DD)");
  if(parsed.openingBalanceMinor===null)missing.push("opening balance");
  if(parsed.closingBalanceMinor===null)missing.push("closing balance");
  if(accountState!=="resolved")missing.push("an unambiguous finance account");
  return [
    "Thebe can prepare this reconciliation, but it will not guess missing statement inputs.",
    missing.length?`Still needed: ${missing.join(", ")}.`:"The request is ready.",
    'Example: "Thebe reconcile yesterday opening P1000 closing P1250" (works automatically when only one active finance account exists).',
    'If you have multiple accounts, add the exact account name: "Thebe reconcile account Main Bank yesterday opening P1000 closing P1250".'
  ].join("\n");
}

async function queueInboundReply(deliverReply,{sender,principal,providerMessageId,messagePreview,kind}){
  if(typeof deliverReply!=="function")return {queued:false,reason:"delivery_callback_absent"};
  return await deliverReply({
    tenantId:principal.tenant_id,userId:principal.user_id,to:sender,
    replyToMessageId:providerMessageId,text:clean(messagePreview,3900),kind
  });
}

export async function processWhatsAppInboundMessages(env,items,{deliverReply=null,answerQuestion=null}={}){
  const selected=(Array.isArray(items)?items:[]).slice(0,MAX_INBOUND_MESSAGES);
  const summary={received:selected.length,prepared:0,answered:0,questionsAnswered:0,reconciliationPrepared:0,guidance:0,replayed:0,replyQueued:0,replyFailed:0,unlinked:0,ambiguous:0,unsupported:0,unrecognized:0,wrongNumber:0,blocked:0};
  const principalCache=new Map();
  for(const item of selected){
    const message=item?.message||{},phoneNumberId=clean(item?.phoneNumberId,40),configuredPhoneNumberId=clean(env.WHATSAPP_PHONE_NUMBER_ID,40);
    if(!configuredPhoneNumberId||!phoneNumberId||phoneNumberId!==configuredPhoneNumberId){summary.wrongNumber++;continue}
    const providerMessageId=clean(message?.id,200),sender=normalizeWhatsAppInboundNumber(message?.from);
    if(!providerMessageId||!sender||String(message?.type||"")!=="text"||typeof message?.text?.body!=="string"){summary.unsupported++;continue}
    let binding=principalCache.get(sender);
    if(!binding){binding=await linkedPrincipal(env,sender);principalCache.set(sender,binding)}
    if(binding.state==="unlinked"){summary.unlinked++;continue}
    if(binding.state==="ambiguous"){summary.ambiguous++;continue}
    const intent=classifyWhatsAppInboundIntent(message.text.body);
    const context={providerMessageId,receivedAt:receivedAt(message?.timestamp)};
    if(!intent){
      if(typeof answerQuestion!=="function"){summary.unrecognized++;continue}
      let answered;
      try{
        answered=await answerQuestion({
          principal:binding.principal,
          question:clean(message.text.body,1000),
          providerMessageId,
          receivedAt:context.receivedAt,
          sender
        });
      }catch{
        summary.blocked++;
        continue;
      }
      if(answered?.deduplicated===true){summary.replayed++;continue}
      if(answered?.ok!==true||!clean(answered?.answer,3900)){summary.blocked++;continue}
      summary.answered++;
      summary.questionsAnswered++;
      try{
        const queued=await queueInboundReply(deliverReply,{
          sender,principal:binding.principal,providerMessageId,
          messagePreview:answered.answer,kind:"super_agent_answer"
        });
        if(queued?.ok===true||queued?.deduplicated===true)summary.replyQueued++;else if(deliverReply)summary.replyFailed++;
      }catch{summary.replyFailed++}
      continue;
    }

    if(intent.kind==="prepare"){
      const result=await prepareWhatsAppPurposeForPrincipal({
        env,auth:binding.principal,purpose:intent.purpose,
        idempotencyKey:`whatsapp_inbound_${providerMessageId}`,
        source:"whatsapp_inbound",sourceContext:context
      });
      if(result.status>=500)throw new Error("whatsapp_inbound_prepare_failed");
      if(result.body?.ok!==true){summary.blocked++;continue}
      summary.prepared++;if(result.body.replayed===true)summary.replayed++;
      if(result.body?.delivery?.replyToInbound===true&&result.body?.delivery?.recipientLocked===true){
        try{
          const queued=await queueInboundReply(deliverReply,{
            sender,principal:binding.principal,providerMessageId,
            messagePreview:result.body.messagePreview,kind:"prepared_brief"
          });
          if(queued?.ok===true||queued?.deduplicated===true)summary.replyQueued++;else if(deliverReply)summary.replyFailed++;
        }catch{summary.replyFailed++}
      }else{
        summary.blocked++;
      }
      continue;
    }

    if(intent.kind==="read"){
      const result=await prepareWhatsAppReadForPrincipal({
        env,auth:binding.principal,readKey:intent.readKey,readParams:intent.params||null,
        idempotencyKey:`whatsapp_inbound_${providerMessageId}`,
        source:"whatsapp_inbound",sourceContext:context
      });
      if(result.status>=500)throw new Error("whatsapp_inbound_read_failed");
      if(result.body?.ok!==true){summary.blocked++;continue}
      summary.answered++;if(result.body.replayed===true)summary.replayed++;
      try{
        const queued=await queueInboundReply(deliverReply,{sender,principal:binding.principal,providerMessageId,messagePreview:result.body.messagePreview,kind:"finance_read"});
        if(queued?.ok===true||queued?.deduplicated===true)summary.replyQueued++;else if(deliverReply)summary.replyFailed++;
      }catch{summary.replyFailed++}
      continue;
    }

    if(intent.kind==="reconcile"){
      const parsed=parseWhatsAppReconciliationRequest(message.text.body),account=await resolveFinanceAccount(env,binding.principal.tenant_id,parsed.accountRef);
      if(!parsed.statementFrom||!parsed.statementTo||parsed.openingBalanceMinor===null||parsed.closingBalanceMinor===null||account.state!=="resolved"){
        summary.guidance++;
        try{
          const queued=await queueInboundReply(deliverReply,{sender,principal:binding.principal,providerMessageId,messagePreview:reconciliationGuidance(parsed,account.state),kind:"reconciliation_guidance"});
          if(queued?.ok===true||queued?.deduplicated===true)summary.replyQueued++;else if(deliverReply)summary.replyFailed++;
        }catch{summary.replyFailed++}
        continue;
      }
      const result=await prepareWhatsAppReconciliationForPrincipal({
        env,auth:binding.principal,
        payload:{accountId:String(account.account.id),statementFrom:parsed.statementFrom,statementTo:parsed.statementTo,openingBalanceMinor:parsed.openingBalanceMinor,closingBalanceMinor:parsed.closingBalanceMinor},
        idempotencyKey:`whatsapp_inbound_${providerMessageId}`,
        sourceContext:context
      });
      if(result.status>=500)throw new Error("whatsapp_inbound_reconciliation_failed");
      if(result.body?.ok!==true){summary.blocked++;continue}
      summary.reconciliationPrepared++;if(result.body.replayed===true)summary.replayed++;
      try{
        const queued=await queueInboundReply(deliverReply,{sender,principal:binding.principal,providerMessageId,messagePreview:result.body.messagePreview,kind:"reconciliation_prepare"});
        if(queued?.ok===true||queued?.deduplicated===true)summary.replyQueued++;else if(deliverReply)summary.replyFailed++;
      }catch{summary.replyFailed++}
      continue;
    }

    summary.unrecognized++;
  }
  return summary;
}

export const __whatsappInboundTest=Object.freeze({linkedPrincipal,resolveFinanceAccount,receivedAt,botswanaDate,moneyMinor,MAX_INBOUND_MESSAGES});
