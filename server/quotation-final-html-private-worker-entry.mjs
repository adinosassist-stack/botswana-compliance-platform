/**
 * Intentionally inert Worker entrypoint for future reviewed Browser Run staging.
 * It has no public or internal HTTP actions. Only explicitly authorized
 * service-binding host code can separately call the named preview factory.
 */
export {createFinalLovelyPrivatePdfPreviewHost}
 from "./quotation-final-html-private-preview-host.mjs";
export default Object.freeze({
 async fetch(){
  return new Response("Not Found",{status:404,headers:{
   "cache-control":"private, no-store","x-content-type-options":"nosniff"
  }});
 }
});
