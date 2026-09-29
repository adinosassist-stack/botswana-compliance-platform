import fs from 'node:fs';
import assert from 'node:assert/strict';

const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const audit=fs.readFileSync(new URL('../scripts/production-launch-audit.mjs',import.meta.url),'utf8');
const fullUser=fs.readFileSync(new URL('../scripts/production-synthetic-full-user-wrapper.mjs',import.meta.url),'utf8');

const productionLive=production.match(/const THEBE_LIVE_VOICE_RELEASE="([^"]+)";/)?.[1]||'';
const productionDock=production.match(/const THEBE_AI_DOCK_RELEASE="([^"]+)";/)?.[1]||'';
const runtimeLive=runtime.match(/const RELEASE="([^"]+)";/)?.[1]||'';
const runtimeDock=runtime.match(/const DOCK_RELEASE="([^"]+)";/)?.[1]||'';

for(const value of [productionLive,productionDock,runtimeLive,runtimeDock]){
  assert.match(value,/^[0-9]{8}[A-Za-z0-9._-]{1,48}$/,'release identity must use a bounded cache-safe token');
}
assert.equal(productionLive,runtimeLive,'production must cache-bust the exact Thebe Live Voice runtime');
assert.equal(productionDock,runtimeDock,'production must cache-bust the exact Thebe AI dock runtime');
assert.equal(productionDock,'20260929-aesthetic-v182','Marketing-photo restoration and character-free Thebe dock V181 must ship under the current release token');
assert(audit.includes('const dockReleaseMatch=productionEntry.match(/const THEBE_AI_DOCK_RELEASE="([0-9]{8}[A-Za-z0-9._-]{1,48})";/);'),'launch audit must accept the repository release-token format');
assert(!audit.includes('[0-9]{8}[a-z]'),'launch audit must not regress to the obsolete date-plus-letter token parser');
assert(fullUser.includes("/^[0-9]{8}[A-Za-z0-9._-]{1,48}$/"),'full-user synthetic must accept the bounded cache-safe dock release token format');
assert(!fullUser.includes("/^\\d{8}[a-z]$/"),'full-user synthetic must not regress to the obsolete date-plus-letter dock token parser');

console.log('PASS: V163 Thebe dock release identity, cache busting and launch-audit parser are aligned.');
