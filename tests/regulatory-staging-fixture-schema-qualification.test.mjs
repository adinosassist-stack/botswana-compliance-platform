import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {qualifySyntheticFixtureSchema,qualifyCheckedInSyntheticSchema} from "../scripts/regulatory-staging-fixture-schema-qualification.mjs";
import {createSyntheticRegulatoryFixtureManifest} from "../scripts/regulatory-staging-fixture-manifest.mjs";
const schema=()=>readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
test("synthetic fixture matches real checked-in full D1 table contracts",()=>{
 const result=qualifyCheckedInSyntheticSchema();
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.scope,"offline-schema-qualification-only");
 assert.equal(result.schemaTables,6);
});
test("tampering or incompatible schema fails closed",()=>{
 const {manifest,sha256}=createSyntheticRegulatoryFixtureManifest();
 assert.equal(qualifySyntheticFixtureSchema(schema(),manifest,"0".repeat(64)).ok,false);
 assert.equal(qualifySyntheticFixtureSchema("",manifest,sha256).ok,false);
 assert.equal(qualifySyntheticFixtureSchema("CREATE TABLE tenants(id TEXT)",manifest,sha256).ok,false);
 assert.equal(qualifySyntheticFixtureSchema("NOT SQL",manifest,sha256).ok,false);
});
