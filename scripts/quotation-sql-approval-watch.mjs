/**
 * Issue #2504 quotation-only staging SQL approval event watch.
 *
 * SECURITY: This is a notification/approval detector, never a migration runner.
 * It must not import Cloudflare credentials, run SQL, deploy Workers, or issue
 * customer quotations. A GitHub comment is not sufficient to skip preflight.
 *
 * Trigger on created GitHub issue comments, never on edited approvals.
 */
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const contract=Object.freeze({
 repository:"adinosassist-stack/botswana-compliance-platform",
 issueNumber:2504,
 reviewer:"thusico",
 accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
 databaseName:"bw-quotation-staging",
 databaseId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBlob:"6d9527d1184603cbaafbf70c999615c8784b7708",
 draftBlob:"9aa86a3282d34707b3aa056b8ec1e1f6ccef5ce1"
});

/** Deliberately exact. Positive code reviews and provisioning approval do not match. */
export const reviewerApprovalText=
 `I independently approve EXECUTE_QUOTATION_STAGING_D1_SQL for Cloudflare account ${contract.accountId}, D1 ${contract.databaseName} UUID ${contract.databaseId}. Logo SQL Git blob ${contract.logoBlob}. Draft SQL Git blob ${contract.draftBlob}. Staging-only SQL execution approval. No R2 uploads, Worker deployments, public routes, payments, production changes or customer activation.`;

const normalize=value=>typeof value==="string"?
 value.trim().replace(/\s+/g," "):"";

export function isIndependentQuotationSqlApproval(event){
 if(!event||event.action!=="created"||event.issue?.number!==contract.issueNumber||
    event.repository?.full_name!==contract.repository||
    event.comment?.user?.login!==contract.reviewer||
    !Number.isSafeInteger(event.comment?.id)||
    event.comment.id<1)return false;
 // An exact single affirmative statement, by the real reviewer GitHub actor.
 // Reject quoted copies, trailers, negations, approvals for one migration,
 // modified D1 UUIDs, and stale/incorrect Git blob IDs.
 return normalize(event.comment.body)===normalize(reviewerApprovalText);
}

export function notificationMarker(commentId){
 if(!Number.isSafeInteger(commentId)||commentId<1)
  throw Error("invalid_review_comment_id");
 return `<!-- quotation-d1-staging-independent-sql-approval:${commentId} -->`;
}

export function notificationBody(event,sourceSha){
 if(!isIndependentQuotationSqlApproval(event))
  throw Error("independent_quotation_sql_approval_not_verified");
 if(typeof sourceSha!=="string"||!/^[a-f0-9]{40}$/.test(sourceSha))
  throw Error("invalid_workflow_source_sha");
 return `### Independent quotation staging SQL execution approval detected

GitHub reviewer **${contract.reviewer}** explicitly approved both immutable, staging-only migration SQL scopes in [their comment](https://github.com/${contract.repository}/issues/${contract.issueNumber}#issuecomment-${event.comment.id}).

- Cloudflare account: \`${contract.accountId}\`
- Dedicated D1: \`${contract.databaseName}\` / \`${contract.databaseId}\`
- Logo SQL Git blob: \`${contract.logoBlob}\`
- Draft SQL Git blob: \`${contract.draftBlob}\`
- Owner's conditional authorization: issue comment #6916022563
- Monitoring workflow source SHA: \`${sourceSha}\`

**Approval detected, NOT executed.** Before any database mutation, independently reverify the current \`main\` SHA, exact SQL blobs, the authorized account and D1 UUID, read-only schema inventory, a fresh recovery bookmark and independently accepted restore plan. A separate protected execution action must enforce these gates. Stop on any drift or unapproved scope.

**No migration, template upload, R2 mutation, Worker deployment, route, payment or production change was performed by this monitor.**

${notificationMarker(event.comment.id)}`;
}

export function hasBeenNotified(comments,commentId){
 const marker=notificationMarker(commentId);
 return Array.isArray(comments)&&comments.some(c=>
  typeof c?.body==="string"&&c.body.includes(marker));
}

async function requestGitHub({token,method,path,body}){
 const response=await fetch("https://api.github.com"+path,{
  method,
  headers:{
   "accept":"application/vnd.github+json",
   "authorization":"Bearer "+token,
   "x-github-api-version":"2022-11-28",
   "user-agent":"quotation-d1-staging-approval-watch",
   ...(body?{"content-type":"application/json"}:{})
  },
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response.ok)throw Error("github_approval_watch_http_"+response.status);
 return response.json();
}

export async function runApprovalWatch(env=process.env){
 if(env.GITHUB_REPOSITORY!==contract.repository||
    env.GITHUB_EVENT_NAME!=="issue_comment")
  return {status:"inert_non_target_event"};
 if(!env.GITHUB_EVENT_PATH||!env.GITHUB_TOKEN)
  throw Error("github_approval_watch_not_configured");
 const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,"utf8"));
 if(!isIndependentQuotationSqlApproval(event))
  return {status:"no_exact_independent_execution_approval"};
 const issuePath=`/repos/${contract.repository}/issues/${contract.issueNumber}/comments`;
 const comments=[];
 for(let page=1;page<=20;page++){
  const batch=await requestGitHub({token:env.GITHUB_TOKEN,method:"GET",
   path:issuePath+"?per_page=100&page="+page});
  if(!Array.isArray(batch))throw Error("github_comments_unexpected_response");
  comments.push(...batch);
  if(batch.length<100)break;
  if(page===20)throw Error("github_comments_pagination_limit");
 }
 // The incoming event may have been deleted or otherwise revoked before
 // execution; never infer authorization merely from an event payload.
 const current=comments.find(c=>c.id===event.comment.id);
 if(!current||current.user?.login!==contract.reviewer||
    normalize(current.body)!==normalize(reviewerApprovalText))
  return {status:"approval_missing_or_changed"};
 if(hasBeenNotified(comments,event.comment.id))
  return {status:"already_notified"};
 const message=notificationBody(event,env.GITHUB_SHA);
 await requestGitHub({token:env.GITHUB_TOKEN,method:"POST",path:issuePath,
  body:{body:message}});
 return {status:"approval_notice_posted"};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runApprovalWatch().then(result=>{
  process.stdout.write(result.status+"\n");
 }).catch(error=>{
  // Fail closed: do not print event bodies, database contents or token.
  process.stderr.write("quotation_approval_watch_failed: "+error.message+"\n");
  process.exitCode=1;
 });
}
