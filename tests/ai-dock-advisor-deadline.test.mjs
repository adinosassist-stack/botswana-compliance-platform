import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dock=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../public/js/api-client.js',import.meta.url),'utf8');
test('text advisor has bounded longer timeout than generic transport',()=>{
 assert.match(api,/timeoutMs=18000/,'generic API deadline remains unchanged');
 assert.match(dock,/api\("\/api\/ai\/advisor",\{/);
 assert.match(dock,/timeoutMs:attachments\.length\?120000:45000/);
});
test('text and attachment calls retain request abort and no new manual retry',()=>{
 const from=dock.indexOf('const result=await api("/api/ai/advisor"');
 const to=dock.indexOf('if(runId!==textRunId)return;',from);
 assert.ok(from>=0&&to>from);
 const block=dock.slice(from,to);
 assert.match(block,/signal:controller\.signal/);
 assert.doesNotMatch(block,/for\s*\(|while\s*\(|setTimeout\s*\(/);
});
