import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const componentsPath="public/js/components.js";
const clientPath="public/js/thebe-live-voice.js";

for(const path of [componentsPath,clientPath]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

const components=fs.readFileSync(componentsPath,"utf8");
const client=fs.readFileSync(clientPath,"utf8");

const start=components.indexOf("(function installThebeVoiceStratumMotion");
assert.ok(start>=0,"Thebe voice motion installer must remain present");
const end=components.indexOf("})(window);",start);
assert.ok(end>start,"Thebe voice motion installer must remain self-contained");
const visual=components.slice(start,end+")(window);".length);

assert.match(visual,/\.thebe-voice-screen \.thebe-voice-sphere\{/,
  "voice motion must stay scoped to the fullscreen voice surface");
assert.doesNotMatch(visual,/(^|\n)\s*\.thebe-voice-sphere(?:\{|::|\[)/m,
  "voice sphere styling must never become a global workspace selector");
assert.match(visual,/transform:scale\(var\(--thebe-voice-energy,1\)\)/,
  "fullscreen motion must remain driven by live audio energy");
assert.match(visual,/filter:saturate\(var\(--thebe-voice-saturation\)\) brightness\(var\(--thebe-voice-brightness\)\)/,
  "phase brightness and saturation must be composed through stable custom properties");

const phaseContracts=[
  ["connecting","9s","1.05",".94"],
  ["ready","6.4s","1.15","1.04"],
  ["thinking","4.1s","1.2","1.02"],
  ["speaking","2.8s","1.25","1.12"]
];
for(const [phase,speed,saturation,brightness] of phaseContracts){
  const escapedPhase=phase.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const pattern=new RegExp(`data-phase=\\"${escapedPhase}\\"\\][^\\n]*--thebe-fold-speed:${speed.replace(".","\\.")};[^\\n]*--thebe-voice-saturation:${saturation.replace(".","\\.")};[^\\n]*--thebe-voice-brightness:${brightness.replace(".","\\.")}`);
  assert.match(visual,pattern,`${phase} phase must keep its explicit visual-state contract`);
}
assert.match(visual,/data-phase=\"listening\"\],\n\.thebe-voice-screen \.thebe-voice-sphere\[data-phase=\"ready\"\]/,
  "listening and ready must share the calm motion profile");
assert.match(visual,/data-phase=\"speaking\"[^\n]*box-shadow:/,
  "speaking must keep the stronger live glow");

const bodyKeyframes=visual.match(/@keyframes thebeVoiceBody\{([\s\S]*?)\n\}/);
assert.ok(bodyKeyframes,"main voice morph keyframes must remain present");
assert.doesNotMatch(bodyKeyframes[1],/\bfilter\s*:/,
  "body morph keyframes must not override phase brightness or saturation");

assert.match(visual,/@media \(max-width:600px\)\{\.thebe-voice-screen \.thebe-voice-sphere\{width:clamp\(174px,58vw,260px\)\}\}/,
  "mobile voice sphere sizing must remain bounded");
assert.match(visual,/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*animation:none!important;transition:none!important/,
  "reduced-motion users must not receive the continuous morph animation");

assert.match(client,/voiceScreen=el\("dialog","thebe-voice-screen"\)/,
  "voice mode must remain a modal dialog rather than an in-workspace overlay");
assert.match(client,/voiceScreenOrb=el\("div","thebe-voice-sphere"\)/,
  "fullscreen voice dialog must own the animated sphere");
assert.match(client,/voiceScreenOrb\.dataset\.phase=voicePhase/,
  "voice state changes must continue driving data-phase on the fullscreen sphere");
assert.match(client,/voiceScreen\.showModal\(\);document\.body\.classList\.add\("thebe-voice-active"\)/,
  "opening voice mode must activate the fullscreen voice lifecycle");
assert.match(client,/if\(voiceScreen\?\.open\)voiceScreen\.close\(\)/,
  "closing voice mode must close the modal dialog");
assert.match(client,/document\.body\.classList\.remove\("thebe-voice-active"\)/,
  "closing voice mode must clear the fullscreen body state");
assert.match(client,/if\(next==="idle"\)closeVoiceScreen\(\)/,
  "an idle live-voice state must close the fullscreen surface");
assert.match(client,/voiceScreenOrb\?\.style\.setProperty\("--thebe-voice-energy",scale\.toFixed\(3\)\)/,
  "live input/output energy must continue driving fullscreen motion amplitude");
assert.match(client,/\(voicePhase==="listening"&&channel==="input"\)\|\|\(voicePhase==="speaking"&&channel==="output"\)/,
  "only relevant input/output channels may animate the active voice phase");

console.log("v249 Thebe voice motion visual contract: PASS");
