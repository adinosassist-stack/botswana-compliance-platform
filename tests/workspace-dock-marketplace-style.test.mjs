import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const css=readFileSync("public/assets/thebe-spatial-dock-v246.css","utf8");
test("workspace dock mirrors marketplace conversation chrome without altering public dock",()=>{
 assert.match(css,/#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-compose/);
 assert.match(css,/border-radius:28px!important/);
 assert.match(css,/#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-response/);
 assert.match(css,/#thebeAiDock\[data-surface="workspace"\] :is\(/);
 assert.doesNotMatch(css,/html body #thebeAiDock\[data-surface="public"\] \.thebe-ai-compose/);
});
