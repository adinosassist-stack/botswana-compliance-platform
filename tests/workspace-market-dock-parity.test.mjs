import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const market=readFileSync('public/assets/market-thebe-gemini-v273.css','utf8');
const workspace=readFileSync('public/assets/thebe-spatial-dock-v246.css','utf8');
test('workspace retains Market chat chrome without overriding collision-tested rail widths',()=>{
 for(const token of ['background:#191919!important','border-radius:28px!important','font-size:16px!important']){
  assert.ok(market.includes(token),'Market missing '+token);
  assert.ok(workspace.includes(token),'Workspace missing '+token);
 }
 assert.doesNotMatch(workspace,/html body #thebeAiDock\[data-surface="workspace"\]:not\(\.thebe-ai-dragging\)/);
});
test('workspace voice and accessibility survive visual parity',()=>{
 assert.match(workspace,/\.thebe-ai-voice-card\{/);
 assert.match(workspace,/focus-visible/);
 assert.match(workspace,/prefers-reduced-motion:reduce/);
});
