import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/js/thebe-assets-native-panel.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/thebe-assets-native-panel.css',import.meta.url),'utf8');
test('read-only attention derives exclusively from authorized existing summary',()=>{
 assert.match(js,/capability\?\.enabled!==true/);
 assert.match(js,/capability\?\.authenticated!==true/);
 assert.match(js,/capability\?\.tenantAuthorized!==true/);
 assert.match(js,/data\.maintenanceDue\+data\.insuranceDue/);
 assert.match(js,/No maintenance or insurance items currently due/);
 assert.match(js,/Asset data unavailable/);
 assert.match(js,/attention\.textContent=""/);
});
test('insurance navigation is injected by the host, never an auto-route or a write',()=>{
 assert.match(js,/onOpenInsurance/);
 assert.match(js,/typeof callback==="function"/);
 assert.doesNotMatch(js,/(?:innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.write)\s*[=(]/);
 assert.doesNotMatch(js,/fetch\(|location\.assign|location\.href|\.submit\(/);
});
test('attention styling is scoped, responsive and has no gradients',()=>{
 assert.match(css,/\.thebe-assets-native-attention/);
 assert.match(css,/\[data-priority="attention"\]/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(css,/gradient\(/i);
 assert.doesNotMatch(css,/(?:^|\n)\s*(?:body|main|aside|:root)\s*\{/);
});
