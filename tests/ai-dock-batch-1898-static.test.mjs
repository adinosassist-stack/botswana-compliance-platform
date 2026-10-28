import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/assets/thebe-spatial-dock-v246.css', import.meta.url), 'utf8');

test('AI Dock keeps keyboard focus visible', () => {
  assert.match(css, /#thebeAiDock :is\(button,textarea,input,select,a\):focus-visible/);
  assert.match(css, /outline:2px solid/);
});

test('AI Dock contains long text and narrow composer', () => {
  assert.match(css, /\.thebe-ai-response\{min-width:0;overflow-wrap:anywhere/);
  assert.match(css, /\.thebe-ai-compose textarea\{min-width:0;max-width:100%/);
});

test('AI Dock constrains small viewport and respects reduced motion', () => {
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /max-width:calc\(100vw - 16px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('AI Dock touch controls retain manipulation behavior', () => {
  assert.match(css, /#thebeAiDock button\{touch-action:manipulation\}/);
});
