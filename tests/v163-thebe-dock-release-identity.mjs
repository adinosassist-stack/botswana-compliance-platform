import fs from 'node:fs';
import assert from 'node:assert/strict';

const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const ownerRuntime=fs.readFileSync(new URL('../public/js/owner-command-centre.js',import.meta.url),'utf8');
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
assert.equal(productionDock,'20260929-command-v186','live Thebe Command Dock V186 must ship under the current release token');
assert(production.includes('const OWNER_COMMAND_CENTRE_RELEASE="20260929-v185";'),'production must cache-bust the Property service runtime that owns the valuation panel');
assert(production.includes('const THEBE_AI_DOCK_HOTFIX_ASSET="/assets/thebe-ai-dock-v184-hotfix.css";'),'production must publish the path-busted V184 dock hotfix asset');
assert.equal((production.match(/THEBE_AI_DOCK_HOTFIX_ASSET/g)||[]).length>=3,true,'V184 dock hotfix must be declared and injected across public/workspace surfaces');
assert(hotfix.includes('.thebe-ai-dock[data-surface="workspace"] .thebe-ai-orb-button'),'V184 geometry fix must apply across workspace conversation states');
assert(!hotfix.includes('[data-conversation="false"]'),'V184 geometry fix must not disappear after a real voice/text conversation');
assert(hotfix.includes('width:82px!important')&&hotfix.includes('height:82px!important'),'V184 must pin the reviewed 82px desktop voice control');
assert(hotfix.includes('#propertyValuationServicePanel')&&hotfix.includes('background:#f7fbff!important'),'V184 must visibly restore the professional Property service emphasis');
assert(runtime.includes('function syncWorkspaceVisualInvariants()'),'V186 must retain authenticated dock geometry ownership at runtime, not only through CSS');
assert(runtime.includes('const size=compact?"64px":"82px";'),'V186 must preserve the reviewed 82px desktop control and 64px narrow-mobile exception');
assert(runtime.includes('orbButton.style.setProperty(property,size,"important")'),'V186 must pin workspace voice-control dimensions with runtime important declarations');
assert((runtime.match(/syncWorkspaceVisualInvariants\(\);/g)||[]).length>=3,'V186 must re-assert workspace geometry across visibility and conversation-state changes');
assert(ownerRuntime.includes('const RELEASE="20260929-v185";'),'Property runtime must carry the V185 cache identity');
assert(ownerRuntime.includes('servicePanel.style.setProperty("background","#f7fbff","important")'),'Property professional-service emphasis must survive late or stale stylesheet state');
assert(ownerRuntime.includes('servicePanel.style.setProperty("border-color","#a9c8ef","important")'),'Property professional-service border emphasis must be runtime-owned');
assert(runtime.includes('const modeCopy=Object.freeze({'),'V186 must expose explicit Ask, Brief and Priorities modes');
assert(runtime.includes('function syncContextBar()'),'V186 must surface the active workspace context in the dock');
assert(runtime.includes('function clearConversation()'),'V186 must provide a local clear-conversation control');
assert(runtime.includes('thebe-ai-response-tools'),'V186 must provide follow-up, copy and workspace-AI response tools');
assert(runtime.includes('event.altKey')&&runtime.includes('toLowerCase()==="t"'),'V186 must provide the Alt+T keyboard entry point');
assert(runtime.includes('setMode:mode=>setAssistantMode(mode)'),'V186 public dock API must expose safe local mode switching');
const dockCss=fs.readFileSync(new URL('../public/assets/thebe-ai-dock.css',import.meta.url),'utf8');
assert(dockCss.includes('V186 Thebe Command Dock'),'V186 command-surface visual layer must be present');
assert(dockCss.includes('.thebe-ai-context-bar')&&dockCss.includes('.thebe-ai-mode-rail'),'V186 must visibly render context and response-mode controls');
assert(dockCss.includes('background:#07131f'),'V186 must replace the full-blue sidebar treatment with the reviewed deep-navy command surface');
assert(dockCss.includes('.thebe-ai-quick{')&&dockCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'V186 desktop contextual actions must use a compact three-command row');
assert(audit.includes('const dockReleaseMatch=productionEntry.match(/const THEBE_AI_DOCK_RELEASE="([0-9]{8}[A-Za-z0-9._-]{1,48})";/);'),'launch audit must accept the repository release-token format');
assert(!audit.includes('[0-9]{8}[a-z]'),'launch audit must not regress to the obsolete date-plus-letter token parser');
assert(fullUser.includes("/^[0-9]{8}[A-Za-z0-9._-]{1,48}$/"),'full-user synthetic must accept the bounded cache-safe dock release token format');
assert(!fullUser.includes("/^\\d{8}[a-z]$/"),'full-user synthetic must not regress to the obsolete date-plus-letter dock token parser');

console.log('PASS: V163 Thebe dock release identity, cache busting and launch-audit parser are aligned.');
