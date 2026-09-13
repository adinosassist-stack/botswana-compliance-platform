import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const pub=path.join(root,'public');
const html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
const dom=html.replace(/<script\b[\s\S]*?<\/script>/gi,'');
const jsOnly=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const worker=fs.readFileSync(path.join(root,'cloudflare','src','worker.js'),'utf8');
const apiClient=fs.readFileSync(path.join(pub,'js','api-client.js'),'utf8');
const whatsapp=fs.readFileSync(path.join(pub,'js','owner-whatsapp-prepare.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(pub,'manifest.webmanifest'),'utf8'));
const workflow=fs.readFileSync(path.join(root,'.github','workflows','production-launch-audit.yml'),'utf8');
const liveAudit=fs.readFileSync(path.join(root,'scripts','production-launch-audit.mjs'),'utf8');

const unique=a=>[...new Set(a)];
const exists=rel=>assert.ok(fs.existsSync(path.join(pub,rel)),`missing public asset ${rel}`);
const ids=[...dom.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'duplicate DOM IDs are forbidden');
const idSet=new Set(ids);
for(const target of unique([...dom.matchAll(/<button[^>]+data-view="([^"]+)"/g)].map(m=>m[1])))assert.ok(idSet.has(target),`missing navigation target ${target}`);

const defined=new Set([...html.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
for(const expression of unique([...dom.matchAll(/data-bw-onclick="([^"]+)"/g)].map(m=>m[1]))){
  const fn=expression.trim().match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1];
  assert.ok(fn,`unsupported delegated action ${expression}`);
  assert.ok(defined.has(fn),`delegated button action ${fn} has no implementation`);
}

const staticButtons=[...dom.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
let buttonCount=0;
for(const [,attrs,body] of staticButtons){
  if(/\bdisabled\b/i.test(attrs))continue;
  const label=body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  if(!label)continue;
  buttonCount++;
  if(/data-view=|data-bw-onclick=|\btype="submit"|\bonclick=/i.test(attrs))continue;
  const id=attrs.match(/\bid="([^"]+)"/i)?.[1];
  if(id){
    const quoted=[`getElementById("${id}")`,`getElementById('${id}')`,`#${id}`];
    assert.ok(quoted.some(token=>jsOnly.includes(token)),`button #${id} (${label.slice(0,60)}) is not referenced by application JavaScript`);
    continue;
  }
  const classes=(attrs.match(/\bclass="([^"]+)"/i)?.[1]||'').split(/\s+/).filter(Boolean);
  assert.ok(classes.some(c=>jsOnly.includes(`.${c}`)||jsOnly.includes(` ${c}`)),`button ${label.slice(0,60)} has no detectable delegated wiring`);
}
assert.ok(buttonCount>=20,`unexpectedly low static button inventory: ${buttonCount}`);

for(const rel of [
  'assets/favicon-96.png','assets/apple-touch-icon.png','assets/thebe-desk-icon-192.png','assets/thebe-desk-icon-512.png',
  'assets/thebe-desk-favicon-512.png','assets/thebe-desk-logo-symbol.png','manifest.webmanifest','sw.js','js/api-client.js',
  'js/owner-command-centre.js','js/owner-whatsapp-prepare.js'
])exists(rel);
assert.equal(manifest.name,'Thebe Desk');
assert.equal(manifest.short_name,'Thebe Desk');
assert.equal(manifest.start_url,'/');
assert.equal(manifest.scope,'/');
assert.equal(manifest.display,'standalone');
for(const size of ['192x192','512x512']){
  const icon=(manifest.icons||[]).find(x=>x.sizes===size);
  assert.ok(icon,`manifest ${size} icon missing`);assert.equal(icon.type,'image/png');exists(String(icon.src).replace(/^\//,''));
}
for(const token of ['<html lang="en-BW">','name="description"','name="robots"','property="og:title"','property="og:image"','name="twitter:card"','rel="canonical"','application/ld+json','rel="manifest"','rel="apple-touch-icon"'])assert.ok(html.includes(token),`SEO/PWA contract missing ${token}`);
for(const placeholder of ['__SEO_CANONICAL__','__SEO_OG_IMAGE__','__SEO_LOGO__']){assert.ok(html.includes(placeholder),`SEO source placeholder ${placeholder} missing`);assert.ok(worker.includes(placeholder),`worker does not rewrite ${placeholder}`)}
assert.ok(worker.includes('robots.txt')&&worker.includes('sitemap.xml'),'worker robots/sitemap generation missing');
assert.ok(apiClient.includes('CANONICAL_PRODUCTION_ORIGIN="https://thebedesk.com"'),'API client canonical-origin pin missing');
assert.ok(apiClient.includes('redirect:"error"'),'API client must reject unexpected redirects');
assert.ok(whatsapp.includes('providerSend===false')&&whatsapp.includes('recipientTargeting===false'),'WhatsApp UI must validate no-send/no-recipient boundary');
assert.ok(!whatsapp.includes('graph.facebook.com')&&!whatsapp.includes('wa.me/'),'WhatsApp prepare UI must not contain provider send/launch endpoint');

assert.match(workflow,/workflow_run:/,'production launch audit must be chained to deployment');
assert.match(workflow,/Thebe Desk Production Deploy/,'production launch audit must listen to the production deploy workflow');
assert.match(workflow,/EXPECTED_DEPLOY_SHA/,'launch audit must bind to the deployment SHA');
for(const route of ['/manifest.webmanifest','/robots.txt','/sitemap.xml','/assets/favicon-96.png','/assets/apple-touch-icon.png','/assets/thebe-desk-icon-192.png','/assets/thebe-desk-icon-512.png'])assert.ok(liveAudit.includes(route),`live audit missing ${route}`);
for(const route of ['/pricing/','/burs-tax-compliance-botswana/','/cipa-compliance-botswana/','/business-licences-botswana/','/employment-compliance-botswana/','/compliance-evidence-botswana/','/tender-readiness-botswana/'])assert.ok(liveAudit.includes(route),`live SEO audit missing ${route}`);
assert.ok(liveAudit.includes('Promise.all')&&liveAudit.includes('extreme-use burst'),'live audit must include bounded concurrency stress');
assert.ok(liveAudit.includes('unsupported_content_encoding')&&liveAudit.includes('request_too_large'),'live audit must verify abuse fail-closed behavior');
assert.ok(liveAudit.includes('DEFERRED')&&liveAudit.includes('fail closed'),'deferred external integrations must remain explicit and fail closed');

console.log(`PASS V82 final-build red-team: ${ids.length} DOM IDs, ${buttonCount} static buttons, favicon/PWA/SEO, post-deploy audit chaining, abuse and WhatsApp safety boundaries`);
