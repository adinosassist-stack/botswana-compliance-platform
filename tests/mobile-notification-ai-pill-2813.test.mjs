import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const voice=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const dock=fs.readFileSync("public/assets/thebe-ai-dock.css","utf8");
const notices=fs.readFileSync("public/assets/delivery-reminder-notifications.css","utf8");

test("Thebe pill source parses and drag is grip-only",()=>{
  execFileSync(process.execPath,["--check","public/js/thebe-live-voice.js"]);
  assert.match(voice,/thebe-ai-pill-grip/);
  assert.match(voice,/event\.target\.closest\?\.\("\.thebe-ai-pill-grip"\)/);
  assert.match(voice,/pill\.setPointerCapture\?\./);
  assert.match(voice,/pillSuppressClick/);
  assert.match(voice,/setCollapsed\(false\)/);
});
test("movable pill stays within viewport and stores only normalized coordinates",()=>{
  assert.match(voice,/Math\.max\(b\.left,Math\.min/);
  assert.match(voice,/thebe-ai-pill-position-v1/);
  assert.match(voice,/global\.visualViewport\?\.addEventListener\("resize",restorePill/);
  assert.match(voice,/event\.altKey/);
  assert.match(dock,/#thebeAiDockPill \.thebe-ai-pill-grip/);
  assert.match(dock,/prefers-reduced-motion:reduce/);
});
test("notification sheet is content-sized with inner scrolling and accessible actions",()=>{
  assert.match(notices,/height:max-content!important/);
  assert.match(notices,/bottom:auto!important/);
  assert.match(notices,/100dvh - 128px - env\\(safe-area-inset-bottom/);
  assert.match(notices,/\.thebe-delivery-sheet-list\{flex:0 1 auto;min-height:0;overflow-y:auto\}/);
  assert.match(notices,/\.thebe-delivery-reminder-actions/);
  assert.match(notices,/\.thebe-delivery-manager-popup\[hidden\]\{display:none!important\}/);
});
