/* Default-off company-logo settings discovery in Business; injected only when feature is enabled. */
(()=>{
 "use strict";
 const marker="thebe-company-logo-entry";
 let authorized=false,scheduled=false;
 function insert(){
  scheduled=false;
  if(!authorized)return;
  const root=document.getElementById("businesshub");
  if(!root||root.querySelector("#"+marker))return;
  const block=document.createElement("section");
  block.id=marker;block.className="thebe-company-logo-entry";
  const copy=document.createElement("div");
  const heading=document.createElement("strong");heading.textContent="Company logo";
  const desc=document.createElement("p");
  desc.textContent="Add or update the logo for this signed-in business.";
  copy.append(heading,desc);
  const link=document.createElement("a");link.href="/app/settings/company-logo/";
  link.textContent="Manage logo";link.className="thebe-company-logo-entry-action";
  block.append(copy,link);
  const hero=root.querySelector(".hub-hero");
  if(hero)hero.insertAdjacentElement("afterend",block);
  else root.prepend(block);
 }
 const schedule=()=>{if(document.getElementById(marker))return;if(!scheduled){scheduled=true;requestAnimationFrame(insert)}};
 async function start(){
  try{
   const r=await fetch("/__thebe_api/auth/me",{credentials:"same-origin",cache:"no-store",redirect:"error"});
   if(!r.ok)return;
   const session=await r.json();
   if(!session?.user||!["owner","manager"].includes(session.user.role)||session.landingPath)return;
   authorized=true;schedule();
   // Business hub may be lazily rendered or refreshed by the workspace.
   const observer=new MutationObserver(schedule);
   observer.observe(document.body,{childList:true,subtree:true});
   addEventListener("pagehide",()=>observer.disconnect(),{once:true});
  }catch{}
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
 else start();
})();
