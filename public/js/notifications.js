(function bootstrapBwNotifications(global){
  "use strict";
  function ensureRegion(){
    let region=document.getElementById("bwToastRegion");
    if(region)return region;
    region=document.createElement("div");region.id="bwToastRegion";region.className="bw-toast-region";region.setAttribute("aria-live","polite");region.setAttribute("aria-atomic","false");document.body.appendChild(region);return region;
  }
  function classify(message,requested){
    if(requested)return requested;const text=String(message||"");
    if(/failed|error|unable|cannot|expired|forbidden|denied|unavailable|missing|invalid/i.test(text))return "error";
    if(/updated|saved|sent|created|complete|success|recorded/i.test(text))return "success";
    return "warning";
  }
  function notify(message,{type=null,title="",timeout=5200}={}){
    const text=String(message??"").trim();if(!text)return;
    const kind=classify(text,type),region=ensureRegion(),toast=document.createElement("div");
    toast.className=`bw-toast ${kind}`;toast.setAttribute("role",kind==="error"?"alert":"status");
    const body=document.createElement("div"),strong=document.createElement("strong"),copy=document.createElement("div"),close=document.createElement("button");
    strong.textContent=title||({error:"Something needs attention",success:"Done",warning:"Check this",info:"Notice"}[kind]||"Notice");
    copy.textContent=text;copy.className="bw-toast-copy";close.type="button";close.className="bw-toast-close";close.setAttribute("aria-label","Dismiss notification");close.textContent="×";
    body.append(strong,copy);toast.append(body,close);close.addEventListener("click",()=>toast.remove());region.appendChild(toast);
    const id=setTimeout(()=>toast.remove(),Math.max(1800,Number(timeout)||5200));toast.addEventListener("mouseenter",()=>clearTimeout(id),{once:true});
  }
  global.BW=global.BW||{};global.BW.notifications=Object.freeze({notify});
})(window);
