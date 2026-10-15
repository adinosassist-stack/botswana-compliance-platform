import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('public/assets/market-thebe-gemini-v273.css','utf8');

assert.match(css,/width:clamp\(360px,28vw,420px\)!important;/,'wide desktop keeps the compact Gemini-style rail');
assert.match(css,/body\.thebe-ai-expanded #thebeAiDock\[data-surface="public"\][\s\S]*?width:min\(560px,calc\(100vw - 64px\)\)!important;[\s\S]*?max-width:560px!important;/,'wide desktop expands to the recommended 560px reading width');
assert.match(css,/body\.thebe-ai-expanded #thebeAiDock\[data-surface="public"\][\s\S]*?width:min\(460px,calc\(100vw - 48px\)\)!important;[\s\S]*?max-width:460px!important;/,'medium desktop caps the expanded dock at 460px');
assert.match(css,/body\.thebe-ai-expanded:has\(#thebeAiDock\[data-surface="public"\][\s\S]*?#marketingGate[\s\S]*?padding-right:/,'expanded width also reserves the market-page content lane');
assert.match(css,/#thebeAiDock\[data-surface="public"\] \.thebe-ai-expand\{[\s\S]*?display:inline-flex!important;/,'desktop exposes the existing expand control');
assert.match(css,/@media \(max-width:1023px\)[\s\S]*?#thebeAiDock\[data-surface="public"\] \.thebe-ai-expand\{[\s\S]*?display:none!important;/,'mobile keeps width controls out of the contained dock');

console.log('PUBLIC_DOCK_WIDTH_CONTRACT_PASS: compact market rail, 560px recommended desktop expansion, 460px medium cap, reserved content lane and mobile containment');
