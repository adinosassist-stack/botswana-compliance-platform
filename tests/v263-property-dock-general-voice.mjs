import fs from "node:fs";
import assert from "node:assert/strict";

const css=fs.readFileSync("public/assets/thebe-spatial-dock-v246.css","utf8");
const voice=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");

assert.match(css,/body\{--thebe-spatial-width:272px\}/,"desktop dock must remain compact");
assert.match(css,/body\.thebe-ai-expanded\{--thebe-spatial-width:344px\}/,"expanded dock must remain bounded");
assert.match(css,/body #propertyintelligence \.property-layout-v224\{width:100%!important;max-width:1180px!important;min-width:0!important/,"Property calculator workspace must remain wide but bounded on desktop");
assert.match(css,/@media\(min-width:860px\)\{[\s\S]*body #propertyintelligence \.property-calculator-v224\{display:grid!important;grid-template-columns:minmax\(360px,\.9fr\) minmax\(420px,1\.1fr\)/,"Property calculator must use the intended balanced two-column desktop canvas");
assert.match(css,/@media\(min-width:761px\)[\s\S]*#thebeAiDock\[data-surface="workspace"\][\s\S]*right:12px!important;top:84px!important;bottom:16px!important/,"Thebe workspace dock must live on the right edge vertically");
assert.match(css,/@media\(min-width:761px\) and \(max-width:1023px\)[\s\S]*#thebeAiDock\[data-surface="workspace"\][\s\S]*width:var\(--thebe-spatial-width\)!important[\s\S]*#mainContent\{visibility:visible!important\}/,"tablet workspace must stay visible beside the bounded Thebe rail");
assert.match(css,/@media\(max-width:760px\)[\s\S]*body\.thebe-ai-dock-open #mainContent[\s\S]*visibility:hidden!important/,"phone workspace may yield to the assistant modal surface");
assert.doesNotMatch(css,/@media\(max-width:1023px\)[\s\S]*body\.thebe-ai-dock-open #mainContent[\s\S]*visibility:hidden!important/,"tablet workspace must not be hidden by an obsolete mobile breakpoint");
assert.match(css,/#thebeAiDockPill\[data-surface="workspace"\][\s\S]*writing-mode:vertical-rl/,"collapsed Thebe launcher must remain vertical on desktop");
assert.match(css,/#mainContent\{padding-bottom:20px!important;scroll-padding-bottom:20px!important\}/,"workspace must not reserve a bottom assistant lane");
assert.match(css,/#appShell :is\(button,a,input,select,textarea,summary\):focus-visible\{outline:3px solid #2f8fe6!important;outline-offset:2px!important\}/,"workspace controls must expose a consistent keyboard focus ring");
assert.match(css,/@media\(min-width:761px\) and \(max-width:900px\)\{#mainContent>\.top\{position:sticky!important;top:0!important\}\}/,"tablet top controls must remain predictably available");
assert.match(voice,/ordinary general-knowledge and conversational questions directly/,"workspace voice must answer general questions directly");
assert.match(voice,/including Market, must never restrict the user to page-specific questions/,"Market must not narrow live voice scope");
assert.match(voice,/current company facts, finance, compliance, operations, customer work, business analysis[\s\S]*delegate_to_thebe_backend/,"private business questions must retain governed delegation");

console.log("V263_PROPERTY_DOCK_GENERAL_VOICE_PASS");
