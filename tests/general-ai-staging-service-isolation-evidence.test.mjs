import test from "node:test";
import assert from "node:assert/strict";
import {validateStagingServiceIsolation as validate} from "../scripts/general-ai-staging-service-isolation-evidence.mjs";
const sourceSha="a".repeat(40);
const inventory={serviceBindingEnvironment:"production",serviceIsolationAttested:false};
const evidence=()=>({verified:true,scope:"general-ai-private-staging",reference:"receipt.independent.isolation",sourceSha,accountId:"ddd23cab31928a4bb3d4998df9b26d1d",consumer:"bw-general-ai-private-queue-acceptance",service:"bw-general-ai-staging",queue:"bw-general-ai-private-acceptance-queue",nonceDb:"71e2d394-7dec-4878-bdc8-afe8f73cf541",stagingOnly:true,productionResourcesTouched:false,publicRoutes:0,productionAiEnabled:false,independentReviewer:"thusico",reviewerApproved:true,protectedRunUrl:"https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42484911897"});
test("a production environment label alone is not a reason to approve or reject independently verified staging isolation",()=>{assert.equal(validate({sourceSha,inventory,evidence:evidence()}).verified,true)});
test("rejects incorrect SHA, account, resources, reviewer, public route and production access",()=>{
 for(const [key,value] of [["sourceSha","b".repeat(40)],["accountId","wrong"],["consumer","other"],["service","customer-ai"],["queue","wrong"],["nonceDb","wrong"],["stagingOnly",false],["productionResourcesTouched",true],["publicRoutes",1],["productionAiEnabled",true],["independentReviewer","owner"],["reviewerApproved",false],["protectedRunUrl","https://example.com"],["verified",false],["scope","production"]]){
  const e=evidence();e[key]=value;assert.throws(()=>validate({sourceSha,inventory,evidence:e}),key);
 }
});
test("rejects untrusted inventory, missing evidence, reused run URL",()=>{
 assert.throws(()=>validate({sourceSha,inventory:{...inventory,serviceIsolationAttested:true},evidence:evidence()}));
 assert.throws(()=>validate({sourceSha,inventory,evidence:null}));
 const e=evidence();e.reference=e.protectedRunUrl;assert.throws(()=>validate({sourceSha,inventory,evidence:e}));
});
