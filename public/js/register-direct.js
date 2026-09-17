(()=>{
"use strict";
const form=document.getElementById("registerForm"),btn=document.getElementById("submitBtn"),status=document.getElementById("status");
const encoder=new TextEncoder();
const client=window.BW?.api?.createClient?.({getCsrfToken:()=>"",onUnauthorized:()=>{},onError:()=>{}});
function setStatus(message,type="bad"){status.textContent=message;status.className=`status show ${type}`}
async function api(path,options={}){if(!client)throw new Error("Registration service is not ready. Reload and try again.");return client.request(path,options)}
function leadingZeroBits(bytes,bits){let remaining=Number(bits)||0;for(const value of bytes){if(remaining<=0)return true;const take=Math.min(8,remaining);if((value>>(8-take))!==0)return false;remaining-=take}return remaining<=0}
async function solveProof(){
 const challenge=await api("/api/auth/registration-proof/challenge",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 const token=String(challenge?.token||""),difficulty=Number(challenge?.difficulty||0);
 if(!token||difficulty<8||difficulty>16)throw new Error("Registration protection is not ready. Reload and try again.");
 for(let counter=0;counter<=500000;counter++){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(`${token}:${counter}`)));
  if(leadingZeroBits(digest,difficulty))return JSON.stringify({challenge:token,counter,honeypot:String(document.getElementById("website")?.value||"")});
  if(counter&&counter%512===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 throw new Error("Registration protection could not complete. Reload and try again.")
}
async function requestPasswordRecovery(email){
 try{
  await api("/api/auth/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
  return true;
 }catch{return false}
}
async function showSecureExistingAccountRecovery(email){
 btn.textContent="Securing account recovery…";
 const requested=await requestPasswordRecovery(email);
 if(requested)setStatus("This email may already have an account. Registration never replaces an existing password. If the account exists, password recovery instructions have been requested. Use the email link, then sign in.");
 else setStatus("This email may already have an account. Registration never replaces an existing password. Use Forgot password on Thebe Desk, then sign in.");
 btn.disabled=false;btn.textContent="Create account";
}
async function finishWorkspaceSelection(loginError,email,password){
 const workspaces=Array.isArray(loginError?.data?.workspaces)?loginError.data.workspaces:[];
 const preferred=workspaces.find(item=>String(item?.role||"")==="owner")||workspaces[0];
 const tenantId=String(preferred?.tenantId||"").trim();
 if(!tenantId)throw loginError;
 await api("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password,tenantId})});
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
  await api("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyName,email,password,turnstileToken:proof})});
  btn.textContent="Signing in…";
  try{
   await api("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
   setStatus("Account access confirmed. Opening your workspace…","good");
   location.href="/app/";
   return;
  }catch(loginError){
   if(loginError?.code==="workspace_selection_required"){
    try{
     btn.textContent="Opening owner workspace…";
     await finishWorkspaceSelection(loginError,email,password);
     setStatus("Account access confirmed. Opening your owner workspace…","good");
     location.href="/app/";
     return;
    }catch(selectionError){
     if(selectionError?.code==="invalid_credentials"){await showSecureExistingAccountRecovery(email);return}
     setStatus(selectionError?.message||"We couldn't open the selected workspace securely. Sign in from Thebe Desk and choose your workspace.");
     btn.disabled=false;btn.textContent="Create account";
     return;
    }
   }
   if(loginError?.code==="invalid_credentials"){await showSecureExistingAccountRecovery(email);return}
   setStatus(loginError?.message||"We couldn't confirm the account securely. Return to Thebe Desk sign in or use Forgot password if needed.");
   btn.disabled=false;btn.textContent="Create account";
  }
 }catch(error){
  if(error?.code==="registration_not_confirmed"){await showSecureExistingAccountRecovery(email);return}
  setStatus(error?.message||"Account creation could not complete. Try again.");btn.disabled=false;btn.textContent="Create account";
 }
});
})();