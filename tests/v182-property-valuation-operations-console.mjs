import assert from "node:assert/strict";
import fs from "node:fs";

const service=fs.readFileSync("cloudflare/src/property-valuation-services.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");

assert.match(service,/\/api\/platform\/property\/valuation-services/);
assert.match(service,/PLATFORM_CONSOLE_ACTIONS=Object\.freeze\(new Set\(\["quote","assign","advance"\]\)\)/);
assert.doesNotMatch(service,/PLATFORM_CONSOLE_ACTIONS[^\n]*issue/,"browser platform console must not expose signed-report issuance");
assert.match(service,/platformAdminAllowed\?\.\(auth\)/);
assert.match(service,/platform_valuation_operations_forbidden/);
assert.match(service,/operationsSecretProxy/);
assert.match(service,/headers\.set\("x-operations-secret",String\(env\.OPERATIONS_SECRET\|\|""\)\)/);
assert.match(service,/reportIssuanceConsoleEnabled:false/);
assert.match(service,/professionalCredentialReady/);

assert.match(worker,/platformAdminAllowed:actor=>platformBillingAdmin\(actor,env\)/);

assert.match(owner,/propertyValuationOperationsPanel/);
assert.match(owner,/Valuation operations queue/);
assert.match(owner,/Platform admin only/);
assert.match(owner,/operations secret is never sent to the browser/i);
assert.match(owner,/\/api\/platform\/property\/valuation-services/);
assert.match(owner,/Issue quote/);
assert.match(owner,/Assign valuer/);
assert.match(owner,/Schedule inspection/);
assert.match(owner,/Fieldwork complete/);
assert.match(owner,/Start drafting/);
assert.match(owner,/Send to professional review/);
assert.match(owner,/signed-report issuance remains internal-secret gated/);
assert.doesNotMatch(owner,/x-operations-secret/,"browser code must never carry the operations secret header");
assert.doesNotMatch(owner,/OPERATIONS_SECRET/,"browser code must never reference the operations secret value");

console.log("V182_PROPERTY_VALUATION_OPERATIONS_CONSOLE_PASS");
