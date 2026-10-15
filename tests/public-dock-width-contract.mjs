import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('public/assets/market-thebe-gemini-v273.css','utf8');
const js=fs.readFileSync('public/js/market-thebe-gemini-narrow-v274.js','utf8');

assert.match(css,/width:clamp\(360px,28vw,420px\)!important;/,'wide desktop keeps the compact Gemini-style rail');
assert.match(css,/body\.thebe-ai-expanded #thebeAiDock\[data-surface="public"\][\s\S]*?width:min\(560px,calc\(100vw - 64px\)\)!important;[\s\S]*?max-width:560px!important;/,'wide desktop expands to the recommended 560px reading width');
assert.match(css,/body\.thebe-ai-expanded #thebeAiDock\[data-surface="public"\][\s\S]*?width:min\(460px,calc\(100vw - 48px\)\)!important;[\s\S]*?max-width:460px!important;/,'medium desktop caps the expanded dock at 460px');
assert.match(css,/body\.thebe-ai-expanded:has\(#thebeAiDock\[data-surface="public"\][\s\S]*?#marketingGate[\s\S]*?padding-right:/,'expanded width also reserves the market-page content lane');
assert.match(css,/#thebeAiDock\[data-surface="public"\] \.thebe-ai-expand\{[\s\S]*?display:inline-flex!important;/,'desktop exposes the existing expand control');
assert.match(css,/@media \(max-width:1023px\)[\s\S]*?#thebeAiDock\[data-surface="public"\] \.thebe-ai-expand\{[\s\S]*?display:none!important;/,'mobile keeps width controls out of the contained dock');

assert.match(js,/function geometry\(viewportWidth,expanded=false\)/,'runtime geometry must accept expanded state');
assert.match(js,/viewportWidth>=1200[\s\S]*?if\(expanded\)[\s\S]*?width:560[\s\S]*?maxWidth:560/,'runtime wide desktop must preserve the 560px expanded width');
assert.match(js,/viewportWidth>=1024[\s\S]*?if\(expanded\)[\s\S]*?width:460[\s\S]*?maxWidth:460/,'runtime medium desktop must preserve the 460px expanded width');
assert.match(js,/dock\.dataset\.expanded==="true"\|\|document\.body\?\.classList\.contains\("thebe-ai-expanded"\)/,'runtime must read the same expanded state used by the dock control');
assert.match(js,/geometry\(window\.innerWidth,expanded\)/,'runtime geometry must receive expanded state instead of reapplying compact width');
assert.match(js,/attributeFilter:\["hidden","aria-hidden","data-surface","data-expanded","class","style"\]/,'runtime observer must react directly to data-expanded changes');
assert.doesNotMatch(js,/const size=geometry\(window\.innerWidth\);/,'runtime must never ignore expanded state');

console.log('PUBLIC_DOCK_WIDTH_CONTRACT_PASS: CSS and runtime agree on compact mode, 560px wide expansion, 460px medium expansion, reserved lane and mobile containment');
