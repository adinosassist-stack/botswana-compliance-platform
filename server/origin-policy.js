export function normalizeHttpsOrigin(value){
  try{
    const raw=String(value||"").trim();
    if(!raw||raw==="null")return null;
    const u=new URL(raw);
    if(u.protocol!=="https:"||u.username||u.password||u.origin==="null")return null;
    return u.origin;
  }catch{return null}
}

export function requestOriginAllowed(originHeader,configuredOrigin){
  if(originHeader===undefined||originHeader===null||String(originHeader).trim()==="")return true;
  const allowed=normalizeHttpsOrigin(configuredOrigin),incoming=normalizeHttpsOrigin(originHeader);
  return !!allowed&&!!incoming&&incoming===allowed;
}
export function fetchMetadataAllowsBrowserMutation(secFetchSite){
  const site=String(secFetchSite||"").trim().toLowerCase();
  if(!site)return true;
  return site==="same-origin"||site==="none";
}
