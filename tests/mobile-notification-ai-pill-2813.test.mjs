import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
const voice=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const dock=fs.readFileSync("public/assets/thebe-ai-dock.css","utf8");
const notices=fs.readFileSync("public/assets/delivery-reminder-notifications.css","utf8");
test("AI pill runtime parses and has separate chat, microphone and drag controls",()=>{
 execFileSync(process.execPath,["--check","public/js/thebe-live-voice.js"]);
 for(const token of ["thebe-ai-pill-open","thebe-ai-pill-mic","thebe-ai-pill-handle","pillHandle.setPointerCapture","pillMic.addEventListener","orbButton.click()"])
  assert.ok(voice.includes(token),token);
});
test("drag uses viewport clamping, saved coordinates and collision avoidance",()=>{
 for(const token of ["thebe-ai-pill-position-v1","visualViewport","thebeDeliveryManagerBell","pointercancel","pillSync","event.altKey","savePill()"])
  assert.ok(voice.includes(token),token);
 assert.ok(dock.includes("prefers-reduced-motion:reduce"));
});
test("notification sheet is content-sized and preserves bottom navigation clearance",()=>{
 for(const token of ["height:max-content!important","bottom:auto!important","var(--thebe-vv-height","safe-area-inset-bottom","thebe-delivery-sheet-list","overflow-y:auto","thebe-delivery-reminder-actions"])
  assert.ok(notices.includes(token),token);
});
test("voice shortcut invokes existing governed voice handler",()=>{
 assert.match(voice,/pillMic\.addEventListener\("click",\(\)=>orbButton\.click\(\)\)/);
});

test("cancelled drag restores starting coordinates",()=>{
 assert.match(voice,/const \{left,top\}=pillDrag;\s*pillDrag=null;clampPill\(left,top\)/);
});
test("mobile pill microphone and drag handles meet 44px touch target",()=>{
 assert.match(dock,/#thebeAiDockPill \.thebe-ai-pill-mic\{width:44px;min-width:44px\}/);
 assert.match(dock,/#thebeAiDockPill \.thebe-ai-pill-handle\{width:44px;min-width:44px\}/);
});
