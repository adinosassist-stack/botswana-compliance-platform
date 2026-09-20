import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow=fs.readFileSync('.github/workflows/postdeploy-smoke.yml','utf8');
let pass=0;
const ok=(condition,message)=>{assert.ok(condition,message);pass++;console.log('PASS',message)};

ok(workflow.includes('workflow_run:'),'post-deploy smoke is chained to a completed workflow');
ok(workflow.includes('workflows: ["Thebe Desk Production Deploy"]'),'post-deploy smoke listens only to the production deploy workflow');
ok(workflow.includes('github.event.workflow_run.conclusion == \'success\''),'automatic smoke refuses failed deployments');
ok(workflow.includes('github.event.workflow_run.head_branch == \'main\''),'automatic smoke refuses non-main deployments');
ok(workflow.includes('EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || inputs.expected_sha }}'),'smoke binds to the exact deployed SHA');
ok(workflow.includes('ref: ${{ env.EXPECTED_SHA }}'),'verification checkout uses the exact deployed SHA');
ok(workflow.includes('permissions:\n  contents: read'),'workflow keeps repository permission read-only');
ok(workflow.includes("assert.equal(authority.status,401)"),'V81 delegated-authority authentication boundary is live-smoked');
ok(workflow.includes("response.status===503")&&workflow.includes("url.hostname,host"),'OAuth smoke accepts only explicit deferral or expected provider redirects');
ok(workflow.includes('without submitting customer data')&&workflow.includes('register-direct.html'),'browser smoke exercises customer UI without account creation');
ok(workflow.includes("readFileSync('cloudflare/src/agentic-entry.js','utf8')"),'post-deploy smoke derives schema expectation from the deployed runtime source');
ok(workflow.includes('expectedSchemaDelta=schemaMatch[1]'),'schema delta source-of-truth is parsed before live readiness comparison');
ok(workflow.includes('assert.equal(readiness.latestSchemaDelta,expectedSchemaDelta)'),'live readiness is compared to the exact deployed source schema delta');
ok(!workflow.includes("assert.equal(readiness.latestSchemaDelta,'047_v81_delegated_authority.sql')"),'post-deploy smoke does not pin the retired 047 schema literal');
ok(!workflow.includes('CLOUDFLARE_API_TOKEN')&&!workflow.includes('DATABASE_URL'),'post-deploy smoke requires no production secrets or database credentials');

console.log(`Post-deploy smoke governance contract: ${pass}/15 PASS`);
