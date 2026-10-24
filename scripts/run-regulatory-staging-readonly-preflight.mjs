// Operator-invoked read-only staging audit. This file never initiates a migration.
import {createStagingRegulatoryAttestor} from "./regulatory-staging-readonly-attestor.mjs";
try{
  const report=await createStagingRegulatoryAttestor({
    token:process.env.CLOUDFLARE_API_TOKEN,
    accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
    stagingDatabaseId:process.env.REGULATORY_STAGING_D1_ID,
    productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,
    expectedStagingName:process.env.REGULATORY_STAGING_D1_NAME
  }).attest();
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  // Blockers are an expected, meaningful audit outcome; a clean report does not authorise import.
  if(report.blockers.activeLegacyVatRules>0||report.blockers.sourceMetadataDrift>0)process.exitCode=2;
}catch(error){
  // Deliberately never echo provider bodies, tokens, IDs or full remote metadata.
  process.stderr.write("REGULATORY_STAGING_READONLY_FAILED "+String(error?.message||"unknown")+"\n");
  process.exitCode=1;
}
