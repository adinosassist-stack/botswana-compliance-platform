import fs from 'node:fs';
import assert from 'node:assert/strict';

const readiness=fs.readFileSync('public/js/workspace-readiness-v305.js','utf8');
const source=fs.readFileSync('public/js/owner-ask-thebe-render-v319.js','utf8');

assert.match(readiness,/owner-ask-thebe-render-v319\.js/,'workspace readiness must load the isolated authenticated Ask Thebe render extension');
assert.match(readiness,/whenThebeWorkspaceReady\(loadOwnerAskRender\)/,'Ask Thebe extension must load only after authoritative workspace readiness');
assert.match(source,/document\.addEventListener\("submit",handleAskSubmit,true\)/,'Ask Thebe extension must intercept the canonical submit in capture phase');
assert.match(source,/form\.getAttribute\("aria-label"\)!=="Ask Thebe a question"/,'extension must be scoped to the authenticated Ask Thebe form');
assert.match(source,/window\.apiJson\("\/api\/ai\/advisor"/,'extension must use the existing authenticated API transport and canonical advisor endpoint');
assert.match(source,/mode:"ask",question:normalized/,'extension must preserve the read-only ask request contract');
assert.match(source,/Answer ready · no action was executed\./,'successful responses must disclose that no action was executed');
assert.doesNotMatch(source,/renderAgenticGovernance/,'answer rendering must not wait on unrelated governance reads');
assert.doesNotMatch(source,/\/api\/agentic\//,'read-only Ask Thebe rendering must not call agentic authority endpoints');
assert.doesNotMatch(source,/innerHTML|safeHTML/,'extension must render returned content through text nodes rather than HTML injection');

console.log('V319 owner Ask Thebe render decoupling: PASS');
