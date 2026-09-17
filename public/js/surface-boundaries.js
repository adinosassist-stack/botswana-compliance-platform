(()=>{
"use strict";
if(location.pathname!=="/app"&&location.pathname!=="/app/")return;
const authUrl=()=>`/auth/?mode=login&next=${encodeURIComponent('/app/')}`;
const publicUrl=()=>"/";
const go=url=>{if(location.pathname+location.search!==url)location.assign(url)};
const install=()=>{
 try{window.returnToPublicWebsite=()=>{go(publicUrl());return false}}catch{}
 try{window.showAuth=()=>{go(authUrl());return false}}catch{}
 try{window.openAuthFromMarketing=mode=>{go(mode==="register"?`/auth/?mode=register&next=${encodeURIComponent('/app/')}`:authUrl());return false}}catch{}
 try{window.startFreeFromMarketing=plan=>{const value=["starter","business","pro","network","partner"].includes(String(plan||""))?String(plan):"business";go(`/auth/?mode=register&plan=${encodeURIComponent(value)}&next=${encodeURIComponent('/app/')}`);return false}}catch{}
};
let observer=null;
const enforce=()=>{
 const auth=document.getElementById("authGate"),marketing=document.getElementById("marketingGate"),shell=document.getElementById("appShell");
 const authVisible=auth&&!auth.classList.contains("hidden")&&getComputedStyle(auth).display!=="none";
 const marketingVisible=marketing&&!marketing.classList.contains("hidden")&&getComputedStyle(marketing).display!=="none";
 const shellVisible=shell&&getComputedStyle(shell).visibility!=="hidden"&&getComputedStyle(shell).display!=="none";
 if(authVisible){observer?.disconnect();go(authUrl());return true}
 if(marketingVisible&&!shellVisible){observer?.disconnect();go(publicUrl());return true}
 return false;
};
install();
observer=new MutationObserver(()=>{enforce()});
const begin=()=>{
 install();
 if(enforce())return;
 const root=document.body;
 if(root)observer.observe(root,{subtree:true,attributes:true,attributeFilter:["class","style"]});
 requestAnimationFrame(()=>enforce());
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",begin,{once:true});else begin();
})();
