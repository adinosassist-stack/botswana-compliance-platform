(()=>{
"use strict";

function installRules(){
  if(document.getElementById("thebeOauthAvailabilityRules"))return;
  const style=document.createElement("style");
  style.id="thebeOauthAvailabilityRules";
  style.textContent=`
    html.oauth-google-disabled .social-auth-btn.google,
    html.oauth-google-disabled [data-bw-onclick*="google"] { display:none !important; }
    html.oauth-facebook-disabled .social-auth-btn.facebook,
    html.oauth-facebook-disabled [data-bw-onclick*="facebook"] { display:none !important; }
  `;
  document.head.appendChild(style);
}

function setProvider(provider,enabled){
  const root=document.documentElement;
  root.classList.toggle(`oauth-${provider}-disabled`,!enabled);
  root.classList.toggle(`oauth-${provider}-enabled`,enabled);
  const status=document.getElementById(`${provider}LinkStatus`);
  if(status&&!enabled)status.textContent="Unavailable";
}

function failClosed(){
  installRules();
  setProvider("google",false);
  setProvider("facebook",false);
}

function apiClient(){
  const factory=window.BW?.api?.createClient;
  return typeof factory==="function"?factory({timeoutMs:8000,retries:0}):null;
}

async function refresh(){
  failClosed();
  try{
    const client=apiClient();
    if(!client)return;
    const body=await client.request("/api/auth/oauth/providers",{method:"GET",cache:"no-store"});
    setProvider("google",body?.google===true);
    setProvider("facebook",body?.facebook===true);
  }catch{}
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh,{once:true});
else refresh();
})();
