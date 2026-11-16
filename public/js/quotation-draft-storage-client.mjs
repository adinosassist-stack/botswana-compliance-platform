/**
 * Opt-in, non-issuing quotation draft save/reload browser transport.
 * Must be mounted only by an authenticated quotation workspace capability.
 * Company/tenant ID comes exclusively from the server session.
 */
const PATH="/api/quotation/drafts",MAX_BYTES=32768;
const deny=code=>{throw Error(code)};
async function responseJson(response){
 const length=response.headers.get("content-length");
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))
  deny("quotation_draft_response_too_large");
 if(!response.body?.getReader)deny("quotation_draft_response_unavailable");
 const reader=response.body.getReader(),chunks=[];let n=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))deny("invalid_quotation_draft_response");
   n+=value.byteLength;if(n>MAX_BYTES)deny("quotation_draft_response_too_large");
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const raw=new Uint8Array(n);let i=0;
 for(const part of chunks){raw.set(part,i);i+=part.byteLength}
 try{
  const payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
   deny("invalid_quotation_draft_response");
  return payload;
 }catch{deny("invalid_quotation_draft_response")}
}
const validId=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export function createQuotationDraftStorageClient({fetchImpl,csrfToken,enabled=false}={}){
 if(enabled!==true)deny("quotation_draft_storage_disabled");
 if(typeof fetchImpl!=="function"||typeof csrfToken!=="string"||
    csrfToken.length<12||csrfToken.length>4096)
  deny("quotation_draft_storage_unconfigured");
 async function request(path,options){
  const res=await fetchImpl(path,{
   credentials:"same-origin",redirect:"error",cache:"no-store",...options
  });
  const data=await responseJson(res);
  if(res.status===409)deny("quotation_draft_revision_conflict");
  if(!res.ok||data.ok!==true)deny("quotation_draft_storage_unavailable");
  if(!validId(data.draftId)||!Number.isSafeInteger(data.revision)||data.revision<1||
     !data.draft||typeof data.draft!=="object"||Array.isArray(data.draft))
   deny("invalid_quotation_draft_response");
  return Object.freeze({draftId:data.draftId,revision:data.revision,draft:data.draft});
 }
 return Object.freeze({
  async load(draftId){
   if(!validId(draftId))deny("invalid_draft_id");
   return request(PATH+"?id="+encodeURIComponent(draftId),{method:"GET"});
  },
  async save({draftId,revision,draft}={}){
   if(!validId(draftId)||!Number.isSafeInteger(revision)||revision<0||
      !draft||typeof draft!=="object"||Array.isArray(draft))
    deny("invalid_quotation_draft");
   const body=JSON.stringify({draftId,revision,draft});
   if(new TextEncoder().encode(body).length>MAX_BYTES)
    deny("quotation_draft_request_too_large");
   return request(PATH,{method:"PUT",headers:{
    "content-type":"application/json","x-csrf-token":csrfToken
   },body});
  }
 });
}
