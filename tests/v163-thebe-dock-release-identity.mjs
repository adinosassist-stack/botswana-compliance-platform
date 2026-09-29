import fs from 'node:fs';
import assert from 'node:assert/strict';

const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const hotfix=fs.readFileSync(new URL('../public/assets/thebe-ai-dock-v184-hotfix.css',import.meta.url),'utf8');
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
assert.equal(productionDock,'20260929-visual-v184','live Thebe dock visual closure V184 must ship under the current release token');
assert(production.includes('const THEBE_AI_DOCK_HOTFIX_ASSET="/assets/thebe-ai-dock-v184-hotfix.css";'),'production must publish the path-busted V184 dock hotfix asset');
assert.equal((production.match(/THEBE_AI_DOCK_HOTFIX_ASSET/g)||[]).length>=3,true,'V184 dock hotfix must be declared and injected across public/workspace surfaces');
assert(hotfix.includes('.thebe-ai-dock[data-surface="workspace"] .thebe-ai-orb-button'),'V184 geometry fix must apply across workspace conversation states');
assert(!hotfix.includes('[data-conversation="false"]'),'V184 geometry fix must not disappear after a real voice/text conversation');
assert(hotfix.includes('width:82px!important')&&hotfix.includes('height:82px!important'),'V184 must pin the reviewed 82px desktop voice control');
assert(hotfix.includes('#propertyValuationServicePanel')&&hotfix.includes('background:#f7fbff!important'),'V184 must visibly restore the professional Property service emphasis');
assert(audit.includes('const dockReleaseMatch=productionEntry.match(/const THEBE_AI_DOCK_RELEASE="([0-9]{8}[A-Za-z0-9._-]{1,48})";/);'),'launch audit must accept the repository release-token format');
assert(!audit.includes('[0-9]{8}[a-z]'),'launch audit must not regress to the obsolete date-plus-letter token parser');
assert(fullUser.includes("/^[0-9]{8}[A-Za-z0-9._-]{1,48}$/"),'full-user synthetic must accept the bounded cache-safe dock release token format');
assert(!fullUser.includes("/^\\d{8}[a-z]$/"),'full-user synthetic must not regress to the obsolete date-plus-letter dock token parser');

console.log('PASS: V163 Thebe dock release identity, cache busting and launch-audit parser are aligned.');
