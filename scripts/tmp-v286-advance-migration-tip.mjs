import fs from "node:fs";

function replaceRequired(file,from,to){
  const before=fs.readFileSync(file,"utf8");
  const count=before.split(from).length-1;
  if(count<1)throw new Error(`${file}: expected ${JSON.stringify(from)}`);
  fs.writeFileSync(file,before.split(from).join(to));
  console.log(`${file}: replaced ${count} occurrence(s)`);
}

replaceRequired(
  "docs/LAUNCH.md",
  "`065_v243_business_goal_observer.sql`, and `067_v286_customer_relationships.sql` in order",
  "`065_v243_business_goal_observer.sql`, `066_v285_agent_responsibilities.sql`, and `067_v286_customer_relationships.sql` in order"
);
replaceRequired(
  "docs/LAUNCH.md",
  "migration `065_v243_business_goal_observer.sql` adds a dedicated non-execution business-goal observer identity plus database-level duplicate-goal guards, and migration `067_v286_customer_relationships.sql` adds tenant-scoped persistent responsibility definitions and lifecycle evidence without granting execution authority. Migrations 056–066 grant no autonomous valuation-certification or external business-action authority;",
  "migration `065_v243_business_goal_observer.sql` adds a dedicated non-execution business-goal observer identity plus database-level duplicate-goal guards, migration `066_v285_agent_responsibilities.sql` adds tenant-scoped persistent responsibility definitions and lifecycle evidence without granting execution authority, and migration `067_v286_customer_relationships.sql` adds tenant-scoped customer contacts, explicit communication consent state, and immutable human-approved follow-up drafts without enabling external dispatch. Migrations 056–067 grant no autonomous valuation-certification or external business-action authority;"
);

replaceRequired(
  "cloudflare/README.md",
  "migration `065_v243_business_goal_observer.sql` adds the dedicated non-execution business-goal observer and duplicate-goal guards; migration `067_v286_customer_relationships.sql` adds governed persistent responsibility definitions and lifecycle evidence without granting execution authority.",
  "migration `065_v243_business_goal_observer.sql` adds the dedicated non-execution business-goal observer and duplicate-goal guards; migration `066_v285_agent_responsibilities.sql` adds governed persistent responsibility definitions and lifecycle evidence without granting execution authority; migration `067_v286_customer_relationships.sql` adds tenant-scoped customer contacts, explicit consent state, and immutable human-approved follow-up drafts without enabling external dispatch."
);
replaceRequired(
  "cloudflare/README.md",
  "must be applied after `065_v243_business_goal_observer.sql` and all earlier reviewed migrations. For a brand-new D1 database, load the current `schema.sql`, then apply migrations 047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065 and 066 in order.",
  "must be applied after `066_v285_agent_responsibilities.sql` and all earlier reviewed migrations. For a brand-new D1 database, load the current `schema.sql`, then apply migrations 047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065, 066 and 067 in order."
);

replaceRequired(
  "cloudflare/deploy-free.sh",
  "then apply reviewed forward migrations 047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065, and 066 in order.",
  "then apply reviewed forward migrations 047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065, 066, and 067 in order."
);
replaceRequired(
  "cloudflare/deploy-free.sh",
  "echo \"25u) For this NEW D1 only: ${W} d1 execute bw-compliance-os --remote --file=migrations/067_v286_customer_relationships.sql --config \\\"\\$PROD_CONFIG\\\"\"",
  "echo \"25u) For this NEW D1 only: ${W} d1 execute bw-compliance-os --remote --file=migrations/066_v285_agent_responsibilities.sql --config \\\"\\$PROD_CONFIG\\\"\"\necho \"25v) For this NEW D1 only: ${W} d1 execute bw-compliance-os --remote --file=migrations/067_v286_customer_relationships.sql --config \\\"\\$PROD_CONFIG\\\"\""
);

console.log("V286 migration-tip wording/order corrections complete");
