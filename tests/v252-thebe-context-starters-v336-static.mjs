import assert from "node:assert/strict";
import fs from "node:fs";

const readiness=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const starters=fs.readFileSync("public/js/thebe-context-starters-v336.js","utf8");

assert.match(readiness,/thebe-context-starters-v336\.js\?release=\$\{release\}/,"workspace readiness must load contextual starters v336");
assert.match(readiness,/20261015-context-starters-v336/,"contextual starters must use the qualified release id");

assert.match(starters,/window\.ThebeAiDock\?\.state\?\.\(\)/,"starters must derive context from the canonical dock state");
assert.match(starters,/typeof api\?\.ask!=="function"/,"starters must require the canonical dock ask boundary");
assert.match(starters,/void api\.ask\(question,mode\)/,"starter actions must delegate through ThebeAiDock.ask");
assert.match(starters,/state\.workspaceVisible!==true\|\|state\.assistantMode==="goal_plan"/,"public surfaces and governed goal-plan mode must not be overridden");
assert.doesNotMatch(starters,/fetch\s*\(|apiJson|\/api\//,"starter layer must not call backend APIs directly");

for(const phrase of ["Money brief","Property brief","People brief","Compliance brief","Operations brief","Owner brief"]){
  assert.ok(starters.includes(phrase),`missing contextual starter family: ${phrase}`);
}

for(const safeguard of [
  "Do not execute payments",
  "Do not create a valuation",
  "Do not change employee records",
  "Do not file, approve, certify",
  "Do not assign, approve or execute work automatically"
]){
  assert.ok(starters.includes(safeguard),`missing starter safeguard: ${safeguard}`);
}

assert.match(starters,/button\.disabled=Boolean\(busy\)/,"contextual starter buttons must inherit the dock busy state");
assert.match(starters,/if\(button\.disabled\)return;/,"disabled contextual starters must not dispatch requests");
assert.match(starters,/state\.textBusy\?"busy":"ready"/,"busy state must be part of the starter render signature");
assert.match(starters,/starterButton\(item,state\.textBusy===true\)/,"new contextual buttons created while busy must render disabled");
assert.match(starters,/MutationObserver/,"starter actions must resync after dock or page context changes");
assert.match(starters,/thebe:workspace-view-change/,"starter actions must react to canonical workspace view changes");
assert.match(starters,/existing===3/,"starter layer must remain bounded to three actions");

console.log("v252 Thebe contextual starters v336 static checks passed");
