// Synthetic-only workspace responsiveness evidence. No customer identifiers or network payloads.
const whole=value=>Number.isFinite(value)&&value>=0?Math.round(value):0;
export function summarizeWorkspaceNavigationPerformance(samples){
 const valid=(Array.isArray(samples)?samples:[]).filter(sample=>sample&&/^[a-zA-Z0-9_-]{1,80}$/.test(sample.view)&&Number.isFinite(sample.activateMs)&&sample.activateMs>=0&&Number.isFinite(sample.settledFrameMs)&&sample.settledFrameMs>=0);
 const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:0;
 const activation=valid.map(sample=>sample.activateMs);
 const settled=valid.map(sample=>sample.settledFrameMs);
 const longTaskCount=valid.reduce((n,s)=>n+whole(s.longTaskCount),0);
 const totalLongTaskMs=valid.reduce((n,s)=>n+whole(s.longTaskTotalMs),0);
 const slowest=valid.slice().sort((a,b)=>b.settledFrameMs-a.settledFrameMs)[0];
 return {
  views:valid.length,
  activationP50Ms:whole(percentile(activation,0.5)),
  activationP95Ms:whole(percentile(activation,0.95)),
  settledFrameP95Ms:whole(percentile(settled,0.95)),
  slowestView:slowest?.view||'',
  slowestSettledFrameMs:whole(slowest?.settledFrameMs),
  longTasksOver50ms:longTaskCount,
  totalLongTaskMs,
  worstLongTaskMs:whole(Math.max(0,...valid.map(s=>s.worstLongTaskMs||0)))
 };
}
