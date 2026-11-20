/**
 * C4 external-customer Worker offline build evidence only.
 * No network, Cloudflare credentials, Google tokens or deployment actions.
 * A build receipt does NOT prove live Access bindings, IdP, customer ownership,
 * private staging execution or approval for any infrastructure write.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {hashBundleDirectory} from "./quotation-staging-bundle-hash.mjs";

const LOCK=Object.freeze({
 name:"bw-customer-quotation-identity-private-staging",
 main:"../../server/essentials-private-customer-worker-candidate.mjs",
 binding:"CUSTOMER_CONSENT_DB",
 databaseName:"bw-essentials-customer-consent-private-staging",
 databaseId:"56f48000-9d89-47d5-a077-47dfe0825662",
 wranglerVersion:"4.135.0"
});
const failure=k=>{throw Error("c4_offline_build_"+k)};
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const SHA=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
const safeRead=(path)=>{try{return readFileSync(path)}catch{failure("required_file_missing")}};

export function createC4PrivateOfflineReceipt({
 checkoutSha,bundleDir,root=process.cwd(),eventName="local-offline"
}={}){
 if(!SHA(checkoutSha))failure("invalid_checkout_sha");
 if(typeof eventName!=="string"||!/^[a-z_-]{1,32}$/.test(eventName))
  failure("invalid_event");
 const workspace=resolve(root);
 const manifestRelative="deploy/customer-quotation-private-staging/wrangler.jsonc";
 const sourceRelative="server/essentials-private-customer-worker-candidate.mjs";
 const testRelative="tests/customer-quotation-private-worker.test.mjs";
 const lockRelative="package-lock.json";
 const manifestBytes=safeRead(join(workspace,manifestRelative));
 const sourceBytes=safeRead(join(workspace,sourceRelative));
 const testBytes=safeRead(join(workspace,testRelative));
 const lockBytes=safeRead(join(workspace,lockRelative));
 const packageBytes=safeRead(join(workspace,"package.json"));
 const raw=manifestBytes.toString("utf8");
 let cfg;
 try{cfg=JSON.parse(raw.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n"))}
 catch{failure("invalid_manifest")}
 const keys=Object.keys(cfg).sort().join(",");
 const allowed=["compatibility_date","d1_databases","main","name","preview_urls","routes","workers_dev"].sort().join(",");
 if(keys!==allowed||cfg.name!==LOCK.name||cfg.main!==LOCK.main||
  cfg.workers_dev!==false||cfg.preview_urls!==false||
  !Array.isArray(cfg.routes)||cfg.routes.length!==0)
  failure("unexpected_public_configuration");
 if(!Array.isArray(cfg.d1_databases)||cfg.d1_databases.length!==1)
  failure("unexpected_d1_bindings");
 const b=cfg.d1_databases[0];
 if(Object.keys(b).sort().join(",")!==["binding","database_id","database_name"].sort().join(",")||
  b.binding!==LOCK.binding||b.database_name!==LOCK.databaseName||
  b.database_id!==LOCK.databaseId)
  failure("wrong_customer_database");
 let pkg,packageLock;
 try{pkg=JSON.parse(packageBytes.toString("utf8"));
  packageLock=JSON.parse(lockBytes.toString("utf8"))}
 catch{failure("package_lock_unparseable")}
 const version=pkg?.devDependencies?.wrangler||pkg?.dependencies?.wrangler;
 const locked=packageLock?.packages?.["node_modules/wrangler"]?.version;
 if(version!==LOCK.wranglerVersion||locked!==LOCK.wranglerVersion)
  failure("wrangler_version_unpinned");
 const source=sourceBytes.toString("utf8");
 if(!source.includes("export default Object.freeze({")||
    !source.includes("fetch() { return denied(); }")||
    !source.includes("defaultWorkerEnabled: false"))
  failure("default_deny_source_changed");
 let bundle;
 try{bundle=hashBundleDirectory(bundleDir)}
 catch{failure("compiled_bundle_unavailable")}

 const worker=bundle.entries.find(x=>x.path==="worker.js");
 if(!worker||worker.bytes<100)failure("compiled_worker_missing");
 const sources=Object.freeze({
  [manifestRelative]:digest(manifestBytes),
  [sourceRelative]:digest(sourceBytes),
  [testRelative]:digest(testBytes),
  [lockRelative]:digest(lockBytes),
  "package.json":digest(packageBytes)
 });
 const reviewedInputsSha256=digest(JSON.stringify(sources));
 const canonical=Object.freeze({
  schema:"thebe.c4.customer-quotation.offline-bundle.v1",
  checkoutSha,eventName,worker:LOCK.name,
  customerDatabaseId:LOCK.databaseId,
  workerSha256:worker.sha256,
  compiledFiles:bundle.entries,
  compiledManifestSha256:bundle.manifestSha256,
  sourceInputs:sources,
  sourceInputsSha256:reviewedInputsSha256
 });
 return Object.freeze({
  ...canonical,receiptSha256:digest(JSON.stringify(canonical)),
  evidenceScope:"OFFLINE_COMPILED_DEFAULT_DENY_ONLY",
  googleProjectCreated:false,
  realGoogleOidcVerified:false,
  customerAccountOwnershipVerified:false,
  privateStagingDeployed:false,
  productionLoginEnabled:false,
  cloudflareUploadAuthorized:false,
  cloudflareDeployAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [bundleDir,checkoutSha,eventName="local-offline"]=process.argv.slice(2);
 const r=createC4PrivateOfflineReceipt({bundleDir,checkoutSha,eventName});
 process.stdout.write(JSON.stringify(r,null,2)+"\n");
}
