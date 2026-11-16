// Pure validation of owner scope acceptance. This never authorizes execution itself.
import {STRANDED,WORKER,ACCOUNT,PINNED} from './workspace-agent-stranded-retirement-eligibility.mjs';
export const OWNER_LOGIN='adinosassist-stack';
export const REVIEWER_LOGIN='thusico';
export const SOURCE_PR=2505;
export function expectedOwnerStatement(sha) {
 return 'I explicitly authorize irreversible deletion of only undeployed Cloudflare Worker version '+
   STRANDED+' from staging account '+ACCOUNT+' Worker '+WORKER+
   ', for exact GitHub main SHA '+sha+
   '. Preserve pinned inert version '+PINNED+
   ', its deployment, D1 database, secrets, routes and production. I accept version-retirement irreversibility and require separate independent thusico protected execution approval.';
}
export function assessOwnerStatement({comment,sha,actor}={}) {
 const reasons=[];
 const ok=(condition,reason)=>{if(!condition)reasons.push(reason)};
 ok(typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha),'invalid_source_sha');
 ok(actor===OWNER_LOGIN,'run_not_initiated_by_owner');
 ok(comment?.user?.login===OWNER_LOGIN,'owner_comment_author_not_verified');
 ok(comment?.issue_url==='https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/'+SOURCE_PR,
   'owner_comment_not_on_retirement_decision_pr');
 ok(typeof comment?.id==='number'&&Number.isSafeInteger(comment.id)&&comment.id>0,
   'owner_comment_id_invalid');
 ok(comment?.body===expectedOwnerStatement(sha),'owner_statement_missing_or_not_exact');
 ok(comment?.created_at===comment?.updated_at,'owner_comment_modified_after_creation');
 return {statementVerified:reasons.length===0,reasons,
  independentReviewerApprovalStillRequired:true,destructiveOperationPerformed:false};
}
