import {readFileSync,readdirSync} from "node:fs";

export function installAgentCostTestSchema(db){
  db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  for(const file of readdirSync("cloudflare/migrations").filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=44).sort())
    db.exec(readFileSync("cloudflare/migrations/"+file,"utf8"));
  db.exec(readFileSync("cloudflare/experimental/agent_cost_accounting.sql","utf8"));
}
