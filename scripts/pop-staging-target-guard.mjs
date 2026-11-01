// Guardrail for staging-only schema initialization; no remote writes.
const PROD='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const STAGE='812f9021-890b-41e6-8fa1-6001f90a9b53';
export function validateStagingTarget(args) {
  if(args.target !== STAGE || args.target === PROD) throw Error('staging_target_invalid');
  if(args.sourceSha !== args.currentMainSha || !/^[a-f0-9]{40}$/.test(args.currentMainSha||'')) throw Error('staging_source_invalid');
  if(args.confirmation !== 'INITIALIZE_EMPTY_POP_STAGING_ONLY') throw Error('staging_confirmation_missing');
  if(args.existingObjects.length !== 1 || args.existingObjects[0].name !== '_cf_KV') throw Error('staging_not_empty');
  return {target:STAGE,productionWriteAllowed:false,stagingApprovedForReview:true};
}
