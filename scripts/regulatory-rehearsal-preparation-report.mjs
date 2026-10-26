// Local-only machine-readable preparation report. No SQL, network, credentials or writes.
import {prepareRegulatoryStagingWritePlan} from "./regulatory-staging-rehearsal-write-plan.mjs";
export function createRehearsalPreparationReport(input={}){
 const plan=prepareRegulatoryStagingWritePlan(input);
 return Object.freeze({
  schema:"thebe-regulatory-rehearsal-preparation-v1",
  classification:"offline-only",
  result:plan.ok?"requires_independent_write_authorization":"blocked",
  reason:plan.ok?"separate_reviewed_writer_and_protected_approval_required":plan.reason,
  fixtureDigest:plan.ok?plan.fixtureDigest:null,
  counts:plan.ok?plan.counts:null,
  remoteWriteAuthorized:false,
  sqlGenerated:false,
  productionActivationAuthorized:false
 });
}
