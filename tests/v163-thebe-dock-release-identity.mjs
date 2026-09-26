import fs from 'node:fs';
import assert from 'node:assert/strict';

const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const audit=fs.readFileSync(new URL('../scripts/production-launch-audit.mjs',import.meta.url),'utf8');

const productionLive=production.match(/const THEBE_LIVE_VOICE_RELEASE="([^"]+)";/)?.[1]||'';
const productionDock=production.match(/const THEBE_AI_DOCK_RELEASE="([^"]+)";/)?.[1]||'';
const runtimeLive=runtime.match(/const RELEASE="([^"]+)";/)?.[1]||'';
const runtimeDock=runtime.match(/const DOCK_RELEASE="([^"]+)";/)?.[1]||'';

for(const value of [productionLive,productionDock,runtimeLive,runtimeDock]){
  assert.match(value,/^[0-9]{8}[A-Za-z0-9._-]{1,48}$/,'release identity must use a bounded cache-safe token');
}
assert.equal(productionLive,runtimeLive,'production must cache-bust the exact Thebe Live Voice runtime');
assert.equal(productionDock,runtimeDock,'production must cache-bust the exact Thebe AI dock runtime');
assert.equal(productionDock,'20260926-blue-v162','blue animated dock must ship under the V162 release token');
assert.match(audit,/THEBE_AI_DOCK_RELEASE="\(\[0-9\]\{8\}\[A-Za-z0-9\._-\]\{1,48\}\)";/,'launch audit must accept the repository release-token format');
assert(!audit.includes('[0-9]{8}[a-z]'),'launch audit must not regress to the obsolete date-plus-letter token parser');

console.log('PASS: V163 Thebe dock release identity, cache busting and launch-audit parser are aligned.');
