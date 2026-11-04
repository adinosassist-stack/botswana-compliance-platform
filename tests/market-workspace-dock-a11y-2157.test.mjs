import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const market = readFileSync('public/assets/market-thebe-gemini-v273.css', 'utf8');
const workspace = readFileSync('public/assets/thebe-spatial-dock-v246.css', 'utf8');

test('Market AI dock keyboard focus and text composer focus-within are visible', () => {
  assert.match(market, /#thebeAiDock\[data-surface="public"\][^\n]*:is\(button,textarea,input,a\):focus-visible/);
  assert.match(market, /#thebeAiDockPill\[data-surface="public"\]:focus-visible/);
  assert.match(market, /#thebeAiDock\[data-surface="public"\] \.thebe-ai-compose:focus-within/);
  assert.match(market, /outline:2px solid/);
});

test('Workspace dock has its own scoped focus treatment without changing Market CSS', () => {
  assert.match(workspace, /#thebeAiDock\[data-surface="workspace"\][^\n]*:is\(button,textarea,input,a,\[tabindex\]\):focus-visible/);
  assert.match(workspace, /#thebeAiDockPill\[data-surface="workspace"\]:focus-visible/);
  assert.match(workspace, /#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-compose:focus-within/);
});

test('Reduced-motion preferences apply to both dock surfaces', () => {
  for (const [surface, css] of [['public', market], ['workspace', workspace]]) {
    const motionBlock = css.slice(css.lastIndexOf('@media (prefers-reduced-motion:reduce)'));
    assert.ok(motionBlock.length > 0, surface);
    assert.ok(motionBlock.includes(`#thebeAiDock[data-surface="${surface}"]`), surface);
    assert.match(motionBlock, /animation-duration:0\.01ms!important/);
    assert.match(motionBlock, /transition-duration:0\.01ms!important/);
    assert.match(motionBlock, /scroll-behavior:auto!important/);
  }
});

test('Mobile Market safe-area launcher lane and full-viewport panels remain declared', () => {
  assert.match(market, /env\(safe-area-inset-bottom\)/);
  assert.match(market, /height:calc\(100dvh - 64px - env\(safe-area-inset-bottom\)\)/);
  assert.match(market, /#thebeAiDock\[data-surface="public"\]:not\(\[hidden\]\)/);
  assert.match(workspace, /#thebeAiDock\[data-surface="workspace"\]:not\(\[hidden\]\)/);
});

test('Workspace voice and mobile composer contracts are preserved', () => {
  assert.match(workspace, /#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-voice-card\{\s*display:flex!important/);
  assert.match(workspace, /\.thebe-ai-composer-action,\.thebe-ai-send\)\[hidden\]/);
  assert.match(workspace, /\.thebe-ai-compose-body\{\s*flex:1 1 0%!important/);
});
