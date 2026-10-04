(function bootstrapBwComponents(global){
  "use strict";
  function element(tag,{className="",text=null,attrs={}}={},children=[]){
    const node=document.createElement(tag);if(className)node.className=className;if(text!==null)node.textContent=String(text);
    for(const [key,value] of Object.entries(attrs)){if(value===false||value==null)continue;if(value===true)node.setAttribute(key,"");else node.setAttribute(key,String(value))}
    for(const child of children.flat()){if(child==null)continue;node.append(child instanceof Node?child:document.createTextNode(String(child)))}return node;
  }
  function renderList(target,items,renderItem,{emptyText="Nothing to show."}={}){
    if(!target)return;const frag=document.createDocumentFragment();
    if(!Array.isArray(items)||!items.length)frag.appendChild(element("div",{className:"muted small",text:emptyText}));
    else for(const item of items){const node=renderItem(item);if(node)frag.appendChild(node)}
    target.replaceChildren(frag);
  }
  global.BW=global.BW||{};global.BW.components=Object.freeze({element,renderList});
})(window);

(function installWorkspaceEntryBillingBudget(global){
  "use strict";
  if(!global.fetch||!global.document||!global.Response)return;
  const nativeFetch=global.fetch.bind(global);
  const WORKSPACE_ENTRY_BILLING_BUDGET_MS=5000;
  function isProduction(){return String(global.document.querySelector('meta[name="bw-runtime-mode"]')?.content||"production").toLowerCase()==="production"}
  function isEntryBillingRequest(input,init={}){
    if(!isProduction())return false;
    const method=String(init?.method||input?.method||"GET").toUpperCase();if(method!=="GET")return false;
    let url;try{url=new URL(typeof input==="string"?input:String(input?.url||input||""),global.location?.href||"https://invalid.local/")}catch{return false}
    if(!global.location?.origin||url.origin!==global.location.origin)return false;
    const logicalBilling=url.pathname==="/api/billing/status"||url.pathname==="/__thebe_api/billing/status"||(url.pathname==="/"&&url.searchParams.get("__thebe_api_path")==="/api/billing/status");
    if(!logicalBilling)return false;
    const shell=global.document.getElementById("appShell");return !!shell&&shell.style.visibility==="hidden";
  }
  global.fetch=async function workspaceEntrySafeFetch(input,init={}){
    if(!isEntryBillingRequest(input,init))return nativeFetch(input,init);
    const controller=new AbortController(),parentSignal=init?.signal;let budgetExpired=false;
    const forwardAbort=()=>{try{controller.abort(parentSignal?.reason)}catch{controller.abort()}};
    if(parentSignal?.aborted)forwardAbort();else parentSignal?.addEventListener?.("abort",forwardAbort,{once:true});
    const timer=global.setTimeout(()=>{budgetExpired=true;try{controller.abort("workspace-entry-billing-budget")}catch{controller.abort()}},WORKSPACE_ENTRY_BILLING_BUDGET_MS);
    try{return await nativeFetch(input,{...init,signal:controller.signal})}
    catch(error){
      if(budgetExpired&&!parentSignal?.aborted){
        return new global.Response(JSON.stringify({error:"billing_status_deferred",message:"Billing status refresh deferred until workspace entry completes."}),{status:408,headers:{"content-type":"application/json","cache-control":"no-store"}})
      }
      throw error
    }finally{
      global.clearTimeout(timer);parentSignal?.removeEventListener?.("abort",forwardAbort)
    }
  };
})(window);

(function installThebeVoiceStratumMotion(global){
  "use strict";
  if(!global.document||global.document.getElementById("thebeVoiceStratumMotion"))return;
  const style=global.document.createElement("style");
  style.id="thebeVoiceStratumMotion";
  style.textContent=`
.thebe-voice-screen .thebe-voice-sphere{
  --thebe-fold-speed:6.6s;
  --thebe-voice-saturation:1.15;
  --thebe-voice-brightness:1.04;
  position:relative;
  width:clamp(188px,34vw,336px);
  aspect-ratio:1;
  border:0!important;
  border-radius:48% 52% 60% 40%/55% 43% 57% 45%;
  background:
    radial-gradient(circle at 69% 33%,rgba(251,255,207,.96) 0 4%,rgba(219,255,85,.62) 10%,transparent 29%),
    radial-gradient(circle at 31% 69%,rgba(150,244,19,.72) 0 15%,transparent 48%),
    conic-gradient(from 208deg at 50% 49%,rgba(14,19,4,.88),rgba(185,255,25,.9) 18%,rgba(61,87,7,.48) 33%,rgba(239,255,127,.9) 48%,rgba(17,24,4,.74) 62%,rgba(166,255,18,.8) 81%,rgba(14,19,4,.88));
  box-shadow:0 0 30px rgba(183,255,30,.18),0 0 72px rgba(156,240,15,.11)!important;
  filter:saturate(var(--thebe-voice-saturation)) brightness(var(--thebe-voice-brightness));
  isolation:isolate;
  overflow:visible;
  transform:scale(var(--thebe-voice-energy,1));
  transition:transform 110ms ease-out,filter 240ms ease,box-shadow 240ms ease;
  will-change:transform,filter,border-radius;
  animation:thebeVoiceBody calc(var(--thebe-fold-speed)*1.15) ease-in-out infinite alternate;
}
.thebe-voice-screen .thebe-voice-sphere::before,
.thebe-voice-screen .thebe-voice-sphere::after{
  content:"";
  position:absolute;
  pointer-events:none;
  transform-origin:50% 50%;
  will-change:transform,border-radius,filter,opacity;
}
.thebe-voice-screen .thebe-voice-sphere::before{
  inset:7%;
  border-radius:41% 59% 66% 34%/62% 37% 63% 38%;
  background:
    radial-gradient(ellipse at 66% 29%,rgba(255,255,220,.88) 0 5%,transparent 31%),
    repeating-conic-gradient(from 18deg at 49% 52%,rgba(232,255,115,.82) 0 9deg,rgba(129,203,15,.28) 17deg,rgba(13,19,3,.38) 31deg,rgba(199,255,44,.68) 46deg);
  mix-blend-mode:screen;
  filter:blur(12px) contrast(1.08);
  opacity:.88;
  animation:thebeVoiceFoldA var(--thebe-fold-speed) cubic-bezier(.45,.05,.32,.98) infinite alternate;
}
.thebe-voice-screen .thebe-voice-sphere::after{
  inset:16%;
  border-radius:63% 37% 42% 58%/39% 61% 44% 56%;
  background:
    radial-gradient(ellipse at 48% 51%,rgba(5,8,2,.9) 0 13%,rgba(36,55,4,.52) 27%,rgba(189,255,27,.5) 45%,transparent 70%),
    conic-gradient(from 122deg,transparent,rgba(246,255,176,.54),rgba(24,37,3,.72),rgba(174,255,20,.58),transparent);
  mix-blend-mode:multiply;
  filter:blur(6px);
  opacity:.82;
  animation:thebeVoiceFoldB calc(var(--thebe-fold-speed)*.78) ease-in-out infinite alternate-reverse;
}
.thebe-voice-screen .thebe-voice-sphere[data-phase="connecting"]{--thebe-fold-speed:9s;--thebe-voice-saturation:1.05;--thebe-voice-brightness:.94}
.thebe-voice-screen .thebe-voice-sphere[data-phase="listening"],
.thebe-voice-screen .thebe-voice-sphere[data-phase="ready"]{--thebe-fold-speed:6.4s;--thebe-voice-saturation:1.15;--thebe-voice-brightness:1.04}
.thebe-voice-screen .thebe-voice-sphere[data-phase="thinking"]{--thebe-fold-speed:4.1s;--thebe-voice-saturation:1.2;--thebe-voice-brightness:1.02}
.thebe-voice-screen .thebe-voice-sphere[data-phase="speaking"]{--thebe-fold-speed:2.8s;--thebe-voice-saturation:1.25;--thebe-voice-brightness:1.12;box-shadow:0 0 40px rgba(190,255,35,.3),0 0 92px rgba(145,232,14,.18)!important}
@keyframes thebeVoiceBody{
  0%{border-radius:48% 52% 60% 40%/55% 43% 57% 45%}
  50%{border-radius:58% 42% 43% 57%/39% 62% 38% 61%}
  100%{border-radius:38% 62% 55% 45%/61% 36% 64% 39%}
}
@keyframes thebeVoiceFoldA{
  0%{transform:rotate(-18deg) scale(.9,1.06) skewX(-4deg);border-radius:42% 58% 65% 35%/62% 38% 61% 39%;filter:blur(12px) contrast(1.04)}
  35%{transform:translate3d(3%,-2%,0) rotate(41deg) scale(1.06,.91) skewY(5deg);border-radius:62% 38% 43% 57%/37% 63% 42% 58%;filter:blur(9px) contrast(1.12)}
  72%{transform:translate3d(-2%,3%,0) rotate(103deg) scale(.94,1.08) skewX(4deg);border-radius:35% 65% 58% 42%/56% 44% 66% 34%;filter:blur(13px) contrast(1.08)}
  100%{transform:rotate(151deg) scale(1.05,.95) skewY(-4deg);border-radius:57% 43% 34% 66%/44% 58% 42% 56%;filter:blur(10px) contrast(1.14)}
}
@keyframes thebeVoiceFoldB{
  0%{transform:rotate(9deg) scale(.88,1.05) translate3d(-3%,2%,0);border-radius:63% 37% 42% 58%/39% 61% 44% 56%;opacity:.72}
  45%{transform:rotate(-72deg) scale(1.08,.9) translate3d(3%,-2%,0);border-radius:39% 61% 64% 36%/58% 42% 63% 37%;opacity:.9}
  100%{transform:rotate(-139deg) scale(.95,1.1) translate3d(-1%,3%,0);border-radius:55% 45% 36% 64%/34% 66% 47% 53%;opacity:.76}
}
@media (max-width:600px){.thebe-voice-screen .thebe-voice-sphere{width:clamp(174px,58vw,260px)}}
@media (prefers-reduced-motion:reduce){
  .thebe-voice-screen .thebe-voice-sphere,
  .thebe-voice-screen .thebe-voice-sphere::before,
  .thebe-voice-screen .thebe-voice-sphere::after{animation:none!important;transition:none!important}
}
`;
  (global.document.head||global.document.documentElement).appendChild(style);
})(window);
