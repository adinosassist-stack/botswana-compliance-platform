import assert from "node:assert/strict";
import {delegatedAuthoritySchemaReady,V81_SCHEMA_DELTA} from "../cloudflare/src/agentic-entry.js";

assert.equal(V81_SCHEMA_DELTA,"063_v179_property_valuer_credential_binding.sql");

function db({missingClaims=false,missingScheduledFor=false,missingOccurrenceIndex=false,missingSchedulerIndex=false,missingRegistry=false,missingMemory=false,missingProperty=false,missingPropertyV175=false,missingPropertyV176=false,missingPropertyV179=false}={}){
  return {
    prepare(sql){
      return {
        async first(){
          if(missingClaims&&sql.includes("agent_observation_claims"))throw new Error("no such table: agent_observation_claims");
          if(missingRegistry&&sql.includes("agent_registry"))throw new Error("no such table: agent_registry");
          if(missingMemory&&(sql.includes("business_memory_items")||sql.includes("business_memory_events")))throw new Error("no such table: business_memory_items");
          if(missingProperty&&(sql.includes("property_assets")||sql.includes("property_professional_valuations")))throw new Error("no such table: property_assets");
          if(missingPropertyV175&&(sql.includes("property_valuation_evidence_links")||sql.includes("property_operating_snapshots")))throw new Error("no such table: property_operating_snapshots");
          if(missingPropertyV176&&(sql.includes("property_valuation_service_requests")||sql.includes("property_valuation_service_events")))throw new Error("no such table: property_valuation_service_requests");\n          if(missingPropertyV179&&sql.includes("professional_credential_events"))throw new Error("no such table: professional_credential_events");
          if(missingScheduledFor&&sql.includes("SELECT scheduled_for FROM agent_observation_checkpoints"))throw new Error("no such column: scheduled_for");
          if(sql.includes("uq_agent_observation_checkpoint_occurrence"))return missingOccurrenceIndex?null:{ok:1};
          if(sql.includes("agent_persistent_tasks_scheduler_due"))return missingSchedulerIndex?null:{ok:1};
          return {ok:1};
        }
      };
    }
  };
}

assert.equal(await delegatedAuthoritySchemaReady({DB:db()}),true);
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingClaims:true})}),false,"migration 053 claims table is required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingScheduledFor:true})}),false,"migration 054 scheduled_for column is required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingOccurrenceIndex:true})}),false,"migration 054 occurrence index is required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingSchedulerIndex:true})}),false,"migration 055 scheduler index is required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingRegistry:true})}),false,"migration 056 canonical agent registry is required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingMemory:true})}),false,"migration 057 business memory tables are required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingProperty:true})}),false,"migration 059 property portfolio tables are required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingPropertyV175:true})}),false,"migration 060 property evidence and operating history tables are required");
assert.equal(await delegatedAuthoritySchemaReady({DB:db({missingPropertyV176:true})}),false,"migration 061 property valuation service tables are required");\nassert.equal(await delegatedAuthoritySchemaReady({DB:db({missingPropertyV179:true})}),false,"migration 063 professional credential ledger is required");
assert.equal(await delegatedAuthoritySchemaReady({}),false);

console.log("v152 agentic readiness migration-tip integrity passed");
