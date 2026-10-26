import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const source=readFileSync(new URL("../public/js/thebe-live-voice.js",import.meta.url),"utf8");
test("AI Dock offers explicit answer-only copy action",()=>{
 assert.match(source,/Copy answer/);
 assert.match(source,/navigator\.clipboard\.writeText\(lastAnswer\)/);
 assert.match(source,/Copy unavailable/);
 assert.match(source,/if\(lastAnswer\)/);
});
test("copy action does not expose public share links or auto-copy",()=>{
 const fragment=source.slice(source.indexOf("Copy only the visible assistant answer"),source.indexOf("const actions=",source.indexOf("Copy only the visible assistant answer")));
 assert.match(fragment,/addEventListener\("click"/);
 assert.doesNotMatch(fragment,/fetch\(|shareUrl|createObjectURL|localStorage/);
});
