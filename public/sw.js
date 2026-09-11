const CACHE="thebe-desk-recovery-r1-bw-business-protection-v78-1.21.101-bf07-toolchain-package-hardening";
const SHELL=["./","./manifest.webmanifest","./js/dom-security.js","./js/event-delegation.js","./js/notifications.js","./js/dialog-service.js","./js/api-client.js","./js/state-store.js","./js/components.js"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
function cacheableAsset(url){return url.origin===self.location.origin&&!url.pathname.startsWith("/api/")&&!url.pathname.startsWith("/public/")&&(url.pathname.startsWith("/assets/")||url.pathname.startsWith("/js/")||url.pathname.endsWith(".webmanifest"))}
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/public/"))return;
 if(request.mode==="navigate"){
   event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put("./",copy)))}return response}).catch(()=>caches.match("./")));return;
 }
 if(cacheableAsset(url)){
   event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>{if(response.ok)event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));return response}).catch(()=>cached);return cached||network}));
 }
});
