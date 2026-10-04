import fs from 'node:fs';
import assert from 'node:assert/strict';

const guard=fs.readFileSync('public/js/workspace-property-route-isolation-v277.js','utf8');
const delivery=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
const runtime=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');

assert.match(guard,/20261004-property-route-isolation-v277/,'V277 release marker must be explicit');
assert.match(guard,/PROPERTY_VIEW_ID="propertyintelligence"/,'guard must be scoped to Property only');
assert.match(guard,/document\.querySelector\("\.view\.active"\)/,'guard must resolve the active workspace route from DOM state');
assert.match(guard,/setProperty\("display","none","important"\)/,'inactive Property must defeat stale display:block!important repairs');
assert.match(guard,/setAttribute\("aria-hidden","true"\)/,'inactive Property must be hidden from assistive technology');
assert.match(guard,/setAttribute\("inert",""\)/,'inactive Property must be non-interactive');
assert.match(guard,/new MutationObserver\(scheduleReconcile\)/,'guard must catch delayed style/attribute repairs');
assert.match(guard,/thebe:workspace-view-change/,'guard must reconcile on workspace navigation');
assert.match(guard,/propertyIsActive\(view\)\?releaseActiveProperty\(view\):isolateInactiveProperty\(view\)/,'active Property must not remain isolated');

assert.match(delivery,/workspace-property-route-isolation-v277\.js/,'V277 must be delivered through the production asset injector');
assert.match(delivery,/includeWorkspaceFixes===true[^\n]+WORKSPACE_PROPERTY_ROUTE_ISOLATION_SRC/,'V277 must be limited to workspace-fix surfaces');

assert.match(runtime,/function scheduleResidentPropertyVisibility\(target\)/,'the regression must remain grounded in the resident Property repair path');
assert.match(runtime,/setTimeout\(\(\)=>enforceResidentPropertyVisibility\(target\),700\)/,'the historical 700ms stale-repair race must stay represented in the qualification');
assert.match(runtime,/target\.style\.setProperty\("display","block","important"\)/,'qualification must cover the stale forced-visible behavior');

console.log('V277 Property route-isolation contract passed');
