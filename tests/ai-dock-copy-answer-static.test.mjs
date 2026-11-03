import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const source=readFileSync(new URL("../public/js/thebe-live-voice.js",import.meta.url),"utf8");
const start=source.indexOf("Capture the rendered answer");
const end=source.indexOf("const actions=",start);
assert.ok(start>=0&&end>start,"answer copy handler must be present");
const fragment=source.slice(start,end);

test("AI Dock copies the rendered answer snapshot, not a later answer",()=>{
 assert.match(fragment,/Copy answer/);
 assert.match(fragment,/const answerForCopy=lastAnswer/);
 assert.match(fragment,/navigator\.clipboard\.writeText\(answerForCopy\\)/);
 assert.doesNotMatch(fragment,/navigator\.clipboard\.writeText\(lastAnswer\\)/);
 assert.match(fragment,/Copy unavailable/);
 assert.match(fragment,/if\(answerForCopy\\)/);
});
test("copy action is explicitly clicked and does not create share links",()=>{
 assert.match(fragment,/addEventListener\("click"/);
 assert.doesNotMatch(fragment,/fetch\(|shareUrl|createObjectURL|localStorage/);
});
