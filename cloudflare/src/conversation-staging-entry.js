// Locked-down deployment bootstrap; not a public conversation endpoint.
// Route activation requires a separately reviewed staging-only entry integration.
export default {
 async fetch(){
  return Response.json({error:"staging_not_activated"},{status:503,headers:{"cache-control":"no-store","x-robots-tag":"noindex, nofollow"}});
 }
};
