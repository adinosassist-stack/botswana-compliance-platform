import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/thebe-dock-recovery-geometry-v269.js','utf8');
const context=vm.createContext({console});
vm.runInContext(source,context);
const guard=context.ThebeDockRecoveryGeometry;
assert(guard,'V269 recovery geometry API must be exposed for verification');
assert.equal(guard.release,'20261003-emergency-dock-geometry-v269');

for(const [viewport,normal,expanded] of [[1440,272,344],[1200,272,344],[1199,256,324],[1180,256,324],[1024,256,324]]){
  assert.equal(guard.widthFor(viewport,false),normal,`normal emergency dock width at ${viewport}`);
  assert.equal(guard.widthFor(viewport,true),expanded,`expanded emergency dock width at ${viewport}`);
  const geometry=guard.geometryFor(viewport,false);
  assert.equal(geometry.width,`${normal}px`);
  assert.equal(geometry['max-width'],`${normal}px`);
  assert.equal(geometry.position,'fixed');
  assert.equal(geometry.left,'auto');
  assert.equal(geometry.right,'16px');
  assert.equal(geometry.top,'88px');
  assert.equal(geometry.bottom,'auto');
  assert.match(geometry.height,/610px/);
}

const mobile=guard.geometryFor(390,false);
assert.equal(guard.widthFor(390,false),0);
assert.equal(mobile.position,'fixed');
assert.equal(mobile.left,'auto');
assert.equal(mobile.right,'12px');
assert.equal(mobile.top,'auto');
assert.equal(mobile.width,'76px');
assert.equal(mobile.height,'76px');
assert.equal(mobile['max-width'],'76px');
assert.equal(mobile['max-height'],'76px');
assert.equal(mobile['border-radius'],'999px');
assert.match(mobile.bottom,/104px/);

const mobileExpanded=guard.geometryFor(390,true);
assert.equal(mobileExpanded.position,'fixed');
assert.equal(mobileExpanded.left,'8px');
assert.equal(mobileExpanded.right,'8px');
assert.equal(mobileExpanded.top,'8px');
assert.equal(mobileExpanded.width,'auto');
assert.match(mobileExpanded.bottom,/104px/);
assert.match(mobileExpanded['max-height'],/112px/);

assert.match(source,/width:"68px","min-width":"68px","max-width":"68px",height:"68px"/,'emergency voice entry remains compact');
assert.match(source,/"grid-template-columns":"68px minmax\(0,1fr\)"/,'voice card follows compact orb geometry');
assert.match(source,/function spatialStylesheetHealthy\(dock\)/,'guard explicitly distinguishes real stylesheet health from repaired geometry');
assert.match(source,/if\(dock\.dataset\.cssRecovery!=="1"\)\{\s*if\(spatialStylesheetHealthy\(dock\)\)\{[\s\S]*?return false;\s*\}\s*dock\.dataset\.cssRecovery="1";/,'missing stylesheet keeps emergency geometry recovery authoritative even if another layer clears the marker');
assert.match(source,/releaseAll\(\);\s*clearMarker\(dock\)/,'healthy real CSS releases V269 inline geometry');
assert.doesNotMatch(source,/(?:420|408|560|82)px/,'V269 must not reintroduce legacy oversized dock/orb dimensions');

const sha='a'.repeat(40);
const html='<html><head></head><body><main>Workspace</main></body></html>';
const decorated=versionReleaseAssets(html,sha);
assert.match(decorated,new RegExp(`thebe-dock-recovery-geometry-v269\\.js\\?release=${sha}`),'all HTML surfaces load the recovery guard with release identity');
assert.equal((decorated.match(/thebe-dock-recovery-geometry-v269\.js/g)||[]).length,1,'guard is injected once');
assert.equal(versionReleaseAssets(decorated,sha),decorated,'guard injection remains idempotent');

console.log('PASS: V269 emergency dock preserves desktop lane geometry, owns missing-stylesheet recovery and keeps mobile recovery stable');
