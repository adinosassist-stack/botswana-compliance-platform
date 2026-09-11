import fs from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker.js';
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const workerSource=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const releaseLastmod=(workerSource.match(/const SEO_RELEASE_LASTMOD="([^"]+)"/)||[])[1];assert.match(releaseLastmod||'',/^\d{4}-\d{2}-\d{2}$/);
const env={
  PUBLIC_APP_URL:'https://protect.example.bw',
  ASSETS:{fetch:async req=>{
    const u=new URL(req.url);
    if(u.pathname==='/index.html')return new Response(index,{status:200,headers:{'content-type':'text/html'}});
    return new Response('not found',{status:404});
  }}
};
let r=await worker.fetch(new Request('https://protect.example.bw/'),env,{});
assert.equal(r.status,200); const body=await r.text();
assert.ok(body.includes('rel="canonical" href="https://protect.example.bw/"'));
assert.ok(body.includes('og:image" content="https://protect.example.bw/assets/gaborone-entrepreneurs-v67.webp"'));
assert.ok(!body.includes('__SEO_CANONICAL__')&&!body.includes('__SEO_OG_IMAGE__'));
assert.match(r.headers.get('link')||'',/https:\/\/protect\.example\.bw\/>; rel="canonical"/);
assert.equal(r.headers.get('content-language'),'en-BW');
r=await worker.fetch(new Request('https://preview.example.workers.dev/'),env,{});
assert.equal(r.status,301); assert.equal(r.headers.get('location'),'https://protect.example.bw/');
r=await worker.fetch(new Request('https://protect.example.bw/index.html'),env,{});
assert.equal(r.status,301); assert.equal(r.headers.get('location'),'https://protect.example.bw/');
r=await worker.fetch(new Request('https://protect.example.bw/robots.txt'),env,{});
assert.equal(r.status,200); const robots=await r.text(); assert.match(robots,/User-agent: \*/); assert.match(robots,/Disallow: \/api\//); assert.match(robots,/Sitemap: https:\/\/protect\.example\.bw\/sitemap\.xml/);
r=await worker.fetch(new Request('https://protect.example.bw/sitemap.xml'),env,{});
assert.equal(r.status,200); const sitemap=await r.text(); assert.match(sitemap,/<loc>https:\/\/protect\.example\.bw\/<\/loc>/); const lastmods=[...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m=>m[1]); assert.ok(lastmods.length>=1&&lastmods.every(x=>x===releaseLastmod));
const fallbackEnv={...env,PUBLIC_APP_URL:undefined};
r=await worker.fetch(new Request('https://fallback.workers.dev/'),fallbackEnv,{});assert.equal(r.status,200);const fb=await r.text();assert.ok(fb.includes('href="https://fallback.workers.dev/"'));
console.log('v78 1.21.20 SEO runtime: PASS');
