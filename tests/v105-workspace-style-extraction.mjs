import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
const css=fs.readFileSync("public/assets/workspace-inline-20260921a.css","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const budget=fs.readFileSync("scripts/bundle-budget.mjs","utf8");
const postdeploy=fs.readFileSync(".github/workflows/postdeploy-smoke.yml","utf8");

const start="<!-- THEBE_WORKSPACE_INLINE_STYLES_START -->";
const end="<!-- THEBE_WORKSPACE_INLINE_STYLES_END -->";
const from=html.indexOf(start),to=html.indexOf(end);
assert.ok(from>=0&&to>from,"canonical workspace style markers must exist");
const region=html.slice(from+start.length,to);
const matches=[...region.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];
assert.equal(matches.length,48,"all 48 canonical head styles must stay inside the marked region");
assert.ok(matches.every(match=>/^\s*(?:id=["'][^"']+["'])?\s*$/.test(match[1]||"")),"style extraction assumes only optional id attributes");
const canonical=matches.map(match=>String(match[2]||"").trimEnd()+"\n").join("\n");
assert.equal(canonical,css,"versioned CSS must exactly preserve canonical style order/content");
for(const match of matches){
  const body=String(match[2]||"");
  let depth=0,min=0,comment=false,quote=null,escape=false;
  for(let i=0;i<body.length;i++){
    const c=body[i],n=body[i+1];
    if(comment){if(c==="*"&&n==="/"){comment=false;i++;}continue}
    if(quote){if(escape){escape=false;continue}if(c==="\\"){escape=true;continue}if(c===quote)quote=null;continue}
    if(c==="/"&&n==="*"){comment=true;i++;continue}
    if(c==="'"||c==='"'){quote=c;continue}
    if(c==="{")depth++;else if(c==="}"){depth--;min=Math.min(min,depth)}
  }
  assert.equal(comment,false,"style block must not end inside a comment");
  assert.equal(quote,null,"style block must not end inside a string");
  assert.equal(depth,0,"style block braces must balance");
  assert.ok(min>=0,"style block must not close more braces than it opens");
}

assert.match(production,/const WORKSPACE_STYLE_ASSET="\/assets\/workspace-inline-20260921a\.css"/);
assert.match(production,/function externalizeWorkspaceStyles\(html\)/);
assert.match(production,/runtimeHtml=workspaceSurface\?externalizeWorkspaceRuntime\(baseHtml\):baseHtml/);
assert.match(production,/surfaceHtml=workspaceSurface\?externalizeWorkspaceStyles\(runtimeHtml\):runtimeHtml/);
assert.match(worker,/immutableWorkspaceStyles=\/\^\\\/assets\\\/workspace-inline-\[a-z0-9\.\-\]\+\\\.css\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/immutableWorkspaceStyles[\s\S]*cache-control","public, max-age=31536000, immutable"/);
assert.match(budget,/deployedHtml\.length<350_000/);
assert.match(budget,/canonicalStyles===styleText/);
assert.match(budget,/workspaceStyles\.length<300_000/);
assert.match(postdeploy,/workspace-runtime-20260921a\.js/);
assert.match(postdeploy,/workspace-inline-20260921a\.css/);
assert.match(postdeploy,/max-age=31536000/);
assert.match(postdeploy,/x-thebe-registration-protection/);

console.log("v105 workspace style extraction: PASS");
