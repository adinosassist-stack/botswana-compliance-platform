import assert from 'node:assert/strict';
import fs from 'node:fs';

const dock=fs.readFileSync('public/js/thebe-live-voice.js','utf8');
const geometry=fs.readFileSync('public/js/thebe-dock-recovery-geometry-v269.js','utf8');
assert.match(dock,/aria-label","Add files"/,'Existing file picker must remain accessible');
assert.match(dock,/stageFiles\(fileInput\.files/,'File picker must stage selected files');
assert.doesNotMatch(dock,/scroll\.append\(contextBar,modeRail,voiceCard,quick,responseBox\)/,'Preset question panel must not be mounted');
assert.match(dock,/headActions\.append\(attentionButton,exportAnswer,clearButton,expand,minimize\)/,'Answer export must be accessible');
assert.match(geometry,/WORKSPACE_POSITION_KEY/,'Dock position must persist');
assert.match(geometry,/setDockPosition\(dock/,'Dock movement must clamp to viewport');
assert.match(geometry,/title\.addEventListener\("pointerdown"/,'Drag must start from title');
assert.match(geometry,/title\.addEventListener\("dblclick"/,'Position reset must be available');
assert.match(geometry,/ensureWorkspaceResizeHandle\(dock\)/,'Existing resize handle must remain');
assert.doesNotMatch(geometry,/ensureDockMovement\\(dock\\);const saved=readDockPosition\\(\\)/,'Repair must not reset the dock while dragging');
assert.match(geometry,/getPropertyValue\\("--thebe-dock-float-left"\\)!==x\\+"px"/,'Dock geometry writes must be guarded against redundant mutation loops');
console.log('AI Dock minimal contract checks passed');
