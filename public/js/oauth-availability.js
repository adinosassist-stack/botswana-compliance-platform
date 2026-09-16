(()=>{
"use strict";

const PROVIDER_SELECTORS={
  google:'.social-auth-btn.google,#googleAuthButton,[data-bw-onclick*="google"]',
  facebook:'.social-auth-btn.facebook,#facebookAuthButton,[data-bw-onclick*="facebook"]'
};

function rememberHidden(element,key){
  if(!(key in element.dataset))element.dataset[key]=element.hidden?"1":"0";
}

function restoreHidden(element,key){
  if(!(key in element.dataset))return;
  element.hidden=element.dataset[key]==="1";
}

function setElementsHidden(selector,hidden,key){
  for(const element of document.querySelectorAll(selector)){
    rememberHidden(element,key);
    if(hidden)element.hidden=true;
    else restoreHidden(element,key);
  }
}

function setProvider(provider,enabled){
  const root=document.documentElement;
  root.classList.toggle(`oauth-${provider}-disabled`,!enabled);
  root.classList.toggle(`oauth-${provider}-enabled`,enabled);
  setElementsHidden(PROVIDER_SELECTORS[provider],!enabled,"thebeOauthInitialHidden");
  const status=document.getElementById(`${provider}LinkStatus`);
  if(status){
    if(!("thebeOauthInitialText" in status.dataset))status.dataset.thebeOauthInitialText=status.textContent||"";
    status.textContent=enabled?status.dataset.thebeOauthInitialText:"Unavailable";
  }
}

function setRegistrationMode(mode){
  const normalized=["hold","cohort","open"].includes(String(mode||"").toLowerCase())?String(mode).toLowerCase():"invalid";
  const closed=normalized==="hold"||normalized==="invalid";
  const root=document.documentElement;
  for(const value of ["hold","cohort","open","invalid"])root.classList.toggle(`registration-${value}`,normalized===value);

  setElementsHidden("#registerTab",closed,"thebeRegistrationInitialHidden");
  setElementsHidden(".marketing-start-action",closed,"thebeRegistrationInitialHidden");

  const form=document.getElementById("registerForm");
  if(form){
    rememberHidden(form,"thebeRegistrationInitialHidden");
    if(closed)form.hidden=true;
    else restoreHidden(form,"thebeRegistrationInitialHidden");

    let notice=document.getElementById("registrationHoldNotice");
    if(closed){
      if(!notice){
        notice=document.createElement("p");
        notice.id="registrationHoldNotice";
        notice.className="muted";
        notice.setAttribute("role","status");
        form.parentNode?.insertBefore(notice,form);
      }
      notice.textContent=normalized==="invalid"
        ?"Registration is temporarily unavailable while launch controls are being repaired."
        :"New customer registration is temporarily on hold while launch verification is completed.";
      notice.hidden=false;
    }else if(notice){
      notice.hidden=true;
    }
  }
}

function failClosed(){
  setProvider("google",false);
  setProvider("facebook",false);
  setRegistrationMode("hold");
}

function apiClient(){
  const factory=window.BW?.api?.createClient;
  return typeof factory==="function"?factory({timeoutMs:8000,retries:0}):null;
}

async function refresh(){
  failClosed();
  const client=apiClient();
  if(!client)return;

  try{
    const providers=await client.request("/api/auth/oauth/providers",{method:"GET",cache:"no-store"});
    setProvider("google",providers?.google===true);
    setProvider("facebook",providers?.facebook===true);
  }catch{}

  try{
    const policy=await client.request("/api/auth/registration-policy",{method:"GET",cache:"no-store"});
    setRegistrationMode(policy?.mode);
  }catch{}
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh,{once:true});
else refresh();
})();
