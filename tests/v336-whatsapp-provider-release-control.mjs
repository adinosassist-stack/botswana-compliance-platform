import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {__v76Test} from '../cloudflare/src/worker.js';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const wrangler=read('cloudflare/wrangler.toml');
const renderer=read('cloudflare/render-production-config.sh');
const deploy=read('.github/workflows/deploy-production.yml');
const providerWorkflow=read('.github/workflows/whatsapp-provider-readiness.yml');

const requiredKeys=[
  'obligation_due','compliance_schedule_due','daily_operations_summary_ready',
  'critical_business_risk','control_assurance_stale','performance_intelligence_alert'
];
const templates=Object.fromEntries(requiredKeys.map(key=>[key,{name:`thebe_${key}`,language:'en_US'}]));
const templateJson=JSON.stringify(templates);
const baseEnv={
  ...process.env,
  D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',
  PAYMENT_PROVIDER_OVERRIDE:'none',
  PUBLIC_APP_URL:'https://thebedesk.com',
  PUBLIC_ORIGIN:'https://thebedesk.com',
  TURNSTILE_SITE_KEY:'test-turnstile-site-key-123',
  PLATFORM_ADMIN_EMAILS:'owner@thebedesk.com',
  PLATFORM_REGULATORY_REVIEWERS:'reviewer@thebedesk.com',
  EVIDENCE_SCAN_API_URL:'',
  GOOGLE_OAUTH_CLIENT_ID:'',
  GOOGLE_OAUTH_CLIENT_SECRET:'',
  GOOGLE_OAUTH_REDIRECT_URI:'https://thebedesk.com/api/auth/oauth/google/callback',
  FACEBOOK_APP_ID:'',
  FACEBOOK_APP_SECRET:'',
  FACEBOOK_OAUTH_REDIRECT_URI:'https://thebedesk.com/api/auth/oauth/facebook/callback',
  EMAIL_FROM:'Thebe Desk <support@thebedesk.com>',
  WHATSAPP_BUSINESS_NUMBER:'',
  WHATSAPP_PHONE_NUMBER_ID:'',
  WHATSAPP_GRAPH_VERSION:'',
  WHATSAPP_TEMPLATE_MAP_JSON:''
};
function render(extra={}){
  return spawnSync('sh',['cloudflare/render-production-config.sh','cloudflare/wrangler.toml'],{
    cwd:new URL('.',root),env:{...baseEnv,...extra},encoding:'utf8'
  });
}

assert.match(wrangler,/WHATSAPP_BUSINESS_NUMBER = "REPLACE_WITH_WHATSAPP_BUSINESS_NUMBER"/);
assert.match(wrangler,/WHATSAPP_PHONE_NUMBER_ID = "REPLACE_WITH_WHATSAPP_PHONE_NUMBER_ID"/);
assert.match(wrangler,/WHATSAPP_GRAPH_VERSION = "REPLACE_WITH_WHATSAPP_GRAPH_VERSION"/);
assert.match(wrangler,/WHATSAPP_TEMPLATE_MAP_JSON = 'REPLACE_WITH_WHATSAPP_TEMPLATE_MAP_JSON'/);
assert.match(renderer,/WHATSAPP_BINDING_COUNT/);
assert.match(renderer,/26777723273/);
assert.match(renderer,/WHATSAPP_PHONE_NUMBER_ID must not be the public business number/);

const deferred=render();
assert.equal(deferred.status,0,deferred.stderr);
assert.match(deferred.stdout,/WHATSAPP_BUSINESS_NUMBER = ""/);
assert.match(deferred.stdout,/WHATSAPP_PHONE_NUMBER_ID = ""/);
assert.match(deferred.stdout,/WHATSAPP_GRAPH_VERSION = ""/);
assert.match(deferred.stdout,/WHATSAPP_TEMPLATE_MAP_JSON = ''/);

const partial=render({WHATSAPP_BUSINESS_NUMBER:'26777723273'});
assert.notEqual(partial.status,0,'partial binding group must fail closed');
assert.match(partial.stderr,/bindings must provide business number, Meta phone-number ID, graph version and template map together/);

const complete=render({
  WHATSAPP_BUSINESS_NUMBER:'+267 77 723 273',
  WHATSAPP_PHONE_NUMBER_ID:'123456789012345',
  WHATSAPP_GRAPH_VERSION:'v26.0',
  WHATSAPP_TEMPLATE_MAP_JSON:templateJson
});
assert.equal(complete.status,0,complete.stderr);
assert.match(complete.stdout,/WHATSAPP_BUSINESS_NUMBER = "26777723273"/);
assert.match(complete.stdout,/WHATSAPP_PHONE_NUMBER_ID = "123456789012345"/);
assert.match(complete.stdout,/WHATSAPP_GRAPH_VERSION = "v26.0"/);
for(const key of requiredKeys)assert.ok(complete.stdout.includes(`\\"${key}\\"`)||complete.stdout.includes(`"${key}"`),`rendered map missing ${key}`);

const wrongNumber=render({
  WHATSAPP_BUSINESS_NUMBER:'26771234567',
  WHATSAPP_PHONE_NUMBER_ID:'123456789012345',
  WHATSAPP_GRAPH_VERSION:'v26.0',
  WHATSAPP_TEMPLATE_MAP_JSON:templateJson
});
assert.notEqual(wrongNumber.status,0);
assert.match(wrongNumber.stderr,/approved \+267 77 723 273/);

const confusedId=render({
  WHATSAPP_BUSINESS_NUMBER:'26777723273',
  WHATSAPP_PHONE_NUMBER_ID:'26777723273',
  WHATSAPP_GRAPH_VERSION:'v26.0',
  WHATSAPP_TEMPLATE_MAP_JSON:templateJson
});
assert.notEqual(confusedId.status,0);
assert.match(confusedId.stderr,/must not be the public business number/);

const missingTemplate={...templates};
delete missingTemplate.control_assurance_stale;
const missing=render({
  WHATSAPP_BUSINESS_NUMBER:'26777723273',
  WHATSAPP_PHONE_NUMBER_ID:'123456789012345',
  WHATSAPP_GRAPH_VERSION:'v26.0',
  WHATSAPP_TEMPLATE_MAP_JSON:JSON.stringify(missingTemplate)
});
assert.notEqual(missing.status,0);
assert.match(missing.stderr,/missing required template control_assurance_stale|six-template utility contract/);

const runtimeComplete={
  WHATSAPP_PHONE_NUMBER_ID:'123456789012345',
  WHATSAPP_GRAPH_VERSION:'v26.0',
  WHATSAPP_TEMPLATE_MAP_JSON:templateJson,
  WHATSAPP_ACCESS_TOKEN:'test-access-token-that-is-long-enough',
  WHATSAPP_APP_SECRET:'test-app-secret-long-enough',
  WHATSAPP_VERIFY_TOKEN:'test-verify-token-long-enough'
};
const ready=__v76Test.whatsappConnectorStatus(runtimeComplete);
assert.equal(ready.configured,true);
assert.deepEqual(ready.missingTemplates,[]);
assert.equal(ready.requiredTemplateCount,6);

const runtimeDeferred={
  WHATSAPP_PHONE_NUMBER_ID:'',
  WHATSAPP_GRAPH_VERSION:'',
  WHATSAPP_TEMPLATE_MAP_JSON:'',
  WHATSAPP_ACCESS_TOKEN:'deferred',
  WHATSAPP_APP_SECRET:'deferred',
  WHATSAPP_VERIFY_TOKEN:'deferred'
};
const notReady=__v76Test.whatsappConnectorStatus(runtimeDeferred);
assert.equal(notReady.configured,false);
assert.equal(notReady.credentialsConfigured,false);
assert.equal(notReady.webhookConfigured,false);

for(const key of ['WHATSAPP_BUSINESS_NUMBER','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_GRAPH_VERSION','WHATSAPP_TEMPLATE_MAP_JSON']){
  assert.ok(deploy.includes(key),`production deploy must reference ${key}`);
  assert.ok(providerWorkflow.includes(key),`provider readiness must reference ${key}`);
}
for(const key of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN']){
  assert.ok(deploy.includes(key),`production deploy must reference secret ${key}`);
  assert.ok(providerWorkflow.includes(key),`provider readiness must reference secret ${key}`);
}
assert.match(deploy,/whatsapp_provider_enabled/);
assert.match(deploy,/deferred/);
assert.match(providerWorkflow,/WHATSAPP_CONNECTOR/);
assert.match(providerWorkflow,/no Meta request/i);
assert.doesNotMatch(providerWorkflow,/graph\.facebook\.com/);

console.log('WHATSAPP_PROVIDER_RELEASE_CONTROL_PASS');
