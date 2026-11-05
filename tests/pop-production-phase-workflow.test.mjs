import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/pop-production-schema-phase.yml','utf8');
test('schema writer stays manual, protected, serialized and default-off',()=>{
 const apply=workflow.slice(workflow.indexOf('\n  apply:'));
 assert.match(workflow,/default: DO_NOT_RUN/);
 assert.match(apply,/github.event_name == 'workflow_dispatch'/);
 assert.match(apply,/github.ref == 'refs\/heads\/main'/);
 assert.match(apply,/needs: qualify/);
 assert.match(apply,/environment: pop-production-migration/);
 assert.match(workflow,/thebe-isolated-operations-rehearsals/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/POP_PRODUCTION_GITHUB_READ_TOKEN: \$\{\{ secrets.POP_PRODUCTION_GITHUB_READ_TOKEN \}\}/);
 assert.match(workflow,/POP_PRODUCTION_CLOUDFLARE_TOKEN: \$\{\{ secrets.POP_PRODUCTION_CLOUDFLARE_TOKEN \}\}/);
 assert.doesNotMatch(workflow,/schedule:|wrangler deploy|CLOUDFLARE_API_TOKEN|allow_failure|continue-on-error/);
 assert.match(apply,/git status --porcelain/);
});
