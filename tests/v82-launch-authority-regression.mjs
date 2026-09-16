import assert from "node:assert/strict";
import fs from "node:fs";
import {__v782163Test} from "../cloudflare/src/worker.js";

const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const workflow=fs.readFileSync(new URL("../.github/workflows/production-launch-audit.yml",import.meta.url),"utf8");

assert.equal(__v782163Test.publicSignupMode({}),"hold");
assert.equal(__v782163Test.publicSignupMode({PUBLIC_SIGNUP_MODE:"invalid"}),"hold");
assert.equal(__v782163Test.publicSignupMode({PUBLIC_SIGNUP_MODE:"PUBLIC"}),"public");

assert.match(worker,/\/api\/auth\/launch-capabilities/);
assert.match(worker,/publicSignupMode\(env\)!==\"public\"/);
assert.match(worker,/error:\"registration_closed\"/);

assert.match(html,/id=\"googleAuthButton\"/);
assert.match(html,/id=\"facebookAuthButton\"/);
assert.match(html,/loadLaunchCapabilities\(\)/);
assert.match(html,/launchCapabilities\?\.signupMode!==\"public\"/);
assert.match(html,/button\.hidden=!oauth\.google/);
assert.match(html,/facebook\.hidden=!oauth\.facebook/);

assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/expected_sha:/);
assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
assert.match(workflow,/AUDIT_SHA: \$\{\{ github\.event_name == 'workflow_run'/);
assert.match(workflow,/github\.event_name == 'workflow_run' \|\| github\.event_name == 'workflow_dispatch'/);

console.log("Launch authority regression checks passed");
