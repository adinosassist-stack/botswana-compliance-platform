// Locked bootstrap only. No application routes, storage operations or scheduled work.
export const OPS_REHEARSAL_WORKER='bw-compliance-os-ops-rehearsal';
export const OPS_REHEARSAL_D1_ID='c5c232a8-8fe7-440c-81ba-021a44fd3fdd';
export const OPS_REHEARSAL_RESTORE_D1_ID='07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8';
export const OPS_REHEARSAL_BUCKET='bw-compliance-ops-evidence';
export const OPS_REHEARSAL_PROFILE='ops-rehearsal-bootstrap-locked';

export default {
 async fetch(_request,env={}){
  const configured=env.APP_ENV==='rehearsal'&&env.DEPLOYMENT_PROFILE===OPS_REHEARSAL_PROFILE&&
   env.REHEARSAL_APP_D1_ID===OPS_REHEARSAL_D1_ID&&
   /^[a-f0-9]{40}$/.test(String(env.OPS_REHEARSAL_SOURCE_SHA||''));
  return Response.json({error:configured?'ops_rehearsal_not_qualified':'ops_rehearsal_configuration_required',
   ready:false,activationEnabled:false},
   {status:503,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
 }
};
