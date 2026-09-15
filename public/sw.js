const LEGACY_CACHE_PREFIX="thebe-desk-";

// Decommission the historical Thebe Desk service-worker shell. Production now
// prefers the live network document and a normal browser lifecycle. This worker
// exists only so browsers that still have an older registration can update to a
// safe revision, clear Thebe Desk caches, and unregister themselves. It never
// opens a window, reloads a client, or intercepts fetches.
self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>String(key).startsWith(LEGACY_CACHE_PREFIX)).map(key=>caches.delete(key)));
    }catch{}
    try{await self.registration.unregister()}catch{}
  })());
});
