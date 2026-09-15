const CACHE="thebe-desk-mobile-startup-recovery-20260915-v1";
const SHELL=["./manifest.webmanifest","./js/dom-security.js","./js/event-delegation.js","./js/notifications.js","./js/dialog-service.js","./js/api-client.js","./js/state-store.js","./js/components.js"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    try{if(self.registration.navigationPreload)await self.registration.navigationPreload.enable()}catch{}
    await self.clients.claim();
  })());
});

function cacheableAsset(url){
  return url.origin===self.location.origin&&!url.pathname.startsWith("/api/")&&!url.pathname.startsWith("/public/")&&(url.pathname.startsWith("/assets/")||url.pathname.startsWith("/js/")||url.pathname.endsWith(".webmanifest"));
}
function criticalRuntimeAsset(url){return url.origin===self.location.origin&&url.pathname.startsWith("/js/")}

async function networkFirst(request,event){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response.ok)event.waitUntil(cache.put(request,response.clone()));
    return response;
  }catch(error){
    const cached=await cache.match(request);
    if(cached)return cached;
    throw error;
  }
}

function offlineNavigationResponse(){
  return new Response(`<!doctype html><html lang="en-BW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B66D6"><title>Thebe Desk</title><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#fff;color:#16191b;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:460px;border:1px solid #e1e6e3;border-radius:18px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.06)}h1{margin:0 0 10px;font-size:24px}p{line-height:1.55;color:#5a6560}button{border:0;border-radius:10px;background:#0B66D6;color:#fff;font:inherit;font-weight:700;padding:11px 16px}</style></head><body><main class="card"><h1>Thebe Desk</h1><p>The live service could not be reached. Check your connection and retry. No preview or cached workspace has been loaded.</p><button type="button" onclick="location.reload()">Retry</button></main></body></html>`,{
    status:503,
    headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store, max-age=0"}
  });
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/public/"))return;

  // Never serve cached application HTML. A stale preview document must never become
  // the production navigation fallback on mobile or a flaky connection.
  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const preload=await event.preloadResponse;
        if(preload?.ok)return preload;
        return await fetch(request,{cache:"no-store"});
      }catch{
        return offlineNavigationResponse();
      }
    })());
    return;
  }

  if(criticalRuntimeAsset(url)){
    event.respondWith(networkFirst(request,event));
    return;
  }
  if(cacheableAsset(url)){
    event.respondWith(caches.match(request).then(cached=>{
      const network=fetch(request,{cache:"no-cache"}).then(response=>{
        if(response.ok)event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));
        return response;
      }).catch(()=>cached);
      return cached||network;
    }));
  }
});
