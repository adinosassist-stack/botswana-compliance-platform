(()=>{
"use strict";
const form=document.getElementById("registerForm"),btn=document.getElementById("submitBtn"),status=document.getElementById("status");
const encoder=new TextEncoder();
function setStatus(message,type="bad"){status.textContent=message;status.className=`status show ${type}`}
function apiTunnel(path){const u=new URL("/",location.origin);u.searchParams.set("__thebe_api_path",path);return u.href}
async function api(path,options={}){
 const response=await fetch(apiTunnel(path),{method:options.method||"GET",headers:{accept:"application/json",...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})},body:options.body,credentials:"same-origin",cache:"no-store",redirect:"error"});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok){const error=new Error(String(data?.message||data?.error||`Request failed (${response.status})`));error.status=response.status;error.code=data?.error||"request_failed";throw error}
 return data
}
function leadingZeroBits(bytes,bits){let remaining=Number(bits)||0;for(const value of bytes){if(remaining<=0)return true;const take=Math.min(8,remaining);if((value>>(8-take))!==0)return false;remaining-=take}return remaining<=0}
async function solveProof(){
 const challenge=await api("/api/auth/registration-proof/challenge",{method:"POST",body:"{}"});
 const token=String(challenge?.token||""),difficulty=Number(challenge?.difficulty||0);
 if(!token||difficulty<8||difficulty>16)throw new Error("Registration protection is not ready. Reload and try again.");
 for(let counter=0;counter<=500000;counter++){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(`${token}:${counter}`)));
  if(leadingZeroBits(digest,difficulty))return JSON.stringify({challenge:token,counter,honeypot:String(document.getElementById("website")?.value||"")});
  if(counter&&counter%512===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 throw new Error("Registration protection could not complete. Reload and try again.")
}
form?.addEventListener("submit",async event=>{
 event.preventDefault();status.className="status";
 const companyName=String(document.getElementById("companyName")?.value||"").trim();
 const email=String(document.getElementById("email")?.value||"").trim().toLowerCase();
 const password=String(document.getElementById("password")?.value||"");
 if(companyName.length<2){setStatus("Enter a business name with at least 2 characters.");return}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setStatus("Enter a valid email address.");return}
 if(password.length<12){setStatus("Create a password with at least 12 characters.");return}
 btn.disabled=true;btn.textContent="Securing registration…";
 try{
  const proof=await solveProof();
  btn.textContent="Creating account…";
  await api("/api/auth/register",{method:"POST",body:JSON.stringify({companyName,email,password,turnstileToken:proof})});
  setStatus("Account request accepted. Return to Thebe Desk and sign in with this email.","good");
  btn.textContent="Account created";
  setTimeout(()=>{location.href="/"},1800);
 }catch(error){setStatus(error?.message||"Account creation could not complete. Try again.");btn.disabled=false;btn.textContent="Create account"}
});
})();
