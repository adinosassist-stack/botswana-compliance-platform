const CACHE="thebe-desk-recovery-r1-bw-business-protection-v78-1.21.101-registration-owner-ui-hotfix-20260914";
const SHELL=["./manifest.webmanifest","./js/dom-security.js","./js/event-delegation.js","./js/notifications.js","./js/dialog-service.js","./js/api-client.js","./js/state-store.js","./js/components.js"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
function cacheableAsset(url){return url.origin===self.location.origin&&!url.pathname.startsWith("/api/")&&!url.pathname.startsWith("/public/")&&(url.pathname.startsWith("/assets/")||url.pathname.startsWith("/js/")||url.pathname.endsWith(".webmanifest"))}
function criticalRuntimeAsset(url){return url.origin===self.location.origin&&url.pathname.startsWith("/js/")}
async function networkFirst(request,event,{fallbackKey=null}={}){
 const cache=await caches.open(CACHE);
 try{
  const response=await fetch(request,{cache:"no-store"});
  if(response.ok)event.waitUntil(cache.put(fallbackKey||request,response.clone()));
  return response;
 }catch(error){
  const cached=await cache.match(fallbackKey||request);
  if(cached)return cached;
  throw error;
 }
}
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/public/"))return;
 if(request.mode==="navigate"){
   event.respondWith(networkFirst(request,event,{fallbackKey:"./"}));return;
 }
 if(criticalRuntimeAsset(url)){
   event.respondWith(networkFirst(request,event));return;
 }
 if(cacheableAsset(url)){
   event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>{if(response.ok)event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));return response}).catch(()=>cached);return cached||network}));
 }
});
