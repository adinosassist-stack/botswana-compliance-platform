// Opt-in, browser-console workspace profiling. No application bundle or tenant data changes.
// Paste this file into DevTools Sources > Snippets on an authenticated test session,
// or run it as a standalone script after the workspace has loaded.
// Call __thebeWorkspaceProfile.stop() to stop and print a bounded summary.
(()=>{
  if(globalThis.__thebeWorkspaceProfile?.stop)globalThis.__thebeWorkspaceProfile.stop();
  const samples=[], started=performance.now(), limit=300;
  let observer;
  const record=(entry)=>{
    if(samples.length>=limit)return;
    samples.push({startMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration),
      kind:entry.entryType, name:String(entry.name||"").slice(0,80)});
  };
  try{
    observer=new PerformanceObserver(list=>list.getEntries().forEach(record));
    observer.observe({type:"longtask",buffered:true});
  }catch(error){console.warn("[Thebe profile] longtask observer unavailable",error?.message);}
  const stop=()=>{
    observer?.disconnect();
    const totals=samples.reduce((s,x)=>({count:s.count+1,totalMs:s.totalMs+x.durationMs,
      maxMs:Math.max(s.maxMs,x.durationMs)}),{count:0,totalMs:0,maxMs:0});
    const output={elapsedMs:Math.round(performance.now()-started),...totals,
      longTasks:samples.slice(0,limit)};
    console.info("[Thebe profile] local-only summary",output);
    delete globalThis.__thebeWorkspaceProfile;
    return output;
  };
  globalThis.__thebeWorkspaceProfile={stop};
  console.info("[Thebe profile] recording long tasks locally; navigate views, then call __thebeWorkspaceProfile.stop()");
})();
