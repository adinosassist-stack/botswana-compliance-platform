import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const runtime=readFileSync(new URL("../public/js/thebe-live-voice.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/assets/thebe-ai-immersive-v1.css",import.meta.url),"utf8");

// Source-level invariants; authenticated Android/keyboard/voice testing is separate.
assert.match(runtime,/thebe-aura-sphere/,"The approved clean blue sphere is mounted");
assert.doesNotMatch(runtime,/thebe-aura-curve|thebeAuraSilk|thebeAuraFold/,"The superseded dominant stripe is not generated");
assert.match(runtime,/thebeAuraStroke/,"The orb retains its thin illuminated rim");
assert.match(runtime,/thebe-live-audio-level/,"The real audio event remains wired");
assert.match(runtime,/--thebe-aura-energy/,"The orb receives measured voice energy");
assert.match(runtime,/channel==="input"/,"Listening responds to microphone levels");
assert.match(runtime,/channel==="output"/,"Speaking responds to output levels");
assert.match(runtime,/thebe-aura-welcome/,"Immersive welcome is mounted");
assert.match(runtime,/appendConversationTurn\("user",q\)/,"The typed request becomes a visible turn");
assert.match(runtime,/archiveCurrentAnswer\(\)/,"Previous answers are retained before the next request");
assert.match(runtime,/TEXT_HISTORY_LIMIT=24/,"In-memory history is bounded");
assert.match(runtime,/voiceCompletedTurns\.splice\(0\)/,"Clearing chat removes per-session voice turns");
assert.match(runtime,/aria-label","End voice conversation"/,"An accessible voice stop control remains");
assert.match(runtime,/aria-label","Mute microphone"/,"An accessible microphone control remains");
assert.match(runtime,/recoverDockPresentation\(\)/,"Dock recovery remains defined");
assert.match(runtime,/dataset\.expanded==="true"\|\|document\.body\.classList\.contains\("thebe-voice-active"\)/,"Compact geometry recovery does not overwrite fullscreen");
assert.match(runtime,/thebeAuraImmersiveStyle/,"Immersive styling loads only when the AI dock mounts");
assert.match(runtime,/compactStylesReady/,"Immersive layout requires healthy compact stylesheet");
assert.doesNotMatch(css,/--thebe-spatial-dock\s*:\s*1/,"Immersive CSS must not fake a healthy spatial dock");
assert.match(css,/thebe-aura-light-flow/,"Orb has its own motion");
assert.match(css,/\[data-phase="listening"\]/,"Listening has a motion state");
assert.match(css,/\[data-phase="speaking"\]/,"Speaking has a motion state");
assert.match(css,/prefers-reduced-motion:reduce/,"Reduced-motion alternatives are available");
assert.match(css,/safe-area-inset-bottom/,"Input respects phone safe areas");
assert.match(css,/thebe-aura-history/,"Conversation stays readable in fullscreen");
assert.match(css,/\[data-conversation="true"\]/,"Conversation uses a compact orb layout");
assert.doesNotMatch(runtime,/localStorage\.setItem\([^\n]*conversationHistory/,"No chat history written to localStorage");
console.log("Thebe Aura fullscreen source invariants passed");

// Exercise the production completion handler independently of partial-caption events.
// Completed transcripts must reveal history even when a provider emits no delta.
const retainSource=runtime.slice(runtime.indexOf('  function retainVoiceTurn('),runtime.indexOf('  let voiceChatActivity=null;'));
const state={dock:{dataset:{conversation:'false'}},voiceCompletedTurns:[],VOICE_TURN_LIMIT:20,
  clean:value=>String(value||'').trim(),syncVoiceChatActivity:()=>{}};
vm.createContext(state);
vm.runInContext(retainSource,state);
vm.runInContext('retainVoiceTurn("user","A complete question")',state);
assert.equal(state.dock.dataset.conversation,'true','A completed caption reveals conversation layout without a delta');
assert.equal(state.voiceCompletedTurns[0].content,'A complete question');
vm.runInContext('retainVoiceTurn("user","A complete question")',state);
assert.equal(state.voiceCompletedTurns.length,1,'Repeated completion does not duplicate a turn');
vm.runInContext('retainVoiceTurn("assistant","")',state);
assert.equal(state.voiceCompletedTurns.length,1,'Empty completion adds no turn');
for(let i=0;i<30;i++)vm.runInContext(`retainVoiceTurn("assistant","Answer ${i}")`,state);
assert.equal(state.voiceCompletedTurns.length,20,'Voice history stays bounded');
assert.equal(state.voiceCompletedTurns.at(-1).content,'Answer 29','Newest completion survives bounding');
console.log('Aura completed-caption behavior passed');
