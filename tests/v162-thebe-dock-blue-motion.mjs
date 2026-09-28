import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../public/assets/thebe-ai-dock.css',import.meta.url),'utf8');

assert.match(css,/V161 dock polish/);
assert.match(css,/V162 blue motion/);
assert.match(css,/V164 futuristic command surface/);
assert.match(css,/V165 workspace dock UX/);
assert.match(css,/V166 workspace polish/);
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\]\{[\s\S]*?--thebe-workspace-edge:24px/,'desktop workspace dock must keep a stronger edge inset');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-quick button:before\{[\s\S]*?display:grid/,'workspace quick actions must retain futuristic command icons');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-quick button\{[\s\S]*?padding:14px 42px 14px 52px/,'workspace quick action labels must stay away from both edges');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-voice-card\{[\s\S]*?grid-template-columns:74px minmax\(0,1fr\)/,'workspace voice surface must use the compact horizontal command layout');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-quick\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'workspace quick actions must use the two-up desktop command grid');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-compose\{[\s\S]*?margin:0 var\(--thebe-workspace-edge\) 10px/,'workspace composer must stay inset from the dock edge');
assert.match(css,/\.thebe-ai-dock-scroll\{[\s\S]*?padding:22px 22px 24px/,'Thebe AI content must keep a comfortable inset from the dock edge');
assert.match(css,/\.thebe-ai-quick button\{[\s\S]*?min-height:68px[\s\S]*?padding:13px 48px 13px 54px/,'quick actions must use the V164 command-card geometry');
assert.match(css,/\.thebe-ai-compose\{[\s\S]*?margin:0 18px 14px[\s\S]*?border-radius:20px/,'composer must float inside the dock instead of touching the edge');
assert.match(css,/\.thebe-ai-send\{[\s\S]*?width:50px;height:50px[\s\S]*?background:#f8fbff/,'send control must use the high-contrast V164 command treatment');
assert(!/gradient\(/i.test(css),'Thebe AI dock must stay flat without gradients');
assert.match(css,/--thebe-dock-bg:#0b66d6/);
assert.match(css,/\.thebe-ai-dock-scroll\{[\s\S]*?background:#0b66d6/);
assert.match(css,/@keyframes thebe-particle-drift-v162/);
assert.match(css,/@keyframes thebe-particle-react-v162/);
assert.match(css,/@keyframes thebe-particle-shimmer-v162/);
assert.match(css,/\.thebe-particle-wave g\{[\s\S]*?animation:thebe-particle-drift-v162/);
assert.match(css,/\.thebe-particle\{[\s\S]*?animation:thebe-particle-shimmer-v162/);
assert.match(css,/data-phase="listening"[\s\S]*?thebe-particle-react-v162/);
assert.match(css,/prefers-reduced-motion:reduce[\s\S]*?\.thebe-particle,[\s\S]*?animation:none!important/);
assert.match(css,/\.thebe-ai-send\{[\s\S]*?width:46px;height:46px/);
assert.match(css,/\.thebe-ai-quick button\{[\s\S]*?min-height:56px/);

console.log('PASS: V162 Thebe AI dock is solid blue with animated idle/reactive particles and reduced-motion protection.');
