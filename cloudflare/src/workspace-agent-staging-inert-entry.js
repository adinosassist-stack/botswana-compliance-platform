// Source-only private Workspace Agent staging placeholder.
// NEVER used to activate Agent tasks, authenticate customers, or expose /app.
// This Worker has no bindings, no public routes, no remote service calls.
// The bundle is intentionally inert: ALL requests, regardless of method or
// pathname, receive the same non-disclosing 404 response.
const NO_STORE_HEADERS=Object.freeze({
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
});
const BODY=JSON.stringify({error:"not_found"});
export default Object.freeze({
  async fetch(){
    return new Response(BODY,{status:404,headers:NO_STORE_HEADERS});
  }
});
