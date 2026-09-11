import fs from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker.js';
const slugs=['cipa-compliance-botswana','burs-tax-compliance-botswana','business-licences-botswana','employment-compliance-botswana','tender-readiness-botswana','compliance-evidence-botswana','pricing'];
const assets=new Map([['/index.html',fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8')],...slugs.map(slug=>[`/${slug}/index.html`,fs.readFileSync(new URL(`../public/${slug}/index.html`,import.meta.url),'utf8')])]);
const env={PUBLIC_APP_URL:'https://protect.example.bw',ASSETS:{fetch:async req=>{const u=new URL(req.url),body=assets.get(u.pathname);return body?new Response(body,{status:200,headers:{'content-type':'text/html'}}):new Response('not found',{status:404})}}};
let r=await worker.fetch(new Request('https://protect.example.bw/'),env,{});assert.equal(r.status,200);let body=await r.text();assert.ok(body.includes('"logo":"https://protect.example.bw/assets/thebe-desk-icon-512.png"'));assert.ok(!body.includes('__SEO_LOGO__'));
for(const slug of slugs){
  r=await worker.fetch(new Request(`https://protect.example.bw/${slug}/?utm_source=test`),env,{});assert.equal(r.status,200,slug);body=await r.text();
  const canonical=`https://protect.example.bw/${slug}/`;
  assert.ok(body.includes(`rel="canonical" href="${canonical}"`),slug);
  assert.ok(body.includes(`og:url" content="${canonical}"`),slug);
  assert.ok(body.includes('https://protect.example.bw/assets/gaborone-entrepreneurs-v67.webp'),slug);
  assert.ok(body.includes('https://protect.example.bw/assets/thebe-desk-icon-512.png'),slug);
  assert.ok(!/__SEO_(PAGE_URL|ORIGIN|OG_IMAGE|LOGO)__/.test(body),slug);
  assert.match(r.headers.get('link')||'',new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(r.headers.get('content-language'),'en-BW');
  r=await worker.fetch(new Request(`https://preview.example.workers.dev/${slug}/`),env,{});assert.equal(r.status,301,slug);assert.equal(r.headers.get('location'),canonical,slug);
  r=await worker.fetch(new Request(`https://protect.example.bw/${slug}/index.html`),env,{});assert.equal(r.status,301,slug);assert.equal(r.headers.get('location'),canonical,slug);
}
r=await worker.fetch(new Request('https://protect.example.bw/sitemap.xml'),env,{});assert.equal(r.status,200);const sitemap=await r.text();
assert.equal((sitemap.match(/<url>/g)||[]).length,8);assert.ok(sitemap.includes('<loc>https://protect.example.bw/</loc>'));for(const slug of slugs)assert.ok(sitemap.includes(`<loc>https://protect.example.bw/${slug}/</loc>`),slug);assert.ok(!sitemap.includes('<priority>')&&!sitemap.includes('<changefreq>'));
r=await worker.fetch(new Request('https://protect.example.bw/robots.txt'),env,{});assert.equal(r.status,200);const robots=await r.text();assert.ok(robots.includes('Sitemap: https://protect.example.bw/sitemap.xml'));
console.log('v78 1.21.20 SEO expansion runtime: PASS');
