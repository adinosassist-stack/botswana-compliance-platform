import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../public/assets/thebe-ai-dock.css',import.meta.url),'utf8');

assert.match(css,/V161 dock polish/);
assert(!/gradient\(/i.test(css),'Thebe AI dock must keep the flat corporate palette without gradients');
assert.match(css,/--thebe-dock-w:392px/);
assert.match(css,/\.thebe-ai-send\{[\s\S]*?width:46px;height:46px/);
assert.match(css,/\.thebe-ai-quick button\{[\s\S]*?min-height:56px/);
assert.match(css,/\.thebe-ai-dock\[data-conversation="true"\] \.thebe-ai-voice-card\{[\s\S]*?display:grid/);
assert.match(css,/\.thebe-ai-dock\[data-conversation="true"\] \.thebe-ai-orb-button\{[\s\S]*?width:72px;[\s\S]*?height:72px/);
assert.match(css,/@media\(max-width:1023px\)\{[\s\S]*?border-radius:24px 24px 18px 18px/);
assert.match(css,/\.thebe-ai-dock:before\{[\s\S]*?width:34px;height:3px/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);

console.log('PASS: V161 Thebe AI dock preserves flat palette, compact conversation mode, mobile sheet treatment and usable control sizing.');
