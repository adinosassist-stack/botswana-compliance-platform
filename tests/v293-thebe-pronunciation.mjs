import assert from "node:assert/strict";
import fs from "node:fs";

const realtime=fs.readFileSync(new URL("../cloudflare/src/agentic-live-voice.js",import.meta.url),"utf8");
const preview=fs.readFileSync(new URL("../cloudflare/src/agentic-live-preview.js",import.meta.url),"utf8");
const cue="Pronounce the brand name Thebe as TEH-beh: two syllables, with stress on the first syllable. Keep the written brand name as Thebe.";

assert.equal(realtime.split(cue).length-1,2,"workspace and marketing voice must both lock pronunciation");
assert.equal(preview.split(cue).length-1,1,"GPT-Live preview must lock pronunciation");
assert.match(realtime,/You are Thebe, the live voice interface for Thebe Desk\./);
assert.match(realtime,/You are Thebe, the public voice guide for Thebe Desk/);
assert.match(preview,/You are Thebe, the GPT-Live preview voice interface for Thebe Desk\./);
assert.doesNotMatch(realtime,/You are TEH-beh/);
assert.doesNotMatch(preview,/You are TEH-beh/);
console.log("V293 Thebe pronunciation contract passed");
