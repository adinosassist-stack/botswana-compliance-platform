// Review-only Namibia staging Worker entrypoint. This is deliberately inert.
// Do not import the internal candidate API here until a separate security approval.
// Zero customer routes, no sessions, no payments, no compliance or D1 operations.
export default {
 async fetch(_request,_env,_ctx){
  return new Response(JSON.stringify({error:"namibia_staging_not_activated"}),{
   status:404,
   headers:{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff"}
  });
 }
};
