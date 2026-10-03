import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/thebe-dock-recovery-geometry-v268.js','utf8');
const context=vm.createContext({console});
vm.runInContext(source,context);
const guard=context.ThebeDockRecoveryGeometry;
assert(guard,'V268 recovery geometry API must be exposed for verification');
assert.equal(guard.release,'20261003-emergency-dock-geometry-v268');

for(const [viewport,normal,expanded] of [[1440,304,400],[1200,304,400],[1199,280,360],[1180,280,360],[1024,280,360]]){
  assert.equal(guard.widthFor(viewport,false),normal,`normal emergency dock width at ${viewport}`);
  assert.equal(guard.widthFor(viewport,true),expanded,`expanded emergency dock width at ${viewport}`);
  const geometry=guard.geometryFor(viewport,false);
  assert.equal(geometry.width,`${normal}px`);
  assert.equal(geometry['max-width'],`${normal}px`);
  assert.equal(geometry.left,'auto');
  assert.equal(geometry.right,'16px');
  assert.equal(geometry.top,'88px');
  assert.equal(geometry.bottom,'auto');
}

const mobile=guard.geometryFor(390,false);
assert.equal(guard.widthFor(390,false),0);
assert.equal(mobile.left,'8px');
assert.equal(mobile.right,'8px');
assert.equal(mobile.top,'8px');
assert.equal(mobile.width,'auto');
assert.match(mobile.bottom,/104px/);
assert.match(mobile['max-height'],/112px/);

assert.match(source,/width:"68px","min-width":"68px","max-width":"68px",height:"68px"/,'emergency voice entry remains compact');
assert.match(source,/"grid-template-columns":"68px minmax\(0,1fr\)"/,'voice card follows compact orb geometry');
assert.match(source,/dock\.dataset\.cssRecovery!=="1"/,'guard must disengage outside emergency recovery');
assert.match(source,/releaseAll\(\);\s*clearMarker\(dock\)/,'normal CSS recovery releases V268 inline geometry');
assert.doesNotMatch(source,/(?:420|408|560|82)px/,'V268 must not reintroduce legacy oversized dock/orb dimensions');

const sha='a'.repeat(40);
const html='<html><head></head><body><main>Workspace</main></body></html>';
const decorated=versionReleaseAssets(html,sha);
assert.match(decorated,new RegExp(`thebe-dock-recovery-geometry-v268\\.js\\?release=${sha}`),'all HTML surfaces load the recovery guard with release identity');
assert.equal((decorated.match(/thebe-dock-recovery-geometry-v268\.js/g)||[]).length,1,'guard is injected once');
assert.equal(versionReleaseAssets(decorated,sha),decorated,'guard injection remains idempotent');

console.log('PASS: V268 emergency dock mirrors compact desktop/mobile geometry, compact voice sizing, recovery cleanup and release-bound delivery');
