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
assert.equal(productionDock,'20260929-recovery-v188','live Thebe Command Dock V188 must ship under the current release token');
assert(production.includes('const OWNER_COMMAND_CENTRE_RELEASE="20260929-v185";'),'production must cache-bust the Property service runtime that owns the valuation panel');
assert(production.includes('const THEBE_AI_DOCK_HOTFIX_ASSET="/assets/thebe-ai-dock-v184-hotfix.css";'),'production must publish the path-busted V184 dock hotfix asset');
assert.equal((production.match(/THEBE_AI_DOCK_HOTFIX_ASSET/g)||[]).length>=3,true,'V184 dock hotfix must be declared and injected across public/workspace surfaces');
assert(hotfix.includes('.thebe-ai-dock[data-surface="workspace"] .thebe-ai-orb-button'),'V184 geometry fix must apply across workspace conversation states');
assert(!hotfix.includes('[data-conversation="false"]'),'V184 geometry fix must not disappear after a real voice/text conversation');
assert(hotfix.includes('width:82px!important')&&hotfix.includes('height:82px!important'),'V184 must pin the reviewed 82px desktop voice control');
assert(hotfix.includes('#propertyValuationServicePanel')&&hotfix.includes('background:#f7fbff!important'),'V184 must visibly restore the professional Property service emphasis');
assert(runtime.includes('function syncWorkspaceVisualInvariants()'),'V188 must retain authenticated dock geometry ownership at runtime, not only through CSS');
assert(runtime.includes('const size=compact?"64px":"82px";'),'V188 must preserve the reviewed 82px desktop control and 64px narrow-mobile exception');
assert(runtime.includes('orbButton.style.setProperty(property,size,"important")'),'V188 must pin workspace voice-control dimensions with runtime important declarations');
assert((runtime.match(/syncWorkspaceVisualInvariants\(\);/g)||[]).length>=3,'V188 must re-assert workspace geometry across visibility and conversation-state changes');
assert(ownerRuntime.includes('const RELEASE="20260929-v185";'),'Property runtime must carry the V185 cache identity');
assert(ownerRuntime.includes('servicePanel.style.setProperty("background","#f7fbff","important")'),'Property professional-service emphasis must survive late or stale stylesheet state');
assert(ownerRuntime.includes('servicePanel.style.setProperty("border-color","#a9c8ef","important")'),'Property professional-service border emphasis must be runtime-owned');
assert(runtime.includes('const modeCopy=Object.freeze({'),'V188 must expose explicit Ask, Brief and Priorities modes');
assert(runtime.includes('function syncContextBar()'),'V188 must surface the active workspace context in the dock');
assert(runtime.includes('function clearConversation()'),'V188 must provide a local clear-conversation control');
assert(runtime.includes('thebe-ai-response-tools'),'V188 must provide follow-up, copy and workspace-AI response tools');
assert(runtime.includes('event.altKey')&&runtime.includes('toLowerCase()==="t"'),'V188 must provide the Alt+T keyboard entry point');
assert(runtime.includes('setMode:mode=>setAssistantMode(mode)'),'V188 public dock API must expose safe local mode switching');
assert(runtime.includes('function recoverDockPresentation()'),'V188 must carry a runtime visual recovery path when the dock stylesheet is absent');
assert(runtime.includes('computed.flexDirection===\"column\"')&&runtime.includes('scrollComputed?.flexDirection===\"column\"'),'V188 recovery health must reject the sideways row-layout failure');
assert(runtime.includes('\"flex-direction\":\"column\"')&&runtime.includes('\"width\":\"100%\"'),'V188 runtime recovery must rebuild a vertical full-width dock when CSS is unavailable');
assert(runtime.includes('function workspaceDockLeftPx()'),'V188 must resolve the dock against the workspace content edge instead of covering the sidebar');
assert(runtime.includes('dock.style.setProperty("left",workspaceDockLeftPx()+"px","important")'),'V188 must runtime-pin the desktop dock to the resolved workspace lower-left position');
assert(runtime.includes('pill.style.setProperty("display",visible&&isCollapsed?"inline-flex":"none","important")'),'V188 must make desktop minimise/reopen usable without depending on stylesheet state');
assert(runtime.includes('const STORE_KEY="thebe_ai_dock_collapsed_v5";'),'V188 must not inherit the pre-floating collapse preference');
const dockCss=fs.readFileSync(new URL('../public/assets/thebe-ai-dock.css',import.meta.url),'utf8');
assert(dockCss.includes('V186 Thebe Command Dock'),'V188 must retain the Command Dock foundation');
assert(dockCss.includes('V188 workspace floating-command closure'),'V188 floating lower-left workspace visual layer must be present');
assert(dockCss.includes('left:20px!important')&&dockCss.includes('bottom:22px!important'),'V188 CSS must keep the desktop dock inset from the lower-left workspace edge');
assert(dockCss.includes('.thebe-ai-context-bar')&&dockCss.includes('.thebe-ai-mode-rail'),'V188 must visibly render context and response-mode controls');
assert(dockCss.includes('background:#07131f'),'V188 must replace the full-blue sidebar treatment with the reviewed deep-navy command surface');
assert(dockCss.includes('.thebe-ai-quick{')&&dockCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'V188 desktop contextual actions must use a compact three-command row');
assert(audit.includes('const dockReleaseMatch=productionEntry.match(/const THEBE_AI_DOCK_RELEASE="([0-9]{8}[A-Za-z0-9._-]{1,48})";/);'),'launch audit must accept the repository release-token format');
assert(!audit.includes('[0-9]{8}[a-z]'),'launch audit must not regress to the obsolete date-plus-letter token parser');
assert(fullUser.includes("/^[0-9]{8}[A-Za-z0-9._-]{1,48}$/"),'full-user synthetic must accept the bounded cache-safe dock release token format');
assert(!fullUser.includes("/^\\d{8}[a-z]$/"),'full-user synthetic must not regress to the obsolete date-plus-letter dock token parser');

console.log('PASS: V163 Thebe dock release identity, cache busting and launch-audit parser are aligned.');
