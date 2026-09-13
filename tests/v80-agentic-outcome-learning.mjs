import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  __agenticLearningTest,
  associationForProposal,
  buildOutcomeAssociations,
  rankOutcomeInformedProposals
} from '../cloudflare/src/agentic-learning.js';

const rows=[
  {source_ref:'positive',evidence_count:5,positive_count:5,negative_count:0,unchanged_count:0},
  {source_ref:'negative',evidence_count:5,positive_count:0,negative_count:5,unchanged_count:0},
  {source_ref:'thin',evidence_count:2,positive_count:2,negative_count:0,unchanged_count:0},
  {source_ref:'__proto__',evidence_count:3,positive_count:3,negative_count:0,unchanged_count:0}
];
const associations=buildOutcomeAssociations(rows);
assert.equal(Object.getPrototypeOf(associations),null,'association map must not expose an object prototype');
assert.equal(Object.hasOwn(associations,'__proto__'),true,'hostile-looking source refs must remain inert own keys');
assert.equal(associations.positive.association,1);
assert.equal(associations.negative.association,-1);
assert.equal(associations.thin.association,0);
assert.equal(associations.positive.causal,false);
assert.equal(__agenticLearningTest.MIN_EVIDENCE,3);
assert.ok(__agenticLearningTest.MAX_ASSOCIATION_ADJUSTMENT<50,'learning adjustment must remain far below one priority-class step');

const duplicateRefs=associationForProposal({sourceRefs:['positive','positive',' positive ']},associations);
assert.equal(duplicateRefs.evidenceCount,5,'duplicate current source refs must not multiply evidence');
assert.equal(duplicateRefs.association,1);
assert.equal(duplicateRefs.adjustment,10);

const samePriority=rankOutcomeInformedProposals([
  {ordinal:1,title:'Negative history',priority:'medium',risk:'low',authority:'recommendation_only',executionPolicy:'not_executable_stage_1',sourceRefs:['negative']},
  {ordinal:2,title:'Positive history',priority:'medium',risk:'low',authority:'recommendation_only',executionPolicy:'not_executable_stage_1',sourceRefs:['positive']}
],associations);
assert.equal(samePriority[0].title,'Positive history');
assert.equal(samePriority[0].outcomeLearning.adjustment,10);
assert.equal(samePriority[1].outcomeLearning.adjustment,-10);

const crossPriority=rankOutcomeInformedProposals([
  {ordinal:1,title:'High negative',priority:'high',risk:'high',authority:'human_only',executionPolicy:'prohibited_autonomy',sourceRefs:['negative']},
  {ordinal:2,title:'Medium positive',priority:'medium',risk:'low',authority:'recommendation_only',executionPolicy:'not_executable_stage_1',sourceRefs:['positive']}
],associations);
assert.equal(crossPriority[0].title,'High negative','outcome learning must never cross priority classes');
assert.equal(crossPriority[0].risk,'high');
assert.equal(crossPriority[0].authority,'human_only');
assert.equal(crossPriority[0].executionPolicy,'prohibited_autonomy');
assert.equal(crossPriority[1].risk,'low');

const thin=associationForProposal({sourceRefs:['thin']},associations);
assert.deepEqual(thin,{evidenceCount:0,association:0,adjustment:0,causal:false});

const agent=fs.readFileSync(new URL('../cloudflare/src/agentic-core.js',import.meta.url),'utf8');
const advisorIndex=agent.indexOf('const advisor=await runAdvisor');
const learningIndex=agent.indexOf('const outcomeAssociations=await loadOutcomeAssociations');
assert.ok(advisorIndex>=0&&learningIndex>advisorIndex,'outcome associations must be loaded after model reasoning');
assert.match(agent,/SELECT DISTINCT p0\.id proposal_id,p0\.tenant_id,ref\.value source_ref/);
assert.match(agent,/WHERE p0\.tenant_id=\?/);
assert.match(agent,/WHERE o\.tenant_id=\?/);
assert.match(agent,/\.bind\(tenantId,tenantId\)\.all\(\)/);
assert.match(agent,/o2\.tenant_id=o\.tenant_id AND o2\.proposal_id=o\.proposal_id/);
assert.match(agent,/o\.created_at>=datetime\('now','-180 days'\)/);
assert.match(agent,/ORDER BY o2\.created_at DESC,o2\.id DESC LIMIT 1/);
const latestOutcomeSubquery=agent.match(/AND o\.id=\(SELECT o2\.id FROM agentic_outcomes o2([\s\S]*?)ORDER BY o2\.created_at DESC,o2\.id DESC LIMIT 1\)/)?.[1]||'';
assert.ok(latestOutcomeSubquery,'latest overall outcome subquery must exist');
assert.doesNotMatch(latestOutcomeSubquery,/outcome_status/,'latest overall outcome selection must not skip newer neutral outcomes');
assert.match(agent,/priorityClassOverride:false/);
assert.match(agent,/riskAuthorityEffect:false/);
assert.match(agent,/executionAuthorityEffect:false/);
assert.doesNotMatch(agent,/\/api\/agentic\/execute/);

console.log('V80 outcome-informed learning gate: PASS');
