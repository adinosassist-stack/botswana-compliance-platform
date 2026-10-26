import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path=new URL("../.github/workflows/regulatory-rehearsal-preauthorization-packet.yml",import.meta.url);
const workflow=readFileSync(path,"utf8");
test("preauthorization packet cannot become a remote staging writer",()=>{
  for(const expected of ["workflow_dispatch:","default: DO_NOT_RUN","PREPARE_OFFLINE_AUTHORIZATION_PACKET","environment: regulatory-staging","contents: read","EXPECTED_SHA","git/ref/heads/main","tests/regulatory-staging-write-authorization.test.mjs","OFFLINE_PACKET_ONLY"]){
    assert.ok(workflow.includes(expected),expected);
  }
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow,/\$\{\{\s*(?:secrets|vars)\./);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|wrangler\s+d1|cloudflare\.com\/client\/v4|\bcurl\b|\bwget\b|npm\s+run\s+deploy/i);
  assert.doesNotMatch(workflow,/AUTHORIZE_SYNTHETIC_STAGING_REHEARSAL/);
});
