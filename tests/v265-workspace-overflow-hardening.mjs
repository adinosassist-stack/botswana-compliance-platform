import fs from "node:fs";import assert from "node:assert/strict";
const css=fs.readFileSync("public/assets/workspace-inline-styles-20261001c.css","utf8");
assert.ok(css.includes("#appShell :where(.card,h1,h2,p,.row>*,.grid>*,button,input){min-width:0;max-width:100%;overflow-wrap:anywhere}"),"workspace content must shrink and wrap");
assert.ok(css.includes("#appShell button{white-space:normal}"),"button labels must wrap");
assert.ok(Buffer.byteLength(css)<224000,"overflow hardening must respect the workspace CSS budget");
console.log("V265_WORKSPACE_OVERFLOW_HARDENING_PASS");