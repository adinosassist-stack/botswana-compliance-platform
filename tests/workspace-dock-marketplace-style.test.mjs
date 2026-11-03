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

test("chat-first workspace styles preserve merged AI Dock accessibility and mobile safeguards",()=>{
 assert.match(css,/AI Dock finish batch #1898/);
 assert.match(css,/#thebeAiDock :is\(button,textarea,input,select,a\):focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/#thebeAiDock \.thebe-ai-compose\{min-width:0;max-width:calc\(100% - 24px\)/);
});
