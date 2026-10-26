// Deterministic, synthetic-only fixture manifest. No SQL, network or credentials.
import {createHash} from "node:crypto";
const FIXTURE_KIND="regulatory-v17-v18-synthetic-rehearsal";
const rows=Object.freeze({
 tenants:[{id:"synthetic-vat-tenant-a",name:"Synthetic VAT Test Tenant A"},{id:"synthetic-vat-tenant-b",name:"Synthetic VAT Test Tenant B"}],
 historicalVat:[
  {id:"synthetic-vat-history-a",tenantId:"synthetic-vat-tenant-a",periodEnd:"2026-05-31",dueAt:"2026-06-25",status:"completed",dueDays:25},
  {id:"synthetic-vat-history-b",tenantId:"synthetic-vat-tenant-b",periodEnd:"2026-06-30",dueAt:"2026-07-25",status:"open",dueDays:25}
 ],
 schedules:[
  {tenantId:"synthetic-vat-tenant-a",nextDueAt:"2026-06-25",status:"ready"},
  {tenantId:"synthetic-vat-tenant-b",nextDueAt:"2026-07-25",status:"needs_input"}
 ],
 rules:[{key:"bw.burs.vat.return-payment.25-days",status:"review",dueDays:25},
        {key:"bw.burs.vat.return-payment.28-days",status:"draft",dueDays:28}],
 sourceScenario:"separate synthetic approved-snapshot drift refusal and unreviewed importer success tests",
});
export function createSyntheticRegulatoryFixtureManifest(){
 const manifest={kind:FIXTURE_KIND,version:1,dataClassification:"synthetic-only",...structuredClone(rows)};
 const canonical=JSON.stringify(manifest);
 return {manifest,sha256:createHash("sha256").update(canonical).digest("hex")};
}
export function verifySyntheticRegulatoryFixtureManifest(value,approvedHash){
 if(typeof approvedHash!=="string"||!/^[a-f0-9]{64}$/.test(approvedHash))return {ok:false,reason:"manifest_hash_invalid"};
 const known=createSyntheticRegulatoryFixtureManifest();
 if(value===null||typeof value!=="object"||Array.isArray(value)||
    JSON.stringify(value)!==JSON.stringify(known.manifest)||
    known.sha256!==approvedHash)return {ok:false,reason:"manifest_not_exactly_approved"};
 return {ok:true,sha256:known.sha256};
}
