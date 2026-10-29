import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const market=readFileSync('public/assets/market-thebe-gemini-v273.css','utf8');
const workspace=readFileSync('public/assets/thebe-spatial-dock-v246.css','utf8');
test('workspace rail follows Market width and radius tokens',()=>{
 for(const token of ['clamp(360px,28vw,420px)','min(560px,calc(100vw - 64px))','clamp(332px,31vw,360px)','min(460px,calc(100vw - 48px))']){
  assert.ok(market.includes(token),'Market missing '+token);
  assert.ok(workspace.includes(token),'Workspace missing '+token);
 }
});
test('workspace voice and accessibility survive design parity',()=>{
 assert.match(workspace,/\.thebe-ai-voice-card\{/);
 assert.match(workspace,/focus-visible/);
 assert.match(workspace,/prefers-reduced-motion:reduce/);
 assert.match(workspace,/data-surface="workspace"\]/);
 assert.doesNotMatch(workspace,/data-surface="public"\]/);
});
