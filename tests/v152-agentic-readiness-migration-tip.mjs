import assert from "node:assert/strict";
import {delegatedAuthoritySchemaReady,V81_SCHEMA_DELTA} from "../cloudflare/src/agentic-entry.js";

assert.equal(V81_SCHEMA_DELTA,"055_v151_finance_watch_scheduler_isolation.sql");

function db({missingClaims=false,missingScheduledFor=false,missingOccurrenceIndex=false,missingSchedulerIndex=false}={}){
  return {
    prepare(sql){
      return {
        async first(){
          if(missingClaims&&sql.includes("agent_observation_claims"))throw new Error("no such table: agent_observation_claims");
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
assert.equal(await delegatedAuthoritySchemaReady({}),false);

console.log("v152 agentic readiness migration-tip integrity passed");
