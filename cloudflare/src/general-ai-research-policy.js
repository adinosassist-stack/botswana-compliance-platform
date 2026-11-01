/**
 * General-purpose Thebe AI request planner.
 * Pure classification and citation validation only. This module does not grant
 * access to business data, call providers, or activate live browsing.
 */
const CURRENT= /\b(today|latest|current|recent|this week|this month|right now|now|202[6-9]|price|exchange rate|news|weather|who is|research|sources|verify|look up|search the web)\b/i;
const BUSINESS=/\b(my (?:company|business|invoices?|reconciliation|employees?|payments?|subscriptions?|workspace|customers?)|our (?:company|accounts?|payments?|clients?)|thebe (?:workspace|account|billing))\b/i;
const HIGH_RISK=/\b(transfer money|send payment|approve payment|activate subscription|file tax|delete records|change payroll|sign contract)\b/i;
const URL_LIMIT=8;
export function planGeneralAiRequest(input,{researchEnabled=false}={}){
  if(typeof input!=="string"||!input.trim()||input.length>8000)return {ok:false,error:"invalid_question"};
  const question=input.trim();
  const businessContext=BUSINESS.test(question);
  const asksForCurrentInfo=CURRENT.test(question);
  const needsApproval=HIGH_RISK.test(question);
  return Object.freeze({
    ok:true,
    intent:businessContext?"business_context":asksForCurrentInfo?"research":"general",
    researchRequested:asksForCurrentInfo,
    researchAvailable:asksForCurrentInfo&&researchEnabled===true,
    businessAuthorizationRequired:businessContext,
    actionExecutionAllowed:false,
    approvalRequired:needsApproval,
    message:asksForCurrentInfo&&!researchEnabled?"Live research is not available. I can provide background knowledge, but cannot verify current facts or cite live search results.":null
  });
}
export function validateResearchSources(sources){
  if(!Array.isArray(sources))return [];
  const seen=new Set(),out=[];
  for(const item of sources.slice(0,32)){
    if(out.length>=URL_LIMIT)break;
    if(!item||typeof item!=="object")continue;
    let url;
    try{
      url=new URL(String(item.url||""));
      if(url.protocol!=="https:"||url.username||url.password||url.port)continue;
      if(/^(?:localhost|.*\.localhost|.*\.local)$/i.test(url.hostname))continue;
      if(/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||url.hostname.includes(":"))continue;
    }catch{continue}
    url.hash="";
    if(seen.has(url.href))continue;
    seen.add(url.href);
    out.push(Object.freeze({
      url:url.href,
      title:String(item.title||url.hostname).slice(0,180),
      publishedAt:/^\d{4}-\d\d-\d\d$/.test(String(item.publishedAt||""))?item.publishedAt:null,
      retrievedAt:/^\d{4}-\d\d-\d\dT/.test(String(item.retrievedAt||""))?item.retrievedAt:null
    }));
  }
  return out;
}
export function researchResponseMetadata({researchPerformed=false,sources=[]}={}){
  const citations=researchPerformed?validateResearchSources(sources):[];
  return Object.freeze({
    researchPerformed:researchPerformed===true,
    citations,
    verification:researchPerformed&&citations.length?"search_snippets_only":"unverified",
    // Never label unverified model text as a live web research result.
    label:researchPerformed&&citations.length?"Web search excerpts — verify original sources":"General AI response — not live verified"
  });
}
