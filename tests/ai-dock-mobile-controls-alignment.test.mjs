import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/assets/thebe-spatial-dock-v246.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
test('hidden composer controls remain invisible even when base CSS sets display inline-flex',()=>{
 assert.match(css,/#thebeAiDock \.thebe-ai-compose :is\(\.thebe-ai-composer-action,\.thebe-ai-send\)\[hidden\]\s*\{\s*display:none!important/);
 assert.match(js,/sendButton\.hidden=!draft&&!textBusy/);
 assert.match(js,/audioButton\.hidden=draft\|\|textBusy/);
 assert.match(js,/attachButton\.hidden=!shellVisible\(\)/);
});
test('mobile composer keeps actions bounded and text input shrinkable',()=>{
 const start=css.lastIndexOf('/* Mobile composer: authoritative hidden states');
 assert.ok(start>=0);
 const mobile=css.slice(start);
 assert.match(mobile,/@media \(max-width:767px\)/);
 assert.match(mobile,/\.thebe-ai-compose-body\s*\{[\s\S]*?min-width:0!important/);
 assert.match(mobile,/\.thebe-ai-compose :is\(\.thebe-ai-composer-action,\.thebe-ai-send\)\s*\{[\s\S]*?flex:0 0 38px!important/);
 assert.match(mobile,/\.thebe-ai-compose textarea\s*\{[\s\S]*?max-width:100%!important/);
 assert.match(mobile,/align-items:flex-end!important/);
});
test('change is scoped to existing dock composer and does not activate features',()=>{
 const end=css.slice(css.lastIndexOf('/* Mobile composer: authoritative hidden states'));
 assert.doesNotMatch(end,/(?:^|\n)\s*(?:body|main|aside|:root)\s*\{/);
 assert.doesNotMatch(end,/gradient\(/);
 assert.match(js,/compose\.append\(attachButton,fileInput,composeBody,audioButton,conversationVoiceButton,sendButton\)/);
});
