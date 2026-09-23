// Thebe Desk single-agent capability policy.
// One governed Thebe agent is the only user-facing/canonical agent identity.
// Specialist domains are deterministic capability modules, not independent agents.
// Models may propose work, but they may never grant themselves permissions or
// bypass the action catalogue, human review, tenant scope, or delegated authority.

export const AGENT_POLICY_VERSION = "2026-09-20.single-agent-capabilities-v2";

export const AGENT_ACTION_LEVELS = Object.freeze({ READ: 1, PREPARE: 2, CONTROLLED_EXECUTE: 3, HIGH_RISK: 4 });

export const THEBE_CAPABILITIES = Object.freeze({
  finance: Object.freeze({
    key:"finance",
    label:"Finance",
    purpose:"Interpret reconciled Finance Core outputs, data quality and finance drafts without inventing figures or moving money.",
    enabled:true
  }),
  compliance: Object.freeze({
    key:"compliance",
    label:"Compliance & Tender Readiness",
    purpose:"Interpret verified obligations, evidence and tender-readiness requirements without claiming eligibility, filing, signing or submitting.",
    enabled:true
  }),
  operations: Object.freeze({
    key:"operations",
    label:"Operations & People",
    purpose:"Summarise aggregate operational signals and prepare bounded operational follow-up without employee surveillance or autonomous employment decisions.",
    enabled:true
  }),
  customer: Object.freeze({
    key:"customer",
    label:"Receivables & Customer",
    purpose:"Reserved capability boundary for customer and receivables workflows once authoritative customer data, consent and execution controls are production-ready.",
    enabled:false
  })
});

export const THEBE_AGENTS = Object.freeze({
  thebe: Object.freeze({
    key:"thebe",
    label:"Thebe",
    purpose:"Act as the single governed business agent, routing requests to approved capabilities and preparing evidence-grounded work under deterministic policy.",
    allowedRoles:Object.freeze(["owner","manager","reviewer"])
  })
});

// Compatibility only. Old clients/delegations may still use these historical
// agent keys. They resolve to the single Thebe agent while preserving the old
// domain boundary for action routing.
export const LEGACY_AGENT_CAPABILITY = Object.freeze({
  management:"core",
  compliance:"compliance",
  tender:"compliance",
  operations:"operations",
  finance:"finance"
});

export function resolveAgentKey(agentKey){
  const key=String(agentKey||"").trim().toLowerCase();
  if(key==="thebe")return "thebe";
  return Object.prototype.hasOwnProperty.call(LEGACY_AGENT_CAPABILITY,key)?"thebe":null;
}

function action({
  key,level,roles,description,phase1Enabled,boundedExecutionEnabled=false,
  capability="core",legacyAgents=[],
  humanReviewRequired=false,explicitApprovalRequired=false,strongAuthRequired=false,
  externalSideEffect=false,sensitiveDomain=null,authoritativeSource=null
}) {
  return Object.freeze({
    key,level,
    agents:Object.freeze(["thebe"]),
    capability,
    legacyAgents:Object.freeze([...legacyAgents]),
    roles:Object.freeze([...roles]),
    description,
    phase1Enabled:Boolean(phase1Enabled),
    boundedExecutionEnabled:Boolean(boundedExecutionEnabled),
    humanReviewRequired:Boolean(humanReviewRequired),
    explicitApprovalRequired:Boolean(explicitApprovalRequired),
    strongAuthRequired:Boolean(strongAuthRequired),
    externalSideEffect:Boolean(externalSideEffect),
    sensitiveDomain,
    authoritativeSource
  });
}

export const AGENT_ACTION_CATALOG = Object.freeze({
  // Action keys are untrusted request/model input. Inherited Object members
  // must never resolve as action definitions in policy or authority handlers.
  __proto__: null,
  "business_health.read": action({key:"business_health.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager"],description:"Read governed business-health indicators and recorded risks.",phase1Enabled:true,capability:"core",legacyAgents:["management"],authoritativeSource:"business_graph_and_deterministic_metrics"}),
  "compliance_status.read": action({key:"compliance_status.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read current verified obligations, status and approved source references.",phase1Enabled:true,capability:"compliance",legacyAgents:["compliance"],authoritativeSource:"country_rules_and_verified_workspace_records"}),
  "compliance_risk.explain": action({key:"compliance_risk.explain",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Explain a recorded compliance risk and its evidence/source references.",phase1Enabled:true,capability:"compliance",legacyAgents:["compliance"],authoritativeSource:"country_rules_and_verified_workspace_records"}),
  "tender_readiness.read": action({key:"tender_readiness.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read active tender readiness and mandatory evidence gaps without promising eligibility or award.",phase1Enabled:true,capability:"compliance",legacyAgents:["tender"],authoritativeSource:"verified_tender_and_evidence_records"}),
  "daily_operations_summary.read": action({key:"daily_operations_summary.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager"],description:"Read aggregate Daily Operations metrics only; never expose employee report narratives.",phase1Enabled:true,capability:"operations",legacyAgents:["operations"],sensitiveDomain:"workforce_aggregate",authoritativeSource:"aggregate_daily_operations_metrics"}),
  "financial_position.read": action({key:"financial_position.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read reconciled cash, receivables, payables, income and expense outputs from the Finance Core without inventing values.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance",authoritativeSource:"reconciled_finance_core"}),
  "management_accounts.read": action({key:"management_accounts.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read generated management-account outputs and their period/provenance metadata.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance",authoritativeSource:"reconciled_finance_core"}),
  "finance_data_quality.read": action({key:"finance_data_quality.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read reconciliation, completeness and provenance indicators used to qualify finance conclusions.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance",authoritativeSource:"finance_data_quality_controls"}),
  "finance_daily_inflows.read": action({key:"finance_daily_inflows.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read positive Finance Core inflows recorded for the current Botswana business date without claiming that every inflow is a customer collection.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance",authoritativeSource:"reconciled_finance_core"}),
  "receivables_summary.read": action({key:"receivables_summary.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read authoritative outstanding and overdue customer receivables derived from issued invoices and transaction-backed allocations.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance",authoritativeSource:"finance_invoices_plus_transaction_allocations"}),
  "receivables_customer.read": action({key:"receivables_customer.read",level:AGENT_ACTION_LEVELS.READ,roles:["owner","manager","reviewer"],description:"Read one unambiguously matched customer receivable balance from issued invoices and transaction-backed allocations; never fuzzy-match or infer identity.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance",authoritativeSource:"finance_invoices_plus_transaction_allocations"}),
  "management_brief.prepare": action({key:"management_brief.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager"],description:"Prepare a management brief as a draft for human review.",phase1Enabled:true,capability:"core",legacyAgents:["management"],humanReviewRequired:true,authoritativeSource:"business_graph_and_deterministic_metrics"}),
  "compliance_action_plan.prepare": action({key:"compliance_action_plan.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager","reviewer"],description:"Prepare a compliance action plan from verified rules and recorded workspace facts.",phase1Enabled:true,capability:"compliance",legacyAgents:["compliance"],humanReviewRequired:true,authoritativeSource:"country_rules_and_verified_workspace_records"}),
  "evidence_request.prepare": action({key:"evidence_request.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager","reviewer"],description:"Prepare, but do not send, an evidence request for human review.",phase1Enabled:true,capability:"compliance",legacyAgents:["compliance","tender"],humanReviewRequired:true,authoritativeSource:"verified_workspace_records"}),
  "tender_pack.prepare": action({key:"tender_pack.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager","reviewer"],description:"Prepare a tender-readiness evidence/checklist pack for human review.",phase1Enabled:true,capability:"compliance",legacyAgents:["tender"],humanReviewRequired:true,authoritativeSource:"verified_tender_and_evidence_records"}),
  "daily_operations_brief.prepare": action({key:"daily_operations_brief.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager"],description:"Prepare an aggregate operations brief without employee surveillance or disciplinary recommendations.",phase1Enabled:true,capability:"operations",legacyAgents:["operations"],humanReviewRequired:true,sensitiveDomain:"workforce_aggregate",authoritativeSource:"aggregate_daily_operations_metrics"}),
  "finance_brief.prepare": action({key:"finance_brief.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager","reviewer"],description:"Prepare a finance brief from reconciled Finance Core outputs, explicitly carrying period, data-quality and provenance qualifiers.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],humanReviewRequired:true,sensitiveDomain:"finance",authoritativeSource:"reconciled_finance_core"}),
  "finance_reconciliation.prepare": action({key:"finance_reconciliation.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager"],description:"Prepare a reconciliation proposal from the canonical Finance Core without recording a reconciliation run, sending notifications, posting journals or moving money.",phase1Enabled:true,capability:"finance",legacyAgents:["finance"],humanReviewRequired:true,sensitiveDomain:"finance",authoritativeSource:"reconciled_finance_core"}),
  "journal_entry.prepare": action({key:"journal_entry.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager","reviewer"],description:"Reserved journal-entry draft action; disabled until ledger evidence-linking and accountant review controls are production-ready.",phase1Enabled:false,capability:"finance",legacyAgents:["finance"],humanReviewRequired:true,sensitiveDomain:"finance_ledger",authoritativeSource:"reconciled_finance_core"}),
  "filing_draft.prepare": action({key:"filing_draft.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager","reviewer"],description:"Reserved filing-draft action; disabled until country-rule and form-specific validation is complete.",phase1Enabled:false,capability:"compliance",legacyAgents:["compliance"],humanReviewRequired:true,sensitiveDomain:"regulatory_filing",authoritativeSource:"country_rules_and_verified_workspace_records"}),
  "payroll_draft.prepare": action({key:"payroll_draft.prepare",level:AGENT_ACTION_LEVELS.PREPARE,roles:["owner","manager"],description:"Reserved payroll-draft action; disabled because payroll remains outside the launch Finance Core boundary.",phase1Enabled:false,capability:"finance",legacyAgents:["finance"],humanReviewRequired:true,sensitiveDomain:"payroll",authoritativeSource:"approved_payroll_integration"}),
  "task.create": action({key:"task.create",level:AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE,roles:["owner","manager"],description:"Create an internal task through controlled execution.",phase1Enabled:false,boundedExecutionEnabled:true,capability:"core",legacyAgents:["management","compliance","tender","operations","finance"]}),
  "document.request": action({key:"document.request",level:AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE,roles:["owner","manager"],description:"Send a controlled document request.",phase1Enabled:false,capability:"compliance",legacyAgents:["compliance","tender","finance"],externalSideEffect:true}),
  "reminder.send": action({key:"reminder.send",level:AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE,roles:["owner","manager"],description:"Send a controlled reminder through an approved notification channel.",phase1Enabled:false,capability:"core",legacyAgents:["management","compliance","tender","operations","finance"],externalSideEffect:true}),
  "approval.create": action({key:"approval.create",level:AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE,roles:["owner","manager"],description:"Create an internal approval request without performing the underlying high-risk action.",phase1Enabled:false,capability:"core",legacyAgents:["management","compliance","tender","operations","finance"]}),
  "journal_entry.post": action({key:"journal_entry.post",level:AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE,roles:["owner","manager"],description:"Post an approved journal entry to the Finance Core.",phase1Enabled:false,capability:"finance",legacyAgents:["finance"],sensitiveDomain:"finance_ledger",authoritativeSource:"reconciled_finance_core"}),
  "payment.execute": action({key:"payment.execute",level:AGENT_ACTION_LEVELS.HIGH_RISK,roles:["owner"],description:"Reserved high-risk payment execution.",phase1Enabled:false,capability:"finance",legacyAgents:["management","finance"],explicitApprovalRequired:true,strongAuthRequired:true,externalSideEffect:true,sensitiveDomain:"payments"}),
  "government_filing.submit": action({key:"government_filing.submit",level:AGENT_ACTION_LEVELS.HIGH_RISK,roles:["owner"],description:"Reserved high-risk government filing submission.",phase1Enabled:false,capability:"compliance",legacyAgents:["compliance"],explicitApprovalRequired:true,strongAuthRequired:true,externalSideEffect:true,sensitiveDomain:"regulatory_filing"}),
  "document.sign": action({key:"document.sign",level:AGENT_ACTION_LEVELS.HIGH_RISK,roles:["owner"],description:"Reserved high-risk signature action.",phase1Enabled:false,capability:"core",legacyAgents:["management","compliance","tender","finance"],explicitApprovalRequired:true,strongAuthRequired:true,externalSideEffect:true,sensitiveDomain:"signature"}),
  "employment.terminate": action({key:"employment.terminate",level:AGENT_ACTION_LEVELS.HIGH_RISK,roles:["owner"],description:"Reserved employment termination action. The agent may never autonomously decide termination.",phase1Enabled:false,capability:"operations",legacyAgents:["management"],explicitApprovalRequired:true,strongAuthRequired:true,externalSideEffect:true,sensitiveDomain:"employment"}),
  "financing.accept": action({key:"financing.accept",level:AGENT_ACTION_LEVELS.HIGH_RISK,roles:["owner"],description:"Reserved high-risk financing acceptance action.",phase1Enabled:false,capability:"finance",legacyAgents:["management","finance"],explicitApprovalRequired:true,strongAuthRequired:true,externalSideEffect:true,sensitiveDomain:"financing"})
});

export function agentCanRouteAction(agentKey,actionDefinition){
  const requested=String(agentKey||"").trim().toLowerCase();
  if(resolveAgentKey(requested)!=="thebe"||!actionDefinition)return false;
  if(requested==="thebe")return actionDefinition.agents.includes("thebe");
  return actionDefinition.legacyAgents.includes(requested);
}

function deny(code,reason,actionDefinition=null){return Object.freeze({allowed:false,decision:"deny",code,reason,policyVersion:AGENT_POLICY_VERSION,action:actionDefinition,humanReviewRequired:Boolean(actionDefinition?.humanReviewRequired),explicitApprovalRequired:Boolean(actionDefinition?.explicitApprovalRequired),strongAuthRequired:Boolean(actionDefinition?.strongAuthRequired),externalSideEffect:Boolean(actionDefinition?.externalSideEffect)})}

export function evaluateAgentAction({agentKey,actionKey,actorRole,tenantScoped=false,strongAuth=false,approvalState="none",phase="phase1"}={}){
  const canonicalAgentKey=resolveAgentKey(agentKey);
  const agent=canonicalAgentKey?THEBE_AGENTS[canonicalAgentKey]:null;
  if(!agent)return deny("unknown_agent","Unknown agent; policy fails closed.");
  const definition=AGENT_ACTION_CATALOG[String(actionKey||"")]; if(!definition)return deny("unknown_action","Unknown action; policy fails closed.");
  if(tenantScoped!==true)return deny("tenant_scope_required","Agent actions require an authenticated tenant scope.",definition);
  const role=String(actorRole||"").trim().toLowerCase();
  if(!agentCanRouteAction(agentKey,definition))return deny("agent_action_mismatch","This request is not authorised for the action's capability.",definition);
  if(!agent.allowedRoles.includes(role)||!definition.roles.includes(role))return deny("role_forbidden","The current role is not authorised for this agent action.",definition);
  const launchPhase=String(phase||"phase1");
  const phase1Allowed=launchPhase==="phase1"&&definition.phase1Enabled===true;
  const boundedAllowed=launchPhase==="bounded_v1"&&definition.boundedExecutionEnabled===true&&definition.level===AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE;
  if(!phase1Allowed&&!boundedAllowed)return deny("action_not_enabled","The action is not enabled in the current launch phase.",definition);
  if(definition.level===AGENT_ACTION_LEVELS.HIGH_RISK){
    if(definition.explicitApprovalRequired&&approvalState!=="approved")return deny("explicit_approval_required","Explicit human approval is required.",definition);
    if(definition.strongAuthRequired&&strongAuth!==true)return deny("strong_auth_required","Strong authentication is required.",definition);
  }
  if(definition.externalSideEffect)return deny("external_side_effect_not_enabled","The current agent launch phase cannot perform external side effects.",definition);
  const prepareOnly=definition.level===AGENT_ACTION_LEVELS.PREPARE;
  const boundedExecute=launchPhase==="bounded_v1"&&definition.level===AGENT_ACTION_LEVELS.CONTROLLED_EXECUTE;
  return Object.freeze({
    allowed:true,
    decision:boundedExecute?"controlled_execute":prepareOnly?"prepare_only":"allow_read",
    code:boundedExecute?"bounded_execution_policy":prepareOnly?"human_review_required":"allowed",
    reason:boundedExecute
      ?"The action is eligible for deterministic bounded execution, subject to delegated authority and the runtime guard."
      :prepareOnly
        ?"The agent may create a bounded draft, but a human must review it before any downstream action."
        :"The read is permitted within the authenticated tenant and role scope.",
    policyVersion:AGENT_POLICY_VERSION,
    agentKey:"thebe",
    capability:definition.capability,
    action:definition,
    humanReviewRequired:prepareOnly||definition.humanReviewRequired,
    explicitApprovalRequired:definition.explicitApprovalRequired,
    strongAuthRequired:definition.strongAuthRequired,
    externalSideEffect:false
  });
}

export function listPhase1AgentActions(agentKey,actorRole){
  const canonicalAgentKey=resolveAgentKey(agentKey),agent=canonicalAgentKey?THEBE_AGENTS[canonicalAgentKey]:null,role=String(actorRole||"").trim().toLowerCase();
  if(!agent||!agent.allowedRoles.includes(role))return[];
  return Object.values(AGENT_ACTION_CATALOG).filter(d=>d.phase1Enabled===true&&agentCanRouteAction(agentKey,d)&&d.roles.includes(role)&&d.externalSideEffect===false);
}
