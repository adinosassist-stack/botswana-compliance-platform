import assert from "node:assert/strict";
import fs from "node:fs";
import {THEBE_PRONUNCIATION,thebePronunciationGuidance,botswanaNameGuidance} from "../cloudflare/src/thebe-pronunciation.js";

const realtime=fs.readFileSync(new URL("../cloudflare/src/agentic-live-voice.js",import.meta.url),"utf8");
const preview=fs.readFileSync(new URL("../cloudflare/src/agentic-live-preview.js",import.meta.url),"utf8");

assert.equal(THEBE_PRONUNCIATION.written,"Thebe");
assert.equal(THEBE_PRONUNCIATION.spoken,"TEH-beh");
assert.equal(THEBE_PRONUNCIATION.language,"Setswana");
assert.equal(THEBE_PRONUNCIATION.syllables,2);
assert.equal(THEBE_PRONUNCIATION.stress,"first");

const cue=thebePronunciationGuidance();
assert.match(cue,/clear T sound at the start/);
assert.match(cue,/clear B sound in the second syllable/);
assert.match(cue,/Do not pronounce the initial Th as the English th sound/);
assert.match(botswanaNameGuidance(),/Botswana and Setswana names/);

assert.equal((realtime.match(/thebePronunciationGuidance\(\)/g)||[]).length,2,"workspace and marketing voice use the shared pronunciation profile");
assert.equal((preview.match(/thebePronunciationGuidance\(\)/g)||[]).length,1,"GPT-Live preview uses the shared pronunciation profile");
assert.equal((realtime.match(/botswanaNameGuidance\(\)/g)||[]).length,2);
assert.equal((preview.match(/botswanaNameGuidance\(\)/g)||[]).length,1);
assert.doesNotMatch(realtime,/Pronounce the brand name Thebe as TEH-beh:/);
assert.doesNotMatch(preview,/Pronounce the brand name Thebe as TEH-beh:/);
assert.match(realtime,/You are Thebe, the live voice interface for Thebe Desk\./);
assert.match(preview,/You are Thebe, the GPT-Live preview voice interface for Thebe Desk\./);
console.log("V294 shared Thebe pronunciation profile passed");
