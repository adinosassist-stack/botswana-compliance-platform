import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
test('AI Dock does not surface suggested-question chips on mode changes',()=>{
  assert.match(source,/if\(quick\)\{quick\.hidden=true;quick\.replaceChildren\(\)\}/);
  assert.doesNotMatch(source,/if\(quick\)\{quick\.dataset\.mode="";renderQuickActions\(surfaceMode\(\)\)\}/);
});
test('AI Dock retains existing attachment picker and send controls',()=>{
  assert.match(source,/aria-label","Add files"/);
  assert.match(source,/stageFiles\(fileInput\.files/);
});
