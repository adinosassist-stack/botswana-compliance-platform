// Synthetic-owner diagnostics only. Never log raw profiles, source, URLs or locals.
export function summarizeNavigationCpuProfile(profile){
 const nodes=new Map((profile?.nodes||[]).map(node=>[node.id,node]));
 const frames=new Map();
 let sampledUs=0;
 for(const [index,id] of (profile?.samples||[]).entries()){
  const delta=profile.timeDeltas?.[index];
  if(!Number.isFinite(delta)||delta<0)continue;
  sampledUs+=delta;
  const frame=nodes.get(id)?.callFrame;
  if(!frame)continue;
  let script='engine';
  try{const url=new URL(frame.url);if(url.origin!=='https://thebedesk.com'||!/^\/js\/[A-Za-z0-9_.-]+\.js$/.test(url.pathname))continue;script=url.pathname.split('/').pop();}catch{if(frame.url)continue;}
  const name=String(frame.functionName||'(anonymous)');
  const fn=/^[A-Za-z0-9_$ .()<>-]{1,100}$/.test(name)?name:'(other)';
  const key=script+':'+fn;
  const entry=frames.get(key)||{script,function:fn,sampledMs:0,samples:0};
  entry.sampledMs+=delta/1000;entry.samples++;frames.set(key,entry);
 }
 return {sampledMs:Math.round(sampledUs/1000),topFrames:[...frames.values()].sort((a,b)=>b.sampledMs-a.sampledMs).slice(0,10).map(frame=>({...frame,sampledMs:Math.round(frame.sampledMs)}))};
}
const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('diagnostic_deadline')),ms);})]).finally(()=>clearTimeout(timer));};
export async function profileNavigationClick(page,view,click,report=console.log){
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(view))throw new Error('invalid_navigation_route');
 let session=null,started=false,completed=false;
 report('WORKSPACE_NAV_CLICK_BEGIN '+JSON.stringify({view}));
 try{
  try{
   session=await bounded(page.context().newCDPSession(page),3000);
   await bounded(session.send('Profiler.enable'),3000);
   await bounded(session.send('Profiler.setSamplingInterval',{interval:1000}),3000);
   await bounded(session.send('Profiler.start'),3000);started=true;
  }catch{report('WORKSPACE_NAV_CPU_UNAVAILABLE '+JSON.stringify({view}));}
  const result=await click();completed=true;return result;
 }finally{
  if(started){try{const {profile}=await bounded(session.send('Profiler.stop'),5000);report('WORKSPACE_NAV_CPU '+JSON.stringify({view,completed,...summarizeNavigationCpuProfile(profile)}));}catch{report('WORKSPACE_NAV_CPU_UNAVAILABLE '+JSON.stringify({view,completed}));}}
  if(session)try{await bounded(session.detach(),3000);}catch{}
 }
}
