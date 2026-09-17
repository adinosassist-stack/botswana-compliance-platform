(()=>{
"use strict";
const $=id=>document.getElementById(id);
const form=$("authForm"),heading=$("authHeading"),intro=$("authIntro"),loginTab=$("loginTab"),registerTab=$("registerTab"),companyField=$("companyNameField"),company=$("authCompany"),email=$("authEmail"),password=$("authPassword"),workspaceField=$("workspaceField"),workspace=$("authWorkspace"),submit=$("authSubmit"),status=$("authError"),holdNotice=$("registrationHoldNotice"),signedNotice=$("signedNotice"),google=$("googleAuthButton"),facebook=$("facebookAuthButton");
const encoder=new TextEncoder();
const client=window.BW?.api?.createClient?.({getCsrfToken:()=>"",onUnauthorized:()=>{},onError:()=>{}});
const params=new URLSearchParams(location.search);
const allowedPlans=new Set(["starter","business","pro","network","partner"]);
let mode=params.get("mode")==="register"?"register":"login";
let registrationMode="invalid";
let busy=false;
function safeNext(){const raw=String(params.get("next")||"/app/").trim();return raw.startsWith("/")&&!raw.startsWith("//")?raw:"/app/"}
const next=safeNext();
function selectedPlan(){const plan=String(params.get("plan")||"business");return allowedPlans.has(plan)?plan:"business"}
function setStatus(message,type="bad"){status.textContent=String(message||"");status.className=`status show${type==="good"?" good":""}`}
function clearStatus(){status.textContent="";status.className="status"}
function setMode(nextMode){
 mode=nextMode==="register"?"register":"login";clearStatus();workspaceField.hidden=true;workspace.replaceChildren();
 const registering=mode==="register";
 companyField.hidden=!registering;password.autocomplete=registering?"new-password":"current-password";
 heading.textContent=registering?"Create your account":"Sign in";
 intro.textContent=registering?"Start a 14-day Thebe Desk workspace trial.":"Open your private Thebe Desk workspace.";
 submit.textContent=registering?"Create account & workspace":"Sign in";
 loginTab.classList.toggle("active",!registering);registerTab.classList.toggle("active",registering);
 loginTab.setAttribute("aria-selected",String(!registering));registerTab.setAttribute("aria-selected",String(registering));
 if(registering&&(registrationMode==="hold"||registrationMode==="invalid")){setMode("login");setStatus("New account registration is temporarily unavailable. Existing customers can still sign in.");}
}
async function api(path,options={}){if(!client)throw new Error("Authentication service is not ready. Reload and try again.");return client.request(path,options)}
function leadingZeroBits(bytes,bits){let remaining=Number(bits)||0;for(const value of bytes){if(remaining<=0)return true;const take=Math.min(8,remaining);if((value>>(8-take))!==0)return false;remaining-=take}return remaining<=0}
async function solveRegistrationProof(){
 const challenge=await api("/api/auth/registration-proof/challenge",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 const token=String(challenge?.token||""),difficulty=Number(challenge?.difficulty||0);
 if(!token||difficulty<8||difficulty>16)throw new Error("Registration protection is not ready. Reload and try again.");
 for(let counter=0;counter<=500000;counter++){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(`${token}:${counter}`)));
  if(leadingZeroBits(digest,difficulty))return JSON.stringify({challenge:token,counter,honeypot:""});
  if(counter&&counter%512===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 throw new Error("Registration protection could not complete. Reload and try again.")
}
function showWorkspaceChoices(error){
 const choices=Array.isArray(error?.data?.workspaces)?error.data.workspaces:[];
 if(!choices.length)return false;
 workspace.replaceChildren();
 for(const item of choices){const option=document.createElement("option");option.value=String(item?.tenantId||"");option.textContent=String(item?.tenantName||item?.name||item?.companyName||"Workspace");workspace.append(option)}
 workspaceField.hidden=false;setStatus("Choose the workspace you want to open.","good");return true;
}
async function login(payload){
 const data=await api("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
 if(data?.ok===false)throw new Error(data?.message||"Sign in failed.");
 location.replace(next);return data;
}
async function requestRecovery(address){try{await api("/api/auth/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:address})});return true}catch{return false}}
async function registerAccount(payload){
 if(registrationMode!=="open"&&registrationMode!=="cohort")throw new Error("Registration is currently unavailable.");
 const proof=await solveRegistrationProof();
 await api("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,turnstileToken:proof})});
 try{await login({email:payload.email,password:payload.password})}
 catch(error){
  if(error?.code==="workspace_selection_required"){
   const choices=Array.isArray(error?.data?.workspaces)?error.data.workspaces:[];
   const preferred=choices.find(item=>String(item?.role||"")==="owner")||choices[0];
   if(preferred?.tenantId){await login({email:payload.email,password:payload.password,tenantId:String(preferred.tenantId)});return}
  }
  if(error?.code==="invalid_credentials"){
   const requested=await requestRecovery(payload.email);
   throw new Error(requested?"This email may already have an account. Password recovery instructions have been requested.":"This email may already have an account. Use Forgot password, then sign in.")
  }
  throw error;
 }
}
async function loadCapabilities(){
 const [policyResult,providersResult]=await Promise.allSettled([api("/api/auth/registration-policy"),api("/api/auth/oauth/providers")]);
 const policy=policyResult.status==="fulfilled"?policyResult.value:null;registrationMode=["hold","cohort","open"].includes(String(policy?.mode))?String(policy.mode):"invalid";
 document.documentElement.classList.remove("registration-hold","registration-cohort","registration-open","registration-invalid");document.documentElement.classList.add(`registration-${registrationMode}`);
 const registrationAvailable=registrationMode==="open"||registrationMode==="cohort";registerTab.hidden=!registrationAvailable;holdNotice.classList.toggle("show",!registrationAvailable);
 const providers=providersResult.status==="fulfilled"?providersResult.value:{};google.hidden=providers?.google!==true;facebook.hidden=providers?.facebook!==true;
 if(mode==="register"&&!registrationAvailable)setMode("login");else setMode(mode);
}
async function detectExistingSession(){
 try{const data=await api("/api/auth/me");if(data?.user){signedNotice.classList.add("show");setTimeout(()=>location.replace(next),120);return true}}catch{}
 return false;
}
async function submitForm(event){
 event.preventDefault();if(busy)return;clearStatus();
 const address=String(email.value||"").trim().toLowerCase(),secret=String(password.value||"");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){setStatus("Enter a valid email address.");return}
 if(secret.length<12){setStatus("Use a password with at least 12 characters.");return}
 busy=true;submit.disabled=true;const original=submit.textContent;submit.textContent=mode==="register"?"Securing registration…":"Signing in…";
 try{
  if(mode==="register"){
   const companyName=String(company.value||"").trim();if(companyName.length<2)throw new Error("Enter a business name with at least 2 characters.");
   await registerAccount({companyName,email:address,password:secret,plan:selectedPlan()});
  }else{
   const payload={email:address,password:secret};if(!workspaceField.hidden&&workspace.value)payload.tenantId=workspace.value;
   try{await login(payload)}catch(error){if(error?.code==="workspace_selection_required"&&showWorkspaceChoices(error))return;throw error}
  }
 }catch(error){setStatus(error?.message||"Authentication could not complete. Try again.")}
 finally{busy=false;submit.disabled=false;submit.textContent=mode==="register"?"Create account & workspace":"Sign in";if(original&&mode==="login"&&workspaceField.hidden)submit.textContent="Sign in"}
}
function oauth(provider){if(!["google","facebook"].includes(provider))return;location.assign(`/api/auth/oauth/${provider}/start?next=${encodeURIComponent(next)}`)}
loginTab?.addEventListener("click",()=>setMode("login"));registerTab?.addEventListener("click",()=>setMode("register"));form?.addEventListener("submit",submitForm);google?.addEventListener("click",()=>oauth("google"));facebook?.addEventListener("click",()=>oauth("facebook"));
(async()=>{await loadCapabilities();await detectExistingSession()})().catch(error=>setStatus(error?.message||"Authentication service is temporarily unavailable."));
})();
