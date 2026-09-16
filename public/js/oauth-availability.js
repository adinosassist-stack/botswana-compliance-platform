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

async function refresh(){
  failClosed();
  try{
    const response=await fetch("/api/auth/oauth/providers",{
      method:"GET",
      credentials:"same-origin",
      headers:{accept:"application/json"},
      cache:"no-store"
    });
    if(!response.ok)return;
    const body=await response.json();
    setProvider("google",body?.google===true);
    setProvider("facebook",body?.facebook===true);
  }catch{}
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh,{once:true});
else refresh();
})();
