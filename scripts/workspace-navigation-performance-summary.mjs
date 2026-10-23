// Synthetic-only workspace responsiveness evidence. No customer identifiers or network payloads.
const whole=value=>Number.isFinite(value)&&value>=0?Math.round(value):0;
export function summarizeWorkspaceNavigationPerformance(samples){
 const valid=(Array.isArray(samples)?samples:[]).filter(sample=>sample&&/^[a-zA-Z0-9_-]{1,80}$/.test(sample.view)&&Number.isFinite(sample.activateMs)&&sample.activateMs>=0&&Number.isFinite(sample.settledFrameMs)&&sample.settledFrameMs>=0);
 const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:0;
 const observed=valid.filter(sample=>sample.longTaskSupported===true);
 const activation=valid.map(sample=>sample.activateMs);
 const settled=valid.map(sample=>sample.settledFrameMs);
 const longTaskCount=observed.reduce((n,s)=>n+whole(s.longTaskCount),0);
 const totalLongTaskMs=observed.reduce((n,s)=>n+whole(s.longTaskTotalMs),0);
 const slowest=valid.slice().sort((a,b)=>b.settledFrameMs-a.settledFrameMs)[0];
 return {
  views:valid.length,
  activationP50Ms:whole(percentile(activation,0.5)),
  activationP95Ms:whole(percentile(activation,0.95)),
  settledFrameP95Ms:whole(percentile(settled,0.95)),
  slowestView:slowest?.view||'',
  slowestSettledFrameMs:whole(slowest?.settledFrameMs),
  longTaskMeasuredViews:observed.length,
  longTaskApiAvailableInAllViews:valid.length>0&&observed.length===valid.length,
  longTasksOver50ms:observed.length?longTaskCount:null,
  totalLongTaskMs:observed.length?totalLongTaskMs:null,
  worstLongTaskMs:observed.length?whole(Math.max(0,...observed.map(s=>s.worstLongTaskMs||0))):null
 };
}

// Conservative freeze regression limits, not latency SLOs. Hydration/network waits
// remain reported separately through settledFrameMs and do not consume this budget.
export function assertWorkspaceNavigationResponsiveness(samples){
 if(!Array.isArray(samples)||!samples.length||summarizeWorkspaceNavigationPerformance(samples).views!==samples.length)throw new Error('Navigation responsiveness evidence missing or invalid');
 for(const sample of samples){
  if(sample.longTaskSupported!==true||!Number.isFinite(sample.worstLongTaskMs)||sample.worstLongTaskMs<0)throw new Error('Navigation blocking-task evidence unavailable');
  if(sample.activateMs>2000)throw new Error(`Navigation activation freeze: ${sample.view} exceeded 2000ms`);
  if(sample.worstLongTaskMs>1000)throw new Error(`Navigation blocking freeze: ${sample.view} exceeded 1000ms`);
 }
}
