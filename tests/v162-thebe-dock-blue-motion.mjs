import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../public/assets/thebe-ai-dock.css',import.meta.url),'utf8');

assert.match(css,/V161 dock polish/);
assert.match(css,/V162 blue motion/);
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
