import fs from "node:fs";import assert from "node:assert/strict";
const css=fs.readFileSync("public/assets/workspace-inline-styles-20261001c.css","utf8");
assert.match(css,/#appShell :where\(\.card,\.callout,[^}]+\)\{min-width:0;max-width:100%;overflow-wrap:anywhere\}/,"workspace content must shrink and wrap");
assert.match(css,/#appShell button\{white-space:normal\}/,"button labels must wrap");
assert.ok(Buffer.byteLength(css)<224000,"overflow hardening must respect the workspace CSS budget");
console.log("V265_WORKSPACE_OVERFLOW_HARDENING_PASS");