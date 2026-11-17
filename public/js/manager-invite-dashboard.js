// #2578 private staging: restricted read-only dashboard for invited branch managers.
// Never fetch the unscoped workspace state or trust a client-selected tenant/location.
const status=document.querySelector('#status'),locations=document.querySelector('#locations');
const totals=document.querySelector('#totals'),reports=document.querySelector('#reports');
const show=(parent,value)=>{const li=document.createElement('li');li.textContent=value;parent.append(li)};
(async()=>{
 try{
  const me=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!me.ok)throw new Error('sign_in_required');
  const session=await me.json();
  if(session?.user?.role!=='manager')throw new Error('manager_role_required');
  const options={credentials:'same-origin',cache:'no-store',redirect:'error'};
  const [overviewResponse,reportsResponse]=await Promise.all([
   fetch('/api/workspace/managers/my-dashboard',options),
   fetch('/api/workspace/managers/my-reports',options)
  ]);
  if(!overviewResponse.ok||!reportsResponse.ok)throw new Error('manager_scope_unavailable');
  const [overview,reportData]=await Promise.all([overviewResponse.json(),reportsResponse.json()]);
  if(overview?.scope!=='assigned_locations_only'||!Array.isArray(overview.locations)||!Array.isArray(reportData?.reports))throw new Error('invalid_response');
  for(const location of overview.locations)show(locations,String(location.name||location.town||'Assigned location'));
  if(!overview.locations.length)show(locations,'No location assigned yet. Ask the company owner to assign a location.');
  totals.textContent=String(Number(overview.reports||0))+' reports · '+String(Number(overview.needsAttention||0))+' need attention';
  for(const report of reportData.reports.slice(0,50))show(reports,String(report.report_date||'Report')+' — '+String(report.work_summary||'No summary').slice(0,160));
  status.textContent='Signed in as a manager. Your data is restricted to assigned locations.';
 }catch{
  status.textContent='Manager access is unavailable or no active invitation/location assignment exists. Sign in, or ask the owner to check your invitation.';
 }
})();