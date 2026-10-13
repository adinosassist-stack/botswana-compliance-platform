import fs from "node:fs";

const entry=fs.readFileSync(new URL("../cloudflare/src/release-governance-entry.js",import.meta.url),"utf8");
const governance=fs.readFileSync(new URL("../cloudflare/src/conversion-funnel-governance.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../public/js/conversion-funnel-v14.js",import.meta.url),"utf8");
const reporter=fs.readFileSync(new URL("../public/js/reporter-link-redirect.js",import.meta.url),"utf8");
const wrangler=fs.readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");

const checks=[
  ["governed production entry retained",wrangler.includes('main = "src/release-governance-entry.js"')],
  ["conversion helper integrated into release governance",entry.includes('from "./conversion-funnel-governance.js"')&&entry.includes("handleConversionEvent")],
  ["auth page receives first-party funnel script",entry.includes("CONVERSION_FUNNEL_SCRIPT")&&entry.includes("if(authSurface)injected=injectScriptOnce")],
  ["market page loads first-party funnel script",reporter.includes("conversion-funnel-v14.js")],
  ["first-party event endpoint",governance.includes('/api/marketing/conversion-event')&&client.includes('/api/marketing/conversion-event')],
  ["anonymous conversion id only",governance.includes("conversionId")&&client.includes("conversionId")&&!client.includes("authEmail")&&!client.includes("companyName")&&!client.includes("password")],
  ["public event whitelist",governance.includes('"market_view","cta_click","registration_view","registration_submit"')],
  ["registration success server validated",governance.includes('stage:"registration_success"')&&entry.includes("recordRegistrationSuccess")],
  ["workspace reached requires prior successful registration",governance.includes("priorRegistrationSuccess")&&governance.includes('stage:"workspace_reached"')&&entry.includes("recordWorkspaceReached")],
  ["workspace reached requires authenticated html response",governance.includes('path!=="/app/"')&&governance.includes('includes("text/html")')],
  ["conversion cookie is short lived",client.includes("Max-Age=1800")&&governance.includes("Max-Age=0")],
  ["events isolated from customer tenants",governance.includes('const PUBLIC_TENANT="public-market"')],
  ["native rate limiter protects public event writes",governance.includes("PUBLIC_RATE_LIMITER")&&governance.includes("publicRateAllowed")&&governance.includes('error:"rate_limited"')],
  ["client ip is throttle-only not persisted",governance.includes('request.headers.get("cf-connecting-ip")')&&!governance.includes('event_data:transientIp')&&!governance.includes('ip:transientIp')],
  ["source attribution crosses into registration",client.includes("thebe_conversion_source")&&client.includes("currentAttribution")],
  ["no third-party analytics",!client.includes("google-analytics")&&!client.includes("googletagmanager")&&!client.includes("facebook.com/tr")&&!client.includes("segment.com")]
];

const bad=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);
if(bad.length)process.exit(1);
