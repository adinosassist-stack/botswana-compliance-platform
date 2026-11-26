// #2578 private staging: restricted read-only dashboard for invited branch managers.
// Never fetch the unscoped workspace state or trust a client-selected tenant/location.
const status=document.querySelector('#status'),locations=document.querySelector('#locations');
const totals=document.querySelector('#totals'),reports=document.querySelector('#reports');
const branch=document.querySelector('#reportBranch'),day=document.querySelector('#reportDay'),mode=document.querySelector('#reportMode');
const filterStatus=document.querySelector('#reportFilterStatus'),refresh=document.querySelector('#refreshReports');
let sessionCsrf='',reviewEnabled=false;
const api=window.BW?.api?.createClient?.({retries:0,getCsrfToken:()=>sessionCsrf});
const show=(parent,value)=>{const li=document.createElement('li');li.textContent=value;parent.append(li)};
const node=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value);return el};
let assigned=[],items=[],epoch=0;
const clear=()=>{
 assigned=[];items=[];reviewEnabled=false;sessionCsrf='';locations.replaceChildren();reports.replaceChildren();totals.textContent='';filterStatus.textContent='';
 branch.replaceChildren(new Option('All assigned locations',''));for(const el of [branch,day,mode])el.disabled=true;
};
function renderReports(){
 reports.replaceChildren();
 const filtered=items.filter(r=>(!branch.value||r.location_id===branch.value)&&(!day.value||r.report_date===day.value)&&(mode.value==='all'||mode.value==='attention'&&Number(r.needs_attention)===1||mode.value==='issues'&&Boolean(String(r.blockers||'').trim()||String(r.incidents||'').trim())));
 filterStatus.textContent=filtered.length+' of '+items.length+' recent reports shown';
 for(const r of filtered){
  const card=document.createElement('li');
  card.append(node('h3',String(r.employee_name||'Employee')+' — '+String(r.location_name||'Assigned location')),node('p',String(r.report_date||'Report date unavailable')+' · Corrections: '+Number(r.revision_count||0)));
  if(Number(r.needs_attention)===1)card.append(node('strong','Employee requested manager attention'));
  for(const [label,value] of [['Work completed',r.work_summary],['Wins',r.wins],['Blockers',r.blockers],['Incidents',r.incidents],['Next plan',r.next_plan]]){
   if(String(value||'').trim())card.append(node('p',label+': '+String(value)));
  }
  if(reviewEnabled){
   const state=r.review_status;
   card.append(node('p','Review: '+String(state||'unavailable').replaceAll('_',' ')));
   if(r.review_note)card.append(node('p','Correction reason: '+r.review_note));
   if(['pending','acknowledged'].includes(state)){
    const note=document.createElement('textarea');note.maxLength=1000;note.rows=2;note.placeholder='Correction reason (required when returning)';note.setAttribute('aria-label','Manager review note');card.append(note);
    const actions=document.createElement('div'),feedback=node('p','');feedback.setAttribute('role','status');
    for(const [action,label] of [['acknowledge','Acknowledge'],['approve','Approve'],['return','Request correction']]){
     if(action==='acknowledge'&&state==='acknowledged')continue;
     const button=node('button',label);button.type='button';
     button.addEventListener('click',async()=>{
      if(!reviewEnabled||!sessionCsrf)return;
      if(action==='return'&&note.value.trim().length<5){feedback.textContent='Enter a correction reason (at least five characters).';note.focus();return}
      const request=epoch;for(const b of actions.querySelectorAll('button'))b.disabled=true;
      try{await api.request('/api/workspace/managers/my-reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reportId:r.id,expectedRevision:Number(r.revision_count),action,note:note.value.trim()})});if(request===epoch)await load()}
      catch{if(request===epoch){feedback.textContent='Decision not confirmed. Refresh to check the current report and your access before retrying.';}}
     });actions.append(button);
    }
    card.append(actions,feedback);
   }
  }
  reports.append(card);
 }
 if(!filtered.length)show(reports,'No recent reports match these filters.');
}
async function load(){
 const request=++epoch,previousBranch=branch.value;clear();refresh.disabled=true;status.textContent='Checking manager access…';
 try{
  if(!api)throw new Error('api_unavailable');
  const session=await api.request('/api/auth/me');
  if(session?.user?.role!=='manager')throw new Error('manager_role_required');
  if(request!==epoch)return;sessionCsrf=String(session.csrfToken||'');
  const [overview,reportData]=await Promise.all([api.request('/api/workspace/managers/my-dashboard'),api.request('/api/workspace/managers/my-reports')]);
  if(request!==epoch)return;
  if(overview?.scope!=='assigned_locations_only'||!Array.isArray(overview.locations)||!Array.isArray(reportData?.reports))throw new Error('invalid_response');
  reviewEnabled=reportData.reviewEnabled===true&&!!sessionCsrf;
  assigned=overview.locations;
  const ids=new Set(assigned.map(l=>String(l.id)));
  items=reportData.reports.filter(r=>ids.has(String(r.location_id))).slice(0,50);
  for(const l of assigned){show(locations,String(l.name||l.town||'Assigned location'));branch.append(new Option(String(l.name||'Assigned location'),String(l.id)))}
  if(!assigned.length)show(locations,'No location assigned yet. Ask the company owner to assign a location.');
  if(ids.has(previousBranch))branch.value=previousBranch;
  for(const el of [branch,day,mode])el.disabled=!assigned.length;
  totals.textContent=String(Number(overview.reports||0))+' historical reports · '+String(Number(overview.needsAttention||0))+' flagged for attention';
  renderReports();status.textContent='Signed in as a manager. Your data is restricted to assigned locations.';
 }catch{
  if(request!==epoch)return;
  clear();status.textContent='Manager access is unavailable or no active invitation/location assignment exists. Sign in, or ask the owner to check your invitation.';
 }finally{if(request===epoch)refresh.disabled=false}
}
for(const el of [branch,day,mode])el.addEventListener('change',renderReports);
refresh.addEventListener('click',load);
load();
