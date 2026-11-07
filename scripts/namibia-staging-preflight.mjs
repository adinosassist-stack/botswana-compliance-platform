// Namibia candidate review-only preflight. No deploy, no secrets, no Cloudflare writes.
import {readFileSync} from "node:fs";
const config=readFileSync(new URL("../cloudflare/wrangler.namibia-internal-candidate.toml",import.meta.url),"utf8");
const live=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
const source=readFileSync(new URL("../cloudflare/src/namibia-staging-entry.js",import.meta.url),"utf8");
const key=(name)=>config.match(new RegExp("^"+name+"\\s*=\\s*\"([^\"]+)\"$","m"))?.[1];
const blocks=[...config.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\[\[|$)/g)].map(x=>x[1]);
function get(block,key){return block.match(new RegExp("^"+key+"\\s*=\\s*\"([^\"]+)\"$","m"))?.[1]}
const ids=new Map(blocks.map(x=>[get(x,"binding"),get(x,"database_id")]));
const expected=new Map([
 ["DB","cb833f28-8ea6-4234-b183-c12c018aac15"],
 ["NA_CANDIDATE_DB","c8ce1dd7-6973-45e8-be7f-1b4f2b672312"],
 ["NA_SOURCE_REVIEW_DB","b45ebf26-429d-47ae-ae88-c404c8965c5b"]
]);
const errors=[];
let checks=0;
function guard(name,condition){checks++;if(!condition)errors.push(name)}
guard("candidate_script_name",key("name")==="na-compliance-internal-candidate");
guard("entrypoint",key("main")==="src/namibia-staging-entry.js");
guard("workers_dev_off",key("workers_dev")===undefined&&/^workers_dev = false$/m.test(config));
guard("preview_urls_off",/^preview_urls = false$/m.test(config));
guard("no_custom_routes",!/\[\[routes\]\]|route\s*=|routes\s*=/.test(config));
guard("no_triggers",!/\[triggers\]|\bcrons\s*=/.test(config));
guard("no_assets",!/\[assets\]/.test(config));
guard("runtime_disabled",key("NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED")==="0"&&
  key("NAMIBIA_BINDINGS_AUDITED")==="0"&&key("NAMIBIA_INTERNAL_API_MODE")==="disabled");
guard("binding_count",ids.size===3&&blocks.length===3);
for(const [binding,id] of expected)
 guard("binding_"+binding,ids.get(binding)===id);
guard("production_db_not_bound",![...ids.values()].includes("8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"));
guard("no_sensitive_binding",!/\[secrets\]|SESSION_SECRET\s*=|PAYMENT_PROVIDER\s*=/.test(config));
guard("inert_worker",/namibia_staging_not_activated/.test(source)&&!/namibia-internal-api-candidate/.test(source));
guard("existing_production_name_preserved",/^name = "bw-compliance-os"$/m.test(live));
guard("no_deploy",!/\bwrangler\s+deploy\b/.test(config+source));
const result=Object.freeze({candidate:"NA",preflightOnly:true,commit:process.env.GITHUB_SHA||null,
  passed:errors.length===0,checks,errors,
  deploymentAuthorized:false,customerActivationAllowed:false,
  independentApprovalRequired:true,physicalBindingReviewRequired:true});
console.log(JSON.stringify(result));
if(errors.length)process.exitCode=1;
