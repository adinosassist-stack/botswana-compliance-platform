import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const controller=fs.readFileSync("public/js/thebe-unified-dock-v330.js","utf8");
const css=fs.readFileSync("public/assets/thebe-unified-dock-v330.css","utf8");
const workspace=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const marketLoader=fs.readFileSync("public/js/public-marketing-v249.js","utf8");
const preservedMarket=fs.readFileSync("public/js/public-marketing-v249-base.js","utf8");
const liveVoice=fs.readFileSync("public/js/thebe-live-voice.js","utf8");

for(const path of ["public/js/thebe-unified-dock-v330.js","public/js/workspace-readiness-v305.js","public/js/public-marketing-v249.js","public/js/public-marketing-v249-base.js"]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.match(controller,/thebe_voice_profile_v1/);
assert.match(controller,/female:Object\.freeze\(\{id:"marin"/);
assert.match(controller,/male:Object\.freeze\(\{id:"cedar"/);
assert.match(controller,/type:"session\.update"/);
assert.match(controller,/audio:\{output:\{voice\}\}/);
assert.match(controller,/RTCPeerConnection/);
assert.match(controller,/createDataChannel/);
assert.match(controller,/oai-events/);
assert.match(controller,/thebe:voice-preference/);
assert.match(controller,/getElementById\("thebeAiDock"\)/);
assert.match(controller,/data-thebe-voice-settings-v330|thebeVoiceSettingsV330/);
assert.match(css,/data-surface="public"/);
assert.match(css,/data-surface="workspace"/);
assert.match(css,/thebe-ai-voice-mount/);
assert.doesNotMatch(css,/gradient\(/);
assert.match(workspace,/thebe-unified-dock-v330\.js/);
assert.match(marketLoader,/public-marketing-v249-base\.js/);
assert.match(marketLoader,/thebe-unified-dock-v330\.js/);
assert.match(preservedMarket,/Run your whole business from one intelligent desk/);
assert.match(liveVoice,/const STORE_KEY="thebe_ai_dock_collapsed_v5"/);
assert.match(liveVoice,/data\.surface|dataset\.surface/);

console.log("v330 unified Market/Workspace dock and voice settings contract passed");
