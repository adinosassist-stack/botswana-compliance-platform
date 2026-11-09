import test from "node:test";
import assert from "node:assert/strict";
import {preparePrivateQueueTestEnvelope,prepareQueueRollbackCheck} from "../scripts/general-ai-live-queue-execution-guardrails.mjs";
const sha="a".repeat(40),nonce="b".repeat(32);
const valid=()=>({sourceSha:sha,approvedSourceSha:sha,nonce,authorization:"AUTHORIZE_PRIVATE_STAGING_QUEUE_TEST",independentReview:true,environment:"general-ai-private-staging",queue:"bw-general-ai-private-acceptance-queue",consumerDisabled:false,productionEnabled:false});
test("staging-only approved envelope has exact keys",()=>assert.deepEqual(Object.keys(preparePrivateQueueTestEnvelope(valid())),["operation","worker","sourceSha","nonce"]));
test("every missing authorization or safety invariant blocks test envelope",()=>{
 for(const change of [{sourceSha:"bad"},{approvedSourceSha:"c".repeat(40)},{nonce:"bad"},{authorization:""},{independentReview:false},{environment:"production"},{queue:"production"},{consumerDisabled:true},{productionEnabled:true}])assert.throws(()=>preparePrivateQueueTestEnvelope({...valid(),...change}));
});
test("rollback requires disabled consumer, no routes and no production activation",()=>{
 const validRollback={consumerDisabled:true,publicRoutes:0,productionEnabled:false,sourceSha:sha,approvedSourceSha:sha};
 assert.equal(prepareQueueRollbackCheck(validRollback).consumerRestoredDisabled,true);
 for(const change of [{consumerDisabled:false},{publicRoutes:1},{productionEnabled:true},{approvedSourceSha:"c".repeat(40)}])assert.throws(()=>prepareQueueRollbackCheck({...validRollback,...change}));
});
