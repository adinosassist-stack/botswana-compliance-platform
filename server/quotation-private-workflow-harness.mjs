/**
 * PRIVATE SOURCE CANDIDATE — quotation staging workflow harness.
 * NO ROUTES, CRON, PUBLIC TRIGGERS OR PRODUCTION DEPLOYMENT.
 * The existing quotation service and synthetic caller binaries are unchanged.
 *
 * Deliberately fail-closed until independent review approves an executable
 * synthetic authenticated fixture, recovery procedure and private invocation.
 */
import { WorkflowEntrypoint } from "cloudflare:workers";

const STAGE = "quotation-private-rehearsal";
const HEX=/^[a-f0-9]{64}$/i;
const TENANT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKER_HASH="09eed552bc5ef79ff3ca6b5b57e56453c0a2326e330968d47dcab39937e93274";
const CALLER_HASH="c1f650bf14454c5257dd827a9ef6857a2f15ece6e3918542d472b4929916340c";
const ORIGIN="https://quotation.internal.example.test";
function deny(reason){throw new Error("quotation-private-harness-denied:"+reason);}
function ready(env,params){
 if(env?.QUOTATION_HARNESS_ENABLED!=="reviewed-synthetic-only") deny("disabled");
 if(env?.QUOTATION_HARNESS_SOURCE_SHA!=="1172056ad4d189041a3eb15717cd7fa04b09698e")deny("source");
 if(env?.QUOTATION_WORKER_ARTIFACT_SHA256!==WORKER_HASH||
    env?.QUOTATION_CALLER_ARTIFACT_SHA256!==CALLER_HASH)deny("artifact");
 if(env?.QUOTATION_HARNESS_REMOTE_PREFLIGHT!=="independently-attested"||
    env?.QUOTATION_HARNESS_ROLLBACK!=="independently-tested")deny("unqualified");
 if(typeof env?.QUOTATION_SERVICE?.fetch!=="function"||
    typeof env?.QUOTATION_SYNTHETIC_CALLER?.fetch!=="function")deny("bindings");
 if(typeof env?.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET!=="string"||
    env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET.length<32)deny("secret");
 if(typeof env?.QUOTATION_SYNTHETIC_PROBE_SECRET!=="string"||
    env.QUOTATION_SYNTHETIC_PROBE_SECRET.length<32||
    env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET===env.QUOTATION_SYNTHETIC_PROBE_SECRET)deny("secrets");
 if(params?.scope!==STAGE||!TENANT.test(params?.syntheticTenantId||"")||
    params?.operatorAttestation!=="private-reviewer-qualified"||
    params?.workerSha256!==WORKER_HASH||params?.callerSha256!==CALLER_HASH)deny("params");
 if(params?.enableWrites===true)deny("write-test-not-yet-qualified");
}
export class QuotationPrivateRehearsal extends WorkflowEntrypoint {
 async run(event,step){
  // This harness initially supports a negative private probe ONLY.
  // Authenticated PUT/reopen tests need separately reviewed synthetic session
  // provisioning and explicit operational authorization before implementation.
  ready(this.env,event.payload);
  return step.do("anonymous-denial-only",async()=>{
   const response=await this.env.QUOTATION_SYNTHETIC_CALLER.fetch(
    new Request(ORIGIN+"/probe/anonymous",{method:"GET",headers:{
     "x-quotation-synthetic-probe":this.env.QUOTATION_SYNTHETIC_PROBE_SECRET
    }})
   );
   if(response.status!==200||
      await response.text()!=="Anonymous denial verified")deny("anonymous-not-denied");
   return {passed:true,check:"anonymous-denial",customerWrites:0,stage:STAGE};
  });
 }
}

// No externally callable HTTP interface, even if a configuration error adds a route.
export default Object.freeze({fetch(){return new Response("Not Found",{status:404,headers:{"cache-control":"private, no-store"}});}});
