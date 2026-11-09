import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import staging from "../cloudflare/src/namibia-staging-entry.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";
const config=readFileSync(new URL("../cloudflare/wrangler.namibia-internal-candidate.toml",import.meta.url),"utf8");
const source=readFileSync(new URL("../cloudflare/src/namibia-staging-entry.js",import.meta.url),"utf8");
const prod=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
const dbSections=[...config.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\[\[|$)/g)].map(x=>x[1]);
function dbId(section){return section.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1]}
test("staging manifest isolates three disposable databases and remains inert by default",()=>{
 assert.match(config,/^name = "na-compliance-internal-candidate"$/m);
 assert.match(config,/^main = "src\/namibia-staging-entry.js"$/m);
 assert.match(config,/^workers_dev = false$/m);
 assert.match(config,/^preview_urls = false$/m);
 assert.match(config,/^NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED = "0"$/m);
 assert.match(config,/^NAMIBIA_BINDINGS_AUDITED = "0"$/m);
 assert.equal(dbSections.length,3);
 const all=dbSections.map(dbId);
 assert.equal(new Set(all).size,3);
 assert.ok(all.includes("cb833f28-8ea6-4234-b183-c12c018aac15"));
 assert.ok(all.includes("c8ce1dd7-6973-45e8-be7f-1b4f2b672312"));
 assert.ok(all.includes("b45ebf26-429d-47ae-ae88-c404c8965c5b"));
 assert.ok(!all.includes("8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"));
 assert.doesNotMatch(config,/^\s*\[\[routes\]\]/m);
 assert.doesNotMatch(config,/^\s*\[triggers\]/m);
 assert.doesNotMatch(config,/^\s*\[assets\]/m);
 assert.doesNotMatch(config,/^SESSION_SECRET\s*=/m);
 assert.doesNotMatch(config,/^PUBLIC_ORIGIN\s*=/m);
 assert.doesNotMatch(config,/^PAYMENT_PROVIDER\s*=/m);
 assert.match(prod,/^name = "bw-compliance-os"$/m);
});
test("candidate Worker returns fixed no-store 404 regardless of request, headers or env",async()=>{
 for(const [method,url] of [["GET","https://example.test/internal/namibia/evidence?entityRef=A"],
   ["POST","https://example.test/internal/namibia/entities"],["GET","https://example.test/"]]){
  const res=await staging.fetch(new Request(url,{method}),{
   NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:"1",NAMIBIA_BINDINGS_AUDITED:"1",
   DB:{prepare(){throw Error("must not touch DB")}},
   NA_CANDIDATE_DB:{prepare(){throw Error("must not touch candidate DB")}}
  });
  assert.equal(res.status,404);
  assert.equal(res.headers.get("cache-control"),"no-store");
  assert.deepEqual(await res.json(),{error:"namibia_staging_not_activated"});
 }
 assert.doesNotMatch(source,/namibia-internal-api-candidate/);
 assert.doesNotMatch(source,/handleNamibiaInternalCandidate/);
 assert.equal(marketActivationReadiness("NA").ready,false);
});
