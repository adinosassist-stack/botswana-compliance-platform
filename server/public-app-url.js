import {normalizeHttpsOrigin} from "./origin-policy.js";

export function validPublicAppUrl(value){
  try{
    const u=new URL(String(value||"").trim());
    if(u.protocol!=="https:"||u.username||u.password||u.origin==="null")return null;
    return u;
  }catch{return null}
}

export function publicUrlConfig(publicOrigin,publicAppUrl){
  const origin=normalizeHttpsOrigin(publicOrigin),app=validPublicAppUrl(publicAppUrl);
  return {ok:!!origin&&!!app&&app.origin===origin,origin,app};
}

export function buildPasswordResetUrl(publicAppUrl,token){
  const app=validPublicAppUrl(publicAppUrl);if(!app)return null;
  app.search="";app.hash=`reset_token=${encodeURIComponent(String(token||""))}`;return app.toString();
}
