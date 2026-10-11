import fs from 'node:fs';
import assert from 'node:assert/strict';

const readiness=fs.readFileSync('public/js/workspace-readiness-v305.js','utf8');
const renderSource=fs.readFileSync('public/js/owner-ask-thebe-render-v321.js','utf8');
const controlSource=fs.readFileSync('public/js/owner-ask-thebe-stable-v320.js','utf8');

assert.match(readiness,/owner-ask-thebe-render-v321\.js/,'workspace readiness must load the authenticated Ask Thebe trial-credit renderer');
assert.match(readiness,/owner-ask-thebe-stable-v320\.js/,'workspace readiness must load the stable Ask Thebe control extension');
assert.match(readiness,/whenThebeWorkspaceReady\(loadOwnerAsk\)/,'Ask Thebe extensions must load only after authoritative workspace readiness');
assert.match(readiness,/\.then\(\(\)=>import\(`\/js\/owner-ask-thebe-stable-v320\.js/,'stable control must load after the capture-phase answer renderer');

assert.match(renderSource,/document\.addEventListener\("submit",handleAskSubmit,true\)/,'Ask Thebe renderer must intercept the canonical submit in capture phase');
assert.match(renderSource,/form\.getAttribute\("aria-label"\)!=="Ask Thebe a question"/,'renderer must be scoped to the authenticated Ask Thebe form');
assert.match(renderSource,/window\.apiJson\("\/api\/ai\/credits"\)/,'renderer must initialize the canonical plan allowance before the first charged Ask');
assert.match(renderSource,/await ensureAiCreditsReady\(\);[\s\S]*window\.apiJson\("\/api\/ai\/advisor"/,'credit initialization must complete before the advisor debit path');
assert.match(renderSource,/creditInitPromise=window\.apiJson\("\/api\/ai\/credits"\)\.catch/,'credit initialization must be single-flight and retry after failure');
assert.match(renderSource,/window\.apiJson\("\/api\/ai\/advisor"/,'renderer must use the existing authenticated API transport and canonical advisor endpoint');
assert.match(renderSource,/mode:"ask",question:normalized/,'renderer must preserve the read-only ask request contract');
assert.match(renderSource,/ownerAskThebeStatus/,'renderer must prefer the Ask-specific status node so governance refreshes cannot overwrite answer state');
assert.match(renderSource,/Answer ready · no action was executed\./,'successful responses must disclose that no action was executed');
assert.doesNotMatch(renderSource,/renderAgenticGovernance/,'answer rendering must not wait on unrelated governance reads');
assert.doesNotMatch(renderSource,/\/api\/agentic\//,'read-only Ask Thebe rendering must not call agentic authority endpoints');
assert.doesNotMatch(renderSource,/innerHTML|safeHTML/,'renderer must use text nodes rather than HTML injection');

assert.match(controlSource,/ownerAskThebeStableHost/,'control extension must create a stable host outside the replaceable governance body');
assert.match(controlSource,/body\.after\(host\)/,'stable Ask Thebe host must be a sibling after the governance body');
assert.match(controlSource,/ownerThebeQuestion/,'stable host must expose the canonical Ask Thebe textarea immediately');
assert.match(controlSource,/MutationObserver/,'stable control must survive later governance body replacement');
assert.match(controlSource,/duplicates\.forEach/,'governance refreshes must not leave duplicate Ask Thebe forms');
assert.doesNotMatch(controlSource,/apiJson|fetch\(|\/api\//,'control hydration must not depend on any API or governance read');
assert.doesNotMatch(controlSource,/innerHTML|safeHTML/,'control extension must create UI through DOM text nodes only');

console.log('V321/V320 owner Ask Thebe trial credit, render and control decoupling: PASS');
