// Offline, deterministic rehearsal evidence comparison. Never issues SQL or network requests.
// Input must be a bounded, synthetically scoped snapshot from a separately reviewed reader.
import {createHash} from "node:crypto";
import {createSyntheticRegulatoryFixtureManifest,verifySyntheticRegulatoryFixtureManifest} from "./regulatory-staging-fixture-manifest.mjs";
const sha=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const allowed=["obligations","schedules","snapshots","reviews","rules","registry"];
function keysOk(v,keys){return !!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join("|")===keys.slice().sort().join("|")}
function validRows(rows,max){return Array.isArray(rows)&&rows.length<=max&&rows.every(x=>x&&typeof x==="object"&&!Array.isArray(x))}
export function compareSyntheticRehearsalEvidence({before,after,retry,manifest,manifestHash}={}){
 const reject=reason=>({ok:false,reason,decision:"blocked"});
 if(!verifySyntheticRegulatoryFixtureManifest(manifest,manifestHash).ok)return reject("manifest_invalid");
 for(const [name,state] of [["before",before],["after",after],["retry",retry]]){
  if(!keysOk(state,[...allowed,"scope","databaseFingerprint"])||state.scope!=="synthetic-only"||
    typeof state.databaseFingerprint!=="string"||!/^[a-f0-9]{16}$/.test(state.databaseFingerprint))
    return reject(name+"_invalid");
  for(const key of allowed)if(!validRows(state[key],200))return reject(name+"_rows_invalid");
 }
 if(before.databaseFingerprint!==after.databaseFingerprint||after.databaseFingerprint!==retry.databaseFingerprint)
  return reject("staging_identity_changed");
 // Provenance-sensitive fields must remain EXACT, not merely row counts.
 for(const key of ["obligations","schedules","snapshots","reviews"]){
  if(sha(before[key])!==sha(after[key])||sha(after[key])!==sha(retry[key]))
   return reject(key+"_changed");
 }
 // Retry must be fully idempotent across every compared inventory.
 for(const key of allowed)if(sha(after[key])!==sha(retry[key]))return reject("retry_"+key+"_changed");
 const oldRule=after.rules.find(x=>x.ruleKey==="bw.burs.vat.return-payment.25-days");
 const newRule=after.rules.find(x=>x.ruleKey==="bw.burs.vat.return-payment.28-days");
 if(oldRule?.status!=="review"||newRule?.status!=="draft")return reject("vat_governance_failed");
 if(after.rules.some(x=>x.status==="approved"||x.status==="published"))
  return reject("unexpected_activated_rule");
 if(before.obligations.length!==manifest.historicalVat.length||before.schedules.length!==manifest.schedules.length)
  return reject("synthetic_inventory_mismatch");
 return {ok:true,decision:"human_review_required",scope:"offline-comparison-only",
  fingerprint:before.databaseFingerprint,fixtureHash:manifestHash,
  evidenceDigest:sha({before,after,retry})};
}
