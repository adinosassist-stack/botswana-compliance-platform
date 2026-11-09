import test from 'node:test';
import assert from 'node:assert/strict';
import {householdLedger, canAccessHousehold} from '../server/thebe-life/household-ledger.mjs';
import {canMotsheloAction,evaluateMotsheloDisbursement,contributionStatus} from '../server/thebe-life/motshelo-governance.mjs';
import {validatePartner,reconcileInsuranceCommission} from '../server/thebe-life/insurance-partners.mjs';
const entry=(id,type,amountMinor,extra={})=>({id,householdId:'family1',type,amountMinor,occurredOn:'2026-11-08',...extra});
test('household commitments do not inflate expenses and transfers do not inflate earned income',()=>{
 const v=householdLedger([entry('a','income',2000000),entry('b','expense',1000000),entry('c','commitment',100000),entry('d','transfer_in',50000,{transferId:'transferA'})],'family1');
 assert.equal(v.budgetRemainingMinor,900000);
 assert.equal(v.incomeMinor,2000000);
 assert.equal(v.cashMovementMinor,1050000);
});
test('rejects cross-household entries and duplicate identifiers',()=>{
 assert.throws(()=>householdLedger([entry('a','income',100)],'family2'),/scope/);
 assert.throws(()=>householdLedger([entry('a','income',100),entry('a','expense',1)],'family1'),/duplicate/);
});
test('household access fails closed',()=>{
 const membership={userId:'u1',householdId:'family1',status:'active',role:'viewer'};
 assert.equal(canAccessHousehold({actorId:'u1',householdId:'family1',membership,action:'read'}),true);
 assert.equal(canAccessHousehold({actorId:'u1',householdId:'family1',membership,action:'write_entry'}),false);
 assert.equal(canAccessHousehold({actorId:'u2',householdId:'family1',membership,action:'read'}),false);
});
test('motshelo member cannot record contributions',()=>{
 assert.equal(canMotsheloAction({actorId:'u1',groupId:'g1',membership:{userId:'u1',groupId:'g1',status:'active',role:'member'},action:'record_contribution'}),false);
});
test('no self approval and no payout from unverified contributions',()=>{
 const request={id:'p1',groupId:'g1',requestedBy:'u1',amountMinor:10000};
 const approvals=[{requestId:'p1',groupId:'g1',reviewerId:'u1',reviewerRole:'chair',memberActive:true,decision:'approve'}];
 assert.equal(evaluateMotsheloDisbursement({request,approvals,verifiedClearedMinor:10000}).eligible,false);
 assert.equal(evaluateMotsheloDisbursement({request,approvals:[],verifiedClearedMinor:null}).reason,'cleared_funds_unverified');
});
test('two independent committee approvals qualify review, never execute transfers',()=>{
 const request={id:'p1',groupId:'g1',requestedBy:'u1',amountMinor:10000};
 const approvals=['u2','u3'].map((reviewerId,i)=>({requestId:'p1',groupId:'g1',reviewerId,reviewerRole:i?'secretary':'chair',memberActive:true,decision:'approve'}));
 assert.equal(evaluateMotsheloDisbursement({request,approvals,verifiedClearedMinor:9999}).eligible,false);
 assert.equal(evaluateMotsheloDisbursement({request,approvals,verifiedClearedMinor:10000}).reason,'review_qualified_only_no_execution');
});
test('reported contributions cannot exceed verification progression',()=>{
 assert.deepEqual(contributionStatus({reportedMinor:100,matchedMinor:80,clearedMinor:60}),{reportedMinor:100,matchedMinor:80,clearedMinor:60,outstandingVerificationMinor:40});
 assert.throws(()=>contributionStatus({reportedMinor:10,matchedMinor:20,clearedMinor:0}));
});
test('insurance marketplace requires regulatory and contractual checks',()=>{
 assert.equal(validatePartner({id:'insurer1',legalName:'Insurer Limited',regulatorVerified:true,contractApproved:false,distributionPermissionVerified:true}).eligibleForMarketplace,false);
 assert.equal(validatePartner({id:'insurer1',legalName:'Insurer Limited',regulatorVerified:true,contractApproved:true,distributionPermissionVerified:true}).eligibleForMarketplace,true);
});
test('insurance commission not recognized before statement settlement',()=>{
 const x=reconcileInsuranceCommission({partnerEligible:true,statement:{policyReference:'P1',currency:'BWP',premiumMinor:25000,status:'issued'},premiumVerified:true,contractRateBasisPoints:1000});
 assert.equal(x.earnedMinor,null);
 assert.equal(x.estimatedContractAmountMinor,2500);
 assert.equal(reconcileInsuranceCommission({partnerEligible:false}).state,'blocked_partner_not_approved');
});
