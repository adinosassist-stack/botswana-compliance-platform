import fs from "node:fs";
import assert from "node:assert/strict";
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const dom=html.replace(/<script\b[\s\S]*?<\/script>/gi,"");
const ids=[...dom.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const idSet=new Set(ids);
assert.equal(ids.length,idSet.size,"duplicate DOM ids make user actions ambiguous");

const views=new Set([...dom.matchAll(/<section[^>]*\bid="([^"]+)"[^>]*class="[^"]*\bview\b/g)].map(m=>m[1]));
const literalTargets=[...dom.matchAll(/(?:data-view|data-hub-target)="([^"$'{]+)"/g)].map(m=>m[1]);
assert.deepEqual([...new Set(literalTargets.filter(x=>!views.has(x)))],[],"literal workspace controls must resolve to a real view");

const funcs=new Set([...html.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const delegated=[...dom.matchAll(/data-bw-on(?:click|change|focus|input|submit|keydown|keyup)="([^"]+)"/g)].map(m=>m[1]);
const called=new Set();
for(const exp of delegated){
 for(const part of exp.split(";")){
  const m=part.trim().replace(/^if\([^)]*\)/,"").trim().match(/^(?:setTimeout\(\s*)?([A-Za-z_$][\w$]*)\s*\(/);
  if(m&&!["if"].includes(m[1]))called.add(m[1]);
 }
}
const builtins=new Set(["window","navigator"]);
assert.deepEqual([...called].filter(x=>!funcs.has(x)&&!builtins.has(x)),[],"delegated user controls must resolve to implemented functions");

const buttons=[...dom.matchAll(/<button\b([^>]*)>/gi)].map(m=>m[1]);
const suspicious=buttons.filter(a=>!/data-bw-onclick=|data-view=|type="submit"|disabled|id="/.test(a));
assert.deepEqual(suspicious,[],"buttons without an action contract must not ship");

assert.doesNotMatch(dom,/id="firstValueStatus" class="badge warn[^"]*">Checking<\/span>/,"workspace must not paint a red/amber warning before a check has actually started");
assert.doesNotMatch(dom,/id="ownerBriefNotice" class="notice warn/,"hidden neutral status containers must not be warning-styled by default");
assert.match(html,/function renderFirstValueFailure\(/,"real failures must still render explicit failure state");
console.log(`V178_USER_JOURNEY_DESTRUCTIVE_PASS controls=${buttons.length} delegated=${delegated.length} views=${views.size}`);
