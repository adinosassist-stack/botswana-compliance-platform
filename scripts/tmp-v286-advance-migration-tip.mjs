import fs from "node:fs";

const OLD="066_v285_agent_responsibilities.sql";
const NEXT="067_v286_customer_relationships.sql";

function replaceRequired(file,from,to,{min=1}={}){
  const before=fs.readFileSync(file,"utf8");
  const count=before.split(from).length-1;
  if(count<min)throw new Error(`${file}: expected at least ${min} occurrence(s) of ${JSON.stringify(from)}, found ${count}`);
  const after=before.split(from).join(to);
  fs.writeFileSync(file,after);
  console.log(`${file}: replaced ${count} occurrence(s)`);
}
function replaceOptional(file,from,to){
  if(!fs.existsSync(file))return;
  const before=fs.readFileSync(file,"utf8");
  const count=before.split(from).length-1;
  if(!count)return;
  fs.writeFileSync(file,before.split(from).join(to));
  console.log(`${file}: replaced ${count} optional occurrence(s)`);
}

replaceRequired("RELEASE_PROFILE.json",`\"latest_cloudflare_migration\": \"${OLD}\"`,`\"latest_cloudflare_migration\": \"${NEXT}\"`);
replaceRequired("cloudflare/src/agentic-entry.js",OLD,NEXT);
replaceRequired("docs/LAUNCH.md",OLD,NEXT);
replaceRequired("cloudflare/README.md",OLD,NEXT);
replaceOptional("cloudflare/deploy-free.sh",OLD,NEXT);

for(const file of [
  "tests/v108-finance-receivables-adversarial.mjs",
  "tests/v137-migration-chain-integrity.mjs",
  "tests/v152-agentic-readiness-migration-tip.mjs",
  "tests/v153-cloudflare-migration-tip-coherence.mjs",
  "tests/v154-agent-control-plane.mjs",
  "tests/v157-business-memory-money-intelligence.mjs",
  "tests/v161-money-intelligence-v3-adversarial.mjs",
  "tests/v163-thebe-dock-release-identity.mjs",
  "tests/v164-supplier-cost-watch.mjs",
  "tests/v165-weekly-spend-envelope.mjs",
  "tests/v175-property-evidence-profitability.mjs",
  "tests/v176-property-valuation-services.mjs",
  "tests/v179-property-valuer-credential-binding.mjs",
  "tests/v217-jit-execution-permit.mjs",
  "tests/v243-business-goal-observer-hardening.mjs",
  "tests/v79-finance-reconciliation.mjs",
  "tests/v80-agentic-owner-centre.mjs",
  "tests/v81-finance-connections.mjs",
  "tests/v96-bounded-task-execution.mjs"
])replaceOptional(file,OLD,NEXT);

for(const file of ["docs/LAUNCH.md","cloudflare/README.md"]){
  replaceOptional(file,"through 066","through 067");
  replaceOptional(file,"migrations 047 through 066","migrations 047 through 067");
}

console.log("V286 migration-tip preparation complete");
