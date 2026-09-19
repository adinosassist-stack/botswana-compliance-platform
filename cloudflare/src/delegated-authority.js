// Thebe Desk delegated authority engine.
// Stage 1.5 is intentionally shadow-only: this module can determine whether a
// future bounded action would be permitted, but it cannot execute side effects.

export const DELEGATED_AUTHORITY_VERSION = "2026-09-20.stage1_5-shadow-v2";

export const AUTONOMY_LEVELS = Object.freeze({
  OBSERVE: 0,
  RECOMMEND: 1,
  PREPARE: 2,
  BOUNDED_EXECUTE: 3,
  HUMAN_ONLY: 4
});

export const NEVER_AUTONOMOUS_ACTIONS = Object.freeze([
  "payment.execute",
  "government_filing.submit",
  "document.sign",
  "employment.terminate",
  "financing.accept",
  "journal_entry.post"
]);

const NEVER_AUTONOMOUS_SET = new Set(NEVER_AUTONOMOUS_ACTIONS);
const asBool=value=>value===true||value===1||value==="1";
const asInt=(value,fallback=0)=>Number.isInteger(Number(value))?Number(value):fallback;
const iso=value=>value?new Date(value):null;

export function requiredAutonomyLevel(actionDefinition){
  const level=Number(actionDefinition?.level||0);
  if(level>=4)return AUTONOMY_LEVELS.HUMAN_ONLY;
  if(level===3)return AUTONOMY_LEVELS.BOUNDED_EXECUTE;
  if(level===2)return AUTONOMY_LEVELS.PREPARE;
  if(level===1)return AUTONOMY_LEVELS.OBSERVE;
  return AUTONOMY_LEVELS.RECOMMEND;
}

export function isNeverAutonomousAction(actionKey){
  return NEVER_AUTONOMOUS_SET.has(String(actionKey||""));
}

export function normalizeDelegation(row){
  if(!row)return null;
  return Object.freeze({
    id:String(row.id||""),
    tenantId:String(row.tenant_id||row.tenantId||""),
    agentKey:String(row.agent_key||row.agentKey||""),
    actionKey:String(row.action_key||row.actionKey||""),
    status:String(row.status||"inactive"),
    maxAutonomyLevel:asInt(row.max_autonomy_level??row.maxAutonomyLevel,0),
    externalSideEffects:asBool(row.external_side_effects??row.externalSideEffects),
    strongAuthRequired:asBool(row.strong_auth_required??row.strongAuthRequired),
    humanConfirmationRequired:asBool(row.human_confirmation_required??row.humanConfirmationRequired),
    maxDailyActions:row.max_daily_actions==null&&row.maxDailyActions==null?null:Math.max(0,asInt(row.max_daily_actions??row.maxDailyActions,0)),
    maxAmountMinor:row.max_amount_minor==null&&row.maxAmountMinor==null?null:Math.max(0,asInt(row.max_amount_minor??row.maxAmountMinor,0)),
    shadowOnly:row.shadow_only==null&&row.shadowOnly==null?true:asBool(row.shadow_only??row.shadowOnly),
    validFrom:row.valid_from||row.validFrom||null,
    expiresAt:row.expires_at||row.expiresAt||null
  });
}

function result({allowed=false,decision="deny",code,reason,requiredLevel,delegation=null,executionAllowed=false,humanReviewRequired=false}){
  return Object.freeze({
    allowed:Boolean(allowed),
    decision,
    code,
    reason,
    requiredAutonomyLevel:requiredLevel,
    policyVersion:DELEGATED_AUTHORITY_VERSION,
    delegationId:delegation?.id||null,
    executionAllowed:Boolean(executionAllowed),
    humanReviewRequired:Boolean(humanReviewRequired),
    shadowOnly:delegation?.shadowOnly??true
  });
}

export function evaluateDelegatedAuthority({
  agentKey,
  actionKey,
  actionDefinition,
  tenantId=null,
  delegation,
  mode="shadow",
  globalExecutionEnabled=false,
  amountMinor=0,
  dailyActionCount=0,
  strongAuth="none",
  approvalState="none",
  now=new Date()
}={}){
  const key=String(actionKey||actionDefinition?.key||"");
  const requestedAgent=String(agentKey||"");
  const authenticatedTenant=String(tenantId||"").trim();
  const requiredLevel=requiredAutonomyLevel(actionDefinition);
  const grant=normalizeDelegation(delegation);

  if(!actionDefinition)return result({code:"unknown_action",reason:"Unknown action; delegated authority fails closed.",requiredLevel});
  if(isNeverAutonomousAction(key)||requiredLevel===AUTONOMY_LEVELS.HUMAN_ONLY){
    return result({decision:"human_only",code:"human_only_action",reason:"This action is permanently outside autonomous authority and always requires a human decision.",requiredLevel,delegation:grant,humanReviewRequired:true});
  }

  if(requiredLevel<=AUTONOMY_LEVELS.PREPARE){
    return result({allowed:true,decision:mode==="shadow"?"shadow_allow":"policy_allow",code:"delegation_not_required",reason:"This action does not require bounded execution authority.",requiredLevel,delegation:grant,executionAllowed:false,humanReviewRequired:Boolean(actionDefinition?.humanReviewRequired)});
  }

  if(!grant)return result({code:"delegation_required",reason:"Bounded execution requires an explicit tenant delegation.",requiredLevel});
  if(authenticatedTenant&&(!grant.tenantId||grant.tenantId!==authenticatedTenant)){
    return result({code:"delegation_tenant_mismatch",reason:"The delegation is not bound to the authenticated tenant.",requiredLevel,delegation:grant});
  }
  if(grant.status!=="active")return result({code:"delegation_inactive",reason:"The delegation is not active.",requiredLevel,delegation:grant});
  if(requestedAgent&&grant.agentKey&&grant.agentKey!==requestedAgent)return result({code:"delegation_agent_mismatch",reason:"The delegation does not cover this agent.",requiredLevel,delegation:grant});
  if(grant.actionKey&&grant.actionKey!==key)return result({code:"delegation_action_mismatch",reason:"The delegation does not cover this action.",requiredLevel,delegation:grant});
  if(grant.maxAutonomyLevel<requiredLevel)return result({code:"delegation_level_insufficient",reason:"The delegation autonomy ceiling is below the action requirement.",requiredLevel,delegation:grant});

  const clock=now instanceof Date?now:new Date(now);
  const validFrom=iso(grant.validFrom),expiresAt=iso(grant.expiresAt);
  if(validFrom&&Number.isFinite(validFrom.getTime())&&clock<validFrom)return result({code:"delegation_not_started",reason:"The delegation is not valid yet.",requiredLevel,delegation:grant});
  if(expiresAt&&Number.isFinite(expiresAt.getTime())&&clock>=expiresAt)return result({code:"delegation_expired",reason:"The delegation has expired.",requiredLevel,delegation:grant});

  if(Boolean(actionDefinition?.externalSideEffect)&&!grant.externalSideEffects){
    return result({code:"external_side_effect_not_delegated",reason:"The delegation does not permit external side effects.",requiredLevel,delegation:grant});
  }
  if(grant.strongAuthRequired&&strongAuth!=="server_verified"){
    return result({decision:"review_required",code:"strong_auth_required",reason:"Server-verified strong authentication is required before this delegated action could proceed.",requiredLevel,delegation:grant,humanReviewRequired:true});
  }
  if(grant.humanConfirmationRequired&&approvalState!=="approved"){
    return result({decision:"review_required",code:"human_confirmation_required",reason:"Human confirmation is required by the delegation.",requiredLevel,delegation:grant,humanReviewRequired:true});
  }
  if(grant.maxDailyActions!=null&&Number(dailyActionCount)>=grant.maxDailyActions){
    return result({code:"daily_action_limit_reached",reason:"The delegation daily action limit has been reached.",requiredLevel,delegation:grant});
  }
  const amount=Math.max(0,Number(amountMinor)||0);
  if(grant.maxAmountMinor!=null&&amount>grant.maxAmountMinor){
    return result({code:"amount_limit_exceeded",reason:"The proposed amount exceeds the delegation limit.",requiredLevel,delegation:grant});
  }

  if(mode==="shadow"){
    return result({allowed:true,decision:"shadow_allow",code:"shadow_policy_pass",reason:"The action passes delegated-authority checks in shadow mode. No side effect was executed.",requiredLevel,delegation:grant,executionAllowed:false});
  }
  if(grant.shadowOnly)return result({code:"shadow_only_grant",reason:"This delegation is permanently shadow-only in the current schema.",requiredLevel,delegation:grant});
  if(globalExecutionEnabled!==true)return result({code:"execution_globally_disabled",reason:"Bounded execution is globally disabled.",requiredLevel,delegation:grant});

  return result({allowed:true,decision:"allow_execute",code:"bounded_execution_allowed",reason:"The bounded action satisfies delegated-authority controls.",requiredLevel,delegation:grant,executionAllowed:true});
}

export const __delegatedAuthorityTest=Object.freeze({
  requiredAutonomyLevel,
  normalizeDelegation,
  isNeverAutonomousAction
});
