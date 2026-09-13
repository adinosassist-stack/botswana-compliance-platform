import fs from 'node:fs';

const path='cloudflare/src/agentic-core.js';
let source=fs.readFileSync(path,'utf8');
const start=source.indexOf('async function loadOutcomeAssociations(env,tenantId){');
const end=source.indexOf('async function appendEvent(env,',start);
if(start<0||end<0)throw new Error('outcome association function anchors missing');
const replacement=`async function loadOutcomeAssociations(env,tenantId){
  try{
    const rows=await env.DB.prepare(\`SELECT refs.source_ref source_ref,
      COUNT(*) evidence_count,
      SUM(CASE WHEN o.outcome_status IN ('improved','resolved') THEN 1 ELSE 0 END) positive_count,
      SUM(CASE WHEN o.outcome_status='worsened' THEN 1 ELSE 0 END) negative_count,
      SUM(CASE WHEN o.outcome_status='unchanged' THEN 1 ELSE 0 END) unchanged_count
      FROM agentic_outcomes o
      JOIN (
        SELECT DISTINCT p0.id proposal_id,p0.tenant_id,ref.value source_ref
        FROM agentic_proposals p0
        JOIN json_each(p0.source_refs_json) ref
        WHERE p0.tenant_id=?
      ) refs ON refs.proposal_id=o.proposal_id AND refs.tenant_id=o.tenant_id
      WHERE o.tenant_id=?
        AND o.outcome_status IN ('improved','resolved','worsened','unchanged')
        AND o.created_at>=datetime('now','-180 days')
        AND o.id=(SELECT o2.id FROM agentic_outcomes o2
          WHERE o2.tenant_id=o.tenant_id AND o2.proposal_id=o.proposal_id
          ORDER BY o2.created_at DESC,o2.id DESC LIMIT 1)
      GROUP BY refs.source_ref
      ORDER BY evidence_count DESC,source_ref ASC
      LIMIT 64\`).bind(tenantId,tenantId).all();
    return buildOutcomeAssociations(rows.results||[]);
  }catch{return {}}
}

`;
const next=source.slice(0,start)+replacement+source.slice(end);
if(next===source){console.log('query already hardened');process.exit(0)}
fs.writeFileSync(path,next);
console.log('hardened outcome-learning query');
