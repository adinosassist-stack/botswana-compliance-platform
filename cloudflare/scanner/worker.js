const enc=new TextEncoder();
const ALLOWED_MIME=new Set([
  "application/pdf","image/png","image/jpeg","text/plain","text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const DEFAULT_MAX=3_500_000;
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}})}
async function hmacHex(secret,value){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,enc.encode(value));return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function sha256Hex(buf){const out=await crypto.subtle.digest("SHA-256",buf);return [...new Uint8Array(out)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function safeEq(a,b){a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
function fileNameForMime(mime,id){const ext={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg","text/plain":"txt","text/csv":"csv","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx"}[mime]||"bin";return `evidence-${String(id).replace(/[^a-f0-9-]/gi,"").slice(0,36)}.${ext}`}
async function signedJson(env,data,status=200){const text=JSON.stringify(data),signature=await hmacHex(env.EVIDENCE_SCAN_SECRET,text);return new Response(text,{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-evidence-scan-signature":signature}})}
async function readBounded(req,max){const declared=Number(req.headers.get("content-length")||0);if(declared&&declared>max)throw new Error("file_too_large");const body=await req.arrayBuffer();if(body.byteLength<1||body.byteLength>max)throw new Error("file_too_large");return body}
export default {async fetch(req,env){
  const url=new URL(req.url);
  if(url.pathname==="/health"&&req.method==="GET"){
    const configured=!!env.CLOUDMERSIVE_API_KEY&&!!env.EVIDENCE_SCAN_SECRET;
    return configured?json({ok:true,scanner:"cloudmersive"}):json({ok:false,error:"scanner_not_configured"},503);
  }
  if(url.pathname!=="/scan"||req.method!=="POST")return json({error:"not_found"},404);
  if(!env.EVIDENCE_SCAN_SECRET||!env.CLOUDMERSIVE_API_KEY)return json({error:"scanner_not_configured"},503);
  const evidenceId=String(req.headers.get("x-evidence-id")||""),claimedSha=String(req.headers.get("x-evidence-sha256")||"").toLowerCase(),claimSig=String(req.headers.get("x-evidence-signature")||"").toLowerCase(),mime=String(req.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  if(!/^[a-f0-9-]{32,36}$/i.test(evidenceId)||!/^[a-f0-9]{64}$/.test(claimedSha)||!/^[a-f0-9]{64}$/.test(claimSig))return signedJson(env,{evidenceId,sha256:claimedSha,verdict:"error",provider:"thebe-cloudmersive",error:"invalid_scan_envelope"},400);
  if(!ALLOWED_MIME.has(mime))return signedJson(env,{evidenceId,sha256:claimedSha,verdict:"error",provider:"thebe-cloudmersive",error:"unsupported_file_type"},415);
  const max=Math.min(DEFAULT_MAX,Math.max(1,Number(env.MAX_SCAN_BYTES)||DEFAULT_MAX));let body;
  try{body=await readBounded(req,max)}catch{return signedJson(env,{evidenceId,sha256:claimedSha,verdict:"error",provider:"thebe-cloudmersive",error:"file_too_large"},413)}
  const actualSha=await sha256Hex(body);if(!safeEq(actualSha,claimedSha))return signedJson(env,{evidenceId,sha256:actualSha,verdict:"error",provider:"thebe-cloudmersive",error:"sha256_mismatch"},409);
  const expectedSig=await hmacHex(env.EVIDENCE_SCAN_SECRET,`${evidenceId}:${claimedSha}:${body.byteLength}`);if(!safeEq(expectedSig,claimSig))return signedJson(env,{evidenceId,sha256:actualSha,verdict:"error",provider:"thebe-cloudmersive",error:"signature_invalid"},401);
  const providerUrl=String(env.CLOUDMERSIVE_SCAN_URL||"https://api.cloudmersive.com/virus/scan/file");
  if(providerUrl!=="https://api.cloudmersive.com/virus/scan/file")return signedJson(env,{evidenceId,sha256:actualSha,verdict:"error",provider:"thebe-cloudmersive",error:"provider_url_invalid"},503);
  const form=new FormData();form.append("inputFile",new Blob([body],{type:mime}),fileNameForMime(mime,evidenceId));
  let res,data={};
  try{res=await fetch(providerUrl,{method:"POST",headers:{Apikey:String(env.CLOUDMERSIVE_API_KEY)},body:form,redirect:"error"});data=await res.json()}catch{return signedJson(env,{evidenceId,sha256:actualSha,verdict:"error",provider:"cloudmersive",error:"provider_unavailable"},502)}
  if(!res.ok||typeof data?.CleanResult!=="boolean")return signedJson(env,{evidenceId,sha256:actualSha,verdict:"error",provider:"cloudmersive",error:`provider_http_${res.status}`},502);
  const viruses=Array.isArray(data.FoundViruses)?data.FoundViruses:[],clean=data.CleanResult===true&&viruses.length===0;
  const malwareName=clean?null:String(viruses[0]?.VirusName||"malware_detected").slice(0,160);
  return signedJson(env,{evidenceId,sha256:actualSha,verdict:clean?"clean":"infected",provider:"cloudmersive",malwareName});
}};
export const __scannerTest=Object.freeze({ALLOWED_MIME,DEFAULT_MAX,fileNameForMime,safeEq});
