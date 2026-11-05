// Read-only, synthetic-only quality evidence gate. No credentials, network calls or production writes.
import {summarizeWorkspaceNavigationPerformance,assertWorkspaceNavigationResponsiveness} from './workspace-navigation-performance-summary.mjs';
const slug=/^[a-zA-Z0-9_-]{1,80}$/;
const finiteNonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function evaluateSaasQualityEvidence(input){
 const failures=[];
 const samples=input?.navigationSamples;
 if(!Array.isArray(samples)||samples.length===0)failures.push('navigation_samples_missing');
 else {
  const seen=new Set();
  for(const s of samples){
   if(!s||!slug.test(s.view||'')){failures.push('invalid_route_identifier');continue;}
   if(seen.has(s.view))failures.push('duplicate_route_sample');
   seen.add(s.view);
   for(const k of ['activateMs','settledFrameMs','worstLongTaskMs','longTaskCount','longTaskTotalMs'])
    if(!finiteNonnegative(s[k]))failures.push('invalid_navigation_metric');
   if(s.longTaskSupported!==true)failures.push('long_task_observer_unavailable');
   if(finiteNonnegative(s.worstLongTaskMs)&&finiteNonnegative(s.longTaskTotalMs)&&s.worstLongTaskMs>s.longTaskTotalMs)failures.push('inconsistent_long_task_totals');
   if(s.longTaskCount===0&&(s.worstLongTaskMs!==0||s.longTaskTotalMs!==0))failures.push('inconsistent_zero_long_tasks');
  }
  if(failures.length===0)try{assertWorkspaceNavigationResponsiveness(samples);}catch{failures.push('navigation_budget_exceeded');}
 }
 const required=['exactSha','ciPassed','independentReview','stagingSmokePassed','tenantIsolationPassed','recoveryQualified'];
 if(!/^[a-f0-9]{40}$/.test(input?.exactSha||''))failures.push('exact_sha_missing');
 for(const key of required.slice(1))if(input?.[key]!==true)failures.push(key+'_unverified');
 const summary=Array.isArray(samples)?summarizeWorkspaceNavigationPerformance(samples):null;
 return {qualified:failures.length===0,failures:[...new Set(failures)],navigation:summary?{
  views:summary.views,activationP95Ms:summary.activationP95Ms,settledFrameP95Ms:summary.settledFrameP95Ms,
  longTaskApiAvailableInAllViews:summary.longTaskApiAvailableInAllViews
 }:null};
}
