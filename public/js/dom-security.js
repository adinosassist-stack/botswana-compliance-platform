(function bootstrapBwDom(global){
  "use strict";

  // Production browser-recovery boundary. Older Thebe Desk releases used a
  // persistent service worker/cache shell. On browsers that retain that origin
  // state (notably desktop Chrome), stale workers can race the live document
  // and make startup unstable. Decommission those workers without reloading,
  // navigating, or opening a new window. Run immediately for old registrations
  // and once again after DOMContentLoaded so a legacy inline register() call in
  // the current document cannot leave a new persistent worker behind.
  function installLegacyBrowserRuntimeDecommission(){
    const nav=global.navigator;
    const cleanup=async()=>{
      try{
        if(nav?.serviceWorker?.getRegistrations){
          const registrations=await nav.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration=>registration.unregister().catch(()=>false)));
        }
        if(global.caches?.keys&&global.caches?.delete){
          const keys=await global.caches.keys();
          await Promise.all(keys.filter(key=>String(key).startsWith("thebe-desk-")).map(key=>global.caches.delete(key).catch(()=>false)));
        }
      }catch(error){
        console.warn("thebe_browser_runtime_decommission_failed",error);
      }
    };
    void cleanup();
    const doc=global.document;
    if(!doc)return;
    const afterDocument=()=>global.setTimeout?.(()=>{void cleanup()},0);
    if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",afterDocument,{once:true});
    else afterDocument();
  }
  installLegacyBrowserRuntimeDecommission();

  // Root/public-gate visibility hardening: the shared HTML shell marks the
  // Compliance Passport surface as `hidden`, but older CSS did not define a
  // matching reporter-portal hidden rule. Enforce the class state directly on
  // the element so the guard remains compatible with the production CSP.
  function syncPublicPassportVisibility(gate){
    if(!gate)return;
    gate.style.display=gate.classList.contains("hidden")?"none":"";
  }
  function installPublicPassportVisibilityGuard(){
    if(!global.document)return;
    const gate=document.getElementById("publicPassportGate");
    if(!gate||gate.dataset.visibilityGuard==="1")return;
    gate.dataset.visibilityGuard="1";
    syncPublicPassportVisibility(gate);
    if(global.MutationObserver){
      const observer=new MutationObserver(()=>syncPublicPassportVisibility(gate));
      observer.observe(gate,{attributes:true,attributeFilter:["class"]});
    }
  }
  installPublicPassportVisibilityGuard();

  const BLOCKED_TAGS=new Set(["SCRIPT","IFRAME","OBJECT","EMBED","BASE","META","LINK","IMG","SVG","MATH","VIDEO","AUDIO","SOURCE","TRACK"]);
  const URL_ATTRS=new Set(["href","src","action","formaction","poster","xlink:href"]);
  const BLOCKED_ATTRS=new Set(["srcdoc","http-equiv","nonce"]);
  const DELEGATED_EVENT_ATTRS=new Set(["data-bw-onclick","data-bw-onchange","data-bw-oninput","data-bw-onsubmit","data-bw-onkeydown","data-bw-onkeyup","data-bw-onfocus"]);
  const SAFE_ID=/^[A-Za-z][A-Za-z0-9_.:-]*$/;
  const DANGEROUS_STYLE=/(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding)/i;

  function escapeHtml(value){
    return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  }
  function safeId(value){return String(value??"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,120)}
  function safeExternalUrl(value){
    try{const u=new URL(String(value||""),global.location?.origin||"https://invalid.local");return u.protocol==="https:"?u.href:"#"}catch{return "#"}
  }
  function safeHostedCheckoutUrl(value,provider=""){
    try{const u=new URL(String(value||""),global.location?.origin||"https://invalid.local");if(u.protocol!=="https:"||u.username||u.password)return "#";const p=String(provider||"").toLowerCase();if(p==="dpo"){const h=u.hostname.toLowerCase();if(h!=="3gdirectpay.com"&&!h.endsWith(".3gdirectpay.com"))return "#"}return u.href}catch{return "#"}
  }
  function safeUrl(value,{allowDataImage=false}={}){
    const raw=String(value||"").trim();
    if(!raw)return "";
    if(raw.startsWith("#")||raw.startsWith("/")||raw.startsWith("./")||raw.startsWith("../"))return raw;
    if(allowDataImage&&/^data:image\/(?:png|gif|jpeg|webp);base64,/i.test(raw))return raw;
    try{
      const u=new URL(raw,global.location?.origin||"https://invalid.local");
      if(["https:","mailto:","tel:"].includes(u.protocol))return raw;
      if(u.protocol==="http:"&&["localhost","127.0.0.1","::1"].includes(u.hostname))return raw;
    }catch{}
    return "#";
  }
  function sanitizeElement(el){
    if(BLOCKED_TAGS.has(el.tagName)){el.replaceWith(el.ownerDocument.createTextNode(el.textContent||""));return}
    for(const attr of [...el.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value;
      if(BLOCKED_ATTRS.has(name)){el.removeAttribute(attr.name);continue}
      if(name.startsWith("on")){el.removeAttribute(attr.name);continue}
      if(name.startsWith("data-bw-on")){
        if(!DELEGATED_EVENT_ATTRS.has(name)||!global.BW?.events?.isAllowedExpression?.(value)){el.removeAttribute(attr.name)}
        continue;
      }
      if(URL_ATTRS.has(name)){
        const safe=safeUrl(value,{allowDataImage:name==="src"});
        if(safe==="#"&&value!=="#")el.removeAttribute(attr.name);else el.setAttribute(attr.name,safe);continue;
      }
      if(name==="style"&&DANGEROUS_STYLE.test(value)){el.removeAttribute("style");continue}
      if(name==="id"&&!SAFE_ID.test(value)){el.removeAttribute("id");continue}
      if(name==="target"&&value==="_blank"){
        const rel=new Set(String(el.getAttribute("rel")||"").split(/\s+/).filter(Boolean));rel.add("noopener");rel.add("noreferrer");el.setAttribute("rel",[...rel].join(" "));
      }
    }
    for(const child of [...el.children])sanitizeElement(child);
  }
  function markupFragment(markup){
    const parser=new DOMParser();
    const parsed=parser.parseFromString(`<body>${String(markup??"")}</body>`,"text/html");
    for(const child of [...parsed.body.children])sanitizeElement(child);
    const frag=document.createDocumentFragment();
    for(const child of [...parsed.body.childNodes])frag.appendChild(document.importNode(child,true));
    return frag;
  }
  function renderMarkup(target,markup){if(!target)return null;target.replaceChildren(markupFragment(markup));return target}
  function setText(targetOrId,value){const el=typeof targetOrId==="string"?document.getElementById(targetOrId):targetOrId;if(el)el.textContent=value==null?"—":String(value);return el}
  function clear(target){if(target)target.replaceChildren();return target}

  if(global.Element&&!Object.getOwnPropertyDescriptor(Element.prototype,"safeHTML")){
    Object.defineProperty(Element.prototype,"safeHTML",{configurable:false,enumerable:false,set(value){renderMarkup(this,value)}});
  }
  global.BW=global.BW||{};
  global.BW.dom=Object.freeze({escapeHtml,safeId,safeExternalUrl,safeHostedCheckoutUrl,safeUrl,renderMarkup,markupFragment,setText,clear});
})(window);
