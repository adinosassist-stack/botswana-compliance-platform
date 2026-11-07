import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {validateNamibiaDormantManifest} from "../cloudflare/src/namibia-staging-manifest-policy.js";
const manifest=readFileSync(new URL("../cloudflare/wrangler.namibia-internal-candidate.toml",import.meta.url),"utf8");
test("reviewed disabled Worker manifest accepts exactly the required static configuration",()=>{
 const r=validateNamibiaDormantManifest(manifest);
 assert.equal(r.ok,true,r.error);
 assert.equal(r.deploymentAuthorized,false);
 assert.equal(r.customerRuntimeEnabled,false);
 assert.equal(r.disposableDbBindings,3);
});
test("unexpected capabilities and hidden bindings are denied by default",()=>{
 for(const injection of [
  "\n[[routes]]\npattern = \"*.thebedesk.com\"\n",
  "\n[triggers]\ncrons = \"* * * * *\"\n",
  "\n[[kv_namespaces]]\nbinding = \"SECRETS\"\n",
  "\n[[services]]\nbinding = \"PRODUCTION\"\n",
  "\n[unsafe]\nbindings = \"unchecked\"\n",
  "\n[observability]\nenabled = true\n",
  "\n[vars]\nSESSION_SECRET = \"surprise\"\n",
  "\nworkers_dev = true\n",
  "\n[[d1_databases]]\nbinding = \"PROD\"\ndatabase_name = \"bw-compliance-os\"\ndatabase_id = \"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce\"\n"
 ]){
  const r=validateNamibiaDormantManifest(manifest+injection);
  assert.equal(r.ok,false,injection);
 }
});
test("existing parameters cannot be silently altered or duplicated",()=>{
 for(const changed of [
  manifest.replace('workers_dev = false','workers_dev = true'),
  manifest.replace('NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED = "0"','NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED = "1"'),
  manifest.replace('NAMIBIA_BINDINGS_AUDITED = "0"','NAMIBIA_BINDINGS_AUDITED = "1"'),
  manifest.replace('keep_vars = false','keep_vars = true'),
  manifest.replace('name = "na-compliance-internal-candidate"','name = "bw-compliance-os"'),
  manifest.replace('database_id = "cb833f28-8ea6-4234-b183-c12c018aac15"','database_id = "8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"'),
  manifest+"\nname = \"another-script\"\n",
  manifest.replace('[vars]','[vars]\nUNREVIEWED_SECRET = "abc"'),
  manifest.replace('APP_ENV = "namibia-disposable-staging"','APP_ENV = "production"')
 ]){
  const r=validateNamibiaDormantManifest(changed);
  assert.equal(r.ok,false,r.error||"unsafe config was accepted");
 }
});
