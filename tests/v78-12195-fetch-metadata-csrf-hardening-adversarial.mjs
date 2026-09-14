import fs from "node:fs";
import assert from "node:assert/strict";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const pkg=JSON.parse(read("package.json")),profile=JSON.parse(read("RELEASE_PROFILE.json")),originPolicy=read("server/origin-policy.js"),server=read("server/server.js"),worker=read("cloudflare/src/worker.js"),sw=read("public/sw.js"),readme=read("README.md"),launch=read("docs/LAUNCH.md");
let pass=0;const ok=(v,m)=>{assert.ok(v,m);console.log("PASS",m);pass++};
ok(["1.21.95","1.21.96","1.21.97","1.21.98","1.21.99","1.21.100","1.21.101"].includes(pkg.version)&&profile.package_version===pkg.version&&profile.software_release_candidate===`v78.${pkg.version}`,"1.21.95 release identity aligned");
ok(profile.v12195_fetch_metadata_csrf_hardening===true&&profile.fetch_metadata_cross_site_mutations_rejected===true&&profile.fetch_metadata_same_site_sibling_mutations_rejected===true&&profile.origin_and_csrf_fallbacks_preserved===true,"release profile records Fetch Metadata CSRF hardening");
ok(originPolicy.includes("function fetchMetadataAllowsBrowserMutation")&&originPolicy.includes('site==="same-origin"||site==="none"'),"Node Fetch Metadata policy allows only same-origin/none when browser signal is present");
ok(server.includes('rule.originProtected&&(!nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])||!nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN))'),"Node pre-body auth boundary rejects untrusted Fetch Metadata before parsing");
ok(server.includes('if(!nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])||!nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN))return res.status(403).json({error:"origin_failed"});')&&server.includes('timingSafeTextEqual(req.headers["x-csrf-token"],req.auth.csrf_token)'),"Node authenticated mutations combine Fetch Metadata, Origin and CSRF");
ok(server.includes('function preAuthOrigin(req,res,next){return nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])&&nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN)'),"Node login/register/reset pre-auth middleware applies Fetch Metadata");
ok(worker.includes('function fetchMetadataAllowsBrowserMutation(req)')&&worker.includes('return site==="same-origin"||site==="none";'),"Worker Fetch Metadata policy rejects cross-site and sibling same-site browser requests");
ok(worker.includes('if(!fetchMetadataAllowsBrowserMutation(req))return false;')&&worker.indexOf('if(!fetchMetadataAllowsBrowserMutation(req))return false;')<worker.indexOf('const raw=req.headers.get("origin")'),"Worker evaluates Fetch Metadata before Origin fallback");
ok((worker.match(/if\(!requestOriginAllowed\(req,env\)\)return json\(\{error:"origin_failed"\},403/g)||[]).length>=5,"Worker pre-auth and central API surfaces retain origin policy gate");
ok(worker.includes('/public/daily-reporting/access')&&worker.includes('/public/daily-reporting/submit')&&worker.includes('requestOriginAllowed(req,env)'),"public reporting mutations remain behind combined browser-origin policy");
ok(sw.includes("1.21.101-registration-owner-ui-hotfix-20260914"),"service-worker cache identifies v1.21.95 reviewed successor");
{const chain=String(pkg.scripts.test||"");const a=chain.indexOf("npm run test:v78-12195"),b=chain.indexOf("npm run test:v78-12194");ok(a>=0&&b>a,"v1.21.95 gate remains ordered before v1.21.94 in the full regression chain");}
ok(readme.includes('v1.21.95 hardening')&&readme.includes('Sec-Fetch-Site')&&launch.includes('Sec-Fetch-Site: cross-site'),"operator documentation records Fetch Metadata boundary");
console.log(`V78 1.21.95 Fetch Metadata CSRF hardening adversarial: ${pass}/${pass} PASS`);
