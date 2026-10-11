import assert from "node:assert/strict";
import {
  OWNER_ATTENTION_VERSION,
  buildOwnerAttentionProjection,
  normalizeOwnerAttentionAvailability
} from "../cloudflare/src/owner-attention.js";

const available={available:true,observedAt:"2026-10-11T07:30:00Z"};
const sources={
  dailyBrief:available,
  businessContext:available,
  approvals:available,
  outcomes:available
};

{
  const projection=buildOwnerAttentionProjection({
    generatedAt:"2026-10-11T07:31:00Z",
    businessDate:"2026-10-11",
    market:{code:"BW",country:"Botswana",currency:"BWP",timeZone:"Africa/Gaborone"},
    sourceAvailability:sources,
    dailyBrief:{
      topActions:[
        {source:"regulatory",id:"ob-1",title:"Renew trading licence",priority:1,status:"open",dueAt:"2026-10-12",sourceRefs:["compliance_obligations:ob-1"],target:"regulatoryobligations"},
        {source:"finance",id:"recon-1",title:"Review reconciliation exception",severity:"warning",status:"review",sourceRefs:["finance_reconciliation_runs:recon-1"],target:"finance"}
      ]
    },
    businessBrief:{
      observedAt:"2026-10-11T07:30:00Z",
      priorities:[
        {key:"dormant_quotations",severity:"medium",title:"Follow up dormant quotations",detail:"Three recorded quotations need follow-up.",sourceRefs:["app_state.active_company.salesIntelligence"],actionKey:"sales_follow_up.prepare"}
      ]
    },
    approvals:[
      {sourceType:"agentic_proposal",sourceId:"proposal-1",title:"Approve prepared task",status:"review",sourceRefs:["agentic_proposals:proposal-1"]}
    ],
    outcomes:[
      {sourceType:"agentic_outcome",sourceId:"outcome-1",title:"Record task outcome",status:"review",sourceRefs:["agentic_outcomes:outcome-1"]}
    ],
    now:new Date("2026-10-11T08:00:00Z")
  });

  assert.equal(projection.version,OWNER_ATTENTION_VERSION);
  assert.equal(projection.state,"ready");
  assert.deepEqual(projection.counts,{action:2,approvals:1,outcomes:1,recommendations:1,total:4,urgent:1,overdue:0});
  assert.equal(projection.items.length,5);
  assert.equal(projection.items.filter(item=>item.authoritative).length,4);
  assert.equal(projection.items.find(item=>item.category==="recommendation")?.truthState,"recommendation");
  assert.equal(projection.items.find(item=>item.category==="recommendation")?.authoritative,false);
  assert.equal(projection.items.find(item=>item.sourceId==="ob-1")?.actionRoute,"regulatoryobligations");
  assert.equal(projection.provenance.authoritativeItemCategories.includes("recommendation"),false);
}

{
  const projection=buildOwnerAttentionProjection({
    sourceAvailability:{
      dailyBrief:available,
      businessContext:available,
      approvals:{available:false,reason:"query_failed"},
      outcomes:available
    },
    dailyBrief:{topActions:[]},
    businessBrief:{priorities:[]},
    approvals:[],
    outcomes:[]
  });

  assert.equal(projection.state,"unavailable");
  assert.equal(projection.counts.action,0,"an available source may truthfully report zero");
  assert.equal(projection.counts.approvals,null,"a failed source must not become a reassuring zero");
  assert.equal(projection.counts.outcomes,0);
  assert.equal(projection.counts.total,null,"total must stay unknown while an authoritative category is unavailable");
  assert.equal(projection.counts.urgent,null);
  assert.equal(projection.counts.overdue,null);
  assert.equal(projection.sourceAvailability.approvals.reason,"query_failed");
}

{
  const projection=buildOwnerAttentionProjection({
    sourceAvailability:{
      dailyBrief:{available:false,reason:"d1_unavailable"},
      businessContext:available,
      approvals:available,
      outcomes:available
    },
    dailyBrief:{topActions:[{source:"risk",id:"stale-ui-row",title:"This must not leak through"}]},
    businessBrief:{priorities:[]},
    approvals:[],
    outcomes:[]
  });

  assert.equal(projection.state,"unavailable");
  assert.equal(projection.counts.action,null);
  assert.equal(projection.items.some(item=>item.sourceId==="stale-ui-row"),false,"unavailable authoritative sources must not contribute stale items");
}

{
  const projection=buildOwnerAttentionProjection({
    requestedState:"loading",
    sourceAvailability:sources,
    dailyBrief:{topActions:[]},
    businessBrief:{priorities:[]},
    approvals:[],
    outcomes:[]
  });
  assert.equal(projection.state,"loading");
}

{
  const normalized=normalizeOwnerAttentionAvailability({
    dailyBrief:true,
    approvals:false,
    outcomes:{available:true},
    businessContext:{available:true,observedAt:"2026-10-11T07:30:00Z"},
    property:{available:null,reason:"not_requested"}
  });
  assert.equal(normalized.dailyBrief.available,true);
  assert.equal(normalized.dailyBrief.required,true);
  assert.equal(normalized.approvals.available,false);
  assert.equal(normalized.outcomes.required,true);
  assert.equal(normalized.businessContext.required,false);
  assert.equal(normalized.property.available,null);
}

{
  const projection=buildOwnerAttentionProjection({
    sourceAvailability:sources,
    dailyBrief:{topActions:[
      {source:"compliance",id:"late",title:"Overdue filing",status:"open",dueAt:"2026-10-01",severity:"high"},
      {source:"compliance",id:"done",title:"Completed filing",status:"completed",dueAt:"2026-10-01",severity:"low"}
    ]},
    businessBrief:{priorities:[]},
    approvals:[],
    outcomes:[],
    now:new Date("2026-10-11T08:00:00Z")
  });
  assert.equal(projection.counts.overdue,1);
  assert.equal(projection.items[0].sourceId,"late","higher-severity work should sort ahead of lower-severity work");
}

console.log("owner-attention contract: ok");
