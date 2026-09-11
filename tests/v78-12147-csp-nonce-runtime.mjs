import fs from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker.js';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const guide=fs.readFileSync(new URL('../public/pricing/index.html',import.meta.url),'utf8');
const env={PUBLIC_APP_URL:'https://protect.example.bw',ASSETS:{fetch:async req=>{const p=new URL(req.url).pathname;const body=p==='/index.html'?html:p==='/pricing/index.html'?guide:null;return body?new Response(body,{status:200,headers:{'content-type':'text/html'}}):new Response('not found',{status:404})}}};
for(const path of ['/','/pricing/']){
  const r=await worker.fetch(new Request(`https://protect.example.bw${path}`),env,{});
  assert.equal(r.status,200,path);const body=await r.text(),csp=r.headers.get('content-security-policy')||'';
  const m=csp.match(/script-src-elem[^;]*'nonce-([^']+)'/);assert.ok(m,`nonce CSP missing ${path}`);const nonce=m[1];assert.ok(nonce.length>=20,`weak nonce ${path}`);
  const inline=[...body.matchAll(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>/gi)];assert.ok(inline.length>0,`inline script fixture missing ${path}`);
  for(const tag of inline)assert.ok(new RegExp(`\\bnonce=["']${nonce.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`).test(tag[0]),`inline script missing nonce ${path}`);
  const styleNonce=csp.match(/style-src-elem 'self' 'nonce-([^']+)'/);assert.ok(styleNonce&&styleNonce[1]===nonce,`style nonce CSP missing ${path}`);
  const styles=[...body.matchAll(/<style\b([^>]*)>/gi)];assert.ok(styles.length>0,`inline style fixture missing ${path}`);
  for(const tag of styles)assert.ok(new RegExp(`\\bnonce=["']${nonce.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`).test(tag[0]),`inline style missing nonce ${path}`);
  assert.ok(csp.includes("style-src-attr 'unsafe-inline'"),`legacy style attributes must be isolated from style elements ${path}`);
  assert.ok(csp.includes("script-src-attr 'none'"),`native inline handler execution must be disabled ${path}`);
  assert.ok(!/(?:^|\s)on(?:click|change|input|submit|keydown|keyup|focus)\s*=\s*["']/im.test(body),`native inline event attributes must be absent ${path}`);
}
console.log('V78 1.21.47 CSP nonce runtime: 2/2 PASS');
