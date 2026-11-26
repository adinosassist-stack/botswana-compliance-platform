import {verifyPrivateAiResearch} from "./general-ai-private-acceptance.js";

// The protected operator supplies the staging-only service and fixture lifecycle.
// This module has no Worker entrypoint and does not modify Worker settings.
export async function runPrivateResearchAcceptance({service,createFixture,removeFixture}={}){
  if(typeof service?.fetch!=="function"||typeof createFixture!=="function"||typeof removeFixture!=="function"){
    throw Error("private_research_lifecycle_required");
  }
  const runId=crypto.randomUUID();
  let evidence;
  try{
    const {sessionToken,csrfToken}=await createFixture({runId,expiresInSeconds:300});
    const start=Date.now();
    evidence=await verifyPrivateAiResearch({service,sessionToken,csrfToken});
    evidence.elapsedMs=Date.now()-start;
  }finally{
    // Use the run identity even if creation fails after a partial write.
    if(await removeFixture({runId})!==true)throw Error("private_research_cleanup_unverified");
  }
  return evidence;
}
