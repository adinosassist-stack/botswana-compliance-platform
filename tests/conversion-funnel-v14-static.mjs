import fs from "node:fs";

const entry=fs.readFileSync(new URL("../cloudflare/src/conversion-governance-entry.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../public/js/conversion-funnel-v14.js",import.meta.url),"utf8");
const wrangler=fs.readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");

const checks=[
  ["conversion wrapper is production entry",wrangler.includes('main = "src/conversion-governance-entry.js"')],
  ["wrapper retains release governance",entry.includes('import base from "./release-governance-entry.js"')],
  ["first-party event endpoint",entry.includes('/api/marketing/conversion-event')&&client.includes('/api/marketing/conversion-event')],
  ["anonymous conversion id only",entry.includes("conversionId")&&client.includes("conversionId")&&!client.includes("authEmail")&&!client.includes("companyName")&&!client.includes("password")],
  ["public event whitelist",entry.includes('"market_view","cta_click","registration_view","registration_submit"')],
  ["registration success server validated",entry.includes('stage:"registration_success"')&&entry.includes('path===REGISTER_PATH&&response.ok')],
  ["workspace reached requires prior successful registration",entry.includes("priorRegistrationSuccess")&&entry.includes('stage:"workspace_reached"')],
  ["workspace reached requires authenticated html response",entry.includes('path==="/app/"&&response.ok')&&entry.includes('includes("text/html")')],
  ["conversion cookie is short lived",client.includes("Max-Age=1800")&&entry.includes("Max-Age=0")],
  ["events isolated from customer tenants",entry.includes('const PUBLIC_TENANT="public-market"')],
  ["native rate limiter protects public event writes",entry.includes("PUBLIC_RATE_LIMITER")&&entry.includes("publicRateAllowed")&&entry.includes('error:"rate_limited"')],
  ["client ip is throttle-only not persisted",entry.includes('request.headers.get("cf-connecting-ip")')&&!entry.includes('event_data:transientIp')&&!entry.includes('ip:transientIp')],
  ["no third-party analytics",!client.includes("google-analytics")&&!client.includes("googletagmanager")&&!client.includes("facebook.com/tr")&&!client.includes("segment.com")]
];

const bad=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);
if(bad.length)process.exit(1);
