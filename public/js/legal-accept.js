(()=>{
"use strict";
const accept=document.getElementById("legalAccept"),submit=document.getElementById("legalContinue"),status=document.getElementById("legalStatus"),signOut=document.getElementById("legalSignOut");
let csrfToken="";
function setStatus(message,type=""){status.textContent=message;status.className=`status${type?` ${type}`:""}`}
async function jsonFetch(path,options={}){
 const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options});
 let body={};try{body=await response.json()}catch{}
 if(!response.ok){const error=new Error(body?.message||body?.error||"Request failed");error.code=body?.error||"request_failed";throw error}
 return body;
}
async function loadSession(){
 try{
  const me=await jsonFetch("/api/auth/me");
  csrfToken=String(me?.csrfToken||"");
  if(!csrfToken)throw new Error("Secure session could not be verified.");
 }catch(error){
  setStatus("Sign in again to review the legal terms securely.");
  submit.disabled=true;
  setTimeout(()=>{location.href="/auth/?mode=login&next=%2Flegal-accept%2F"},700);
 }
}
submit?.addEventListener("click",async()=>{
 if(!accept?.checked){setStatus("Agree to the Terms of Service and acknowledge the Privacy Notice to continue.");accept?.focus();return}
 if(!csrfToken){setStatus("Secure session is still loading. Try again.");return}
 submit.disabled=true;submit.textContent="Recording acceptance…";setStatus("");
 try{
  await jsonFetch("/api/auth/legal-acceptance",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify({accepted:true})});
  setStatus("Acceptance recorded. Opening your workspace…","good");
  location.replace("/app/");
 }catch(error){setStatus(error?.message||"Acceptance could not be recorded. Try again.");submit.disabled=false;submit.textContent="Accept and open workspace"}
});
signOut?.addEventListener("click",async()=>{try{await jsonFetch("/api/auth/logout",{method:"POST",headers:{"x-csrf-token":csrfToken}})}catch{}location.replace("/auth/?mode=login")});
loadSession();
})();
