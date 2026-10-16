import fs from 'node:fs';
import path from 'node:path';

const template=path.resolve(process.argv[2]||'cloudflare/wrangler-evaluation.toml');
const fail=message=>{throw new Error(`Cloudflare evaluation config render failed: ${message}`)};
const required=(name,pattern=null)=>{
  const value=String(process.env[name]||'').trim();
  if(!value)fail(`${name} is required`);
  if(/["\\\u0000-\u001f\u007f]/.test(value))fail(`${name} contains unsafe TOML characters`);
  if(pattern&&!pattern.test(value))fail(`${name} is malformed`);
  return value;
};
const optional=name=>{
  const value=String(process.env[name]||'').trim();
  if(/["\\\u0000-\u001f\u007f]/.test(value))fail(`${name} contains unsafe TOML characters`);
  return value;
};

if(!fs.existsSync(template))fail('template not found');
const root=path.dirname(template);
const mainEntry=path.resolve(root,'src/evaluation-entry.js');
const assetsDirectory=path.resolve(root,'../public');
if(!fs.existsSync(mainEntry))fail('evaluation entrypoint not found');
if(!fs.existsSync(assetsDirectory))fail('public assets directory not found');

const d1=required('D1_DATABASE_ID',/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const origin=required('PUBLIC_APP_URL',/^https:\/\/evaluate\.thebedesk\.com\/?$/);
const publicOrigin=required('PUBLIC_ORIGIN',/^https:\/\/evaluate\.thebedesk\.com\/?$/);
if(origin.replace(/\/$/,'')!==publicOrigin.replace(/\/$/,''))fail('PUBLIC_APP_URL and PUBLIC_ORIGIN must match');
const values={
  REPLACE_WITH_D1_DATABASE_ID:d1,
  REPLACE_WITH_PUBLIC_APP_URL:origin.replace(/\/$/,''),
  REPLACE_WITH_PUBLIC_ORIGIN:publicOrigin.replace(/\/$/,''),
  REPLACE_WITH_TURNSTILE_SITE_KEY:required('TURNSTILE_SITE_KEY',/^[A-Za-z0-9._-]{10,256}$/),
  REPLACE_WITH_PLATFORM_ADMIN_EMAILS:required('PLATFORM_ADMIN_EMAILS'),
  REPLACE_WITH_PLATFORM_REGULATORY_REVIEWERS:required('PLATFORM_REGULATORY_REVIEWERS'),
  REPLACE_WITH_EMAIL_FROM:required('EMAIL_FROM',/@[^\s<>]+\.[^\s<>]+>?$/),
  REPLACE_WITH_THEBE_BANK_NAME:required('THEBE_BANK_NAME'),
  REPLACE_WITH_THEBE_BANK_ACCOUNT_NUMBER:required('THEBE_BANK_ACCOUNT_NUMBER',/^[0-9]{6,20}$/),
  REPLACE_WITH_THEBE_BANK_ACCOUNT_TYPE:optional('THEBE_BANK_ACCOUNT_TYPE'),
  REPLACE_WITH_THEBE_BANK_BRANCH_NAME:optional('THEBE_BANK_BRANCH_NAME'),
  REPLACE_WITH_THEBE_BANK_BRANCH_CODE:required('THEBE_BANK_BRANCH_CODE',/^[0-9]{3,12}$/),
  REPLACE_WITH_THEBE_BANK_SWIFT_CODE:required('THEBE_BANK_SWIFT_CODE',/^[A-Z0-9]{8}([A-Z0-9]{3})?$/)
};

let source=fs.readFileSync(template,'utf8');
if(!/^name = "bw-compliance-os-evaluation"$/m.test(source))fail('evaluation Worker identity changed');
if(!/^main = "src\/evaluation-entry\.js"$/m.test(source))fail('evaluation entrypoint changed');
if(!/^REGISTRATION_MODE = "cohort"$/m.test(source))fail('evaluation registration must remain cohort-only');
if(!/^GOOGLE_OAUTH_CLIENT_ID = ""$/m.test(source)||!/^FACEBOOK_APP_ID = ""$/m.test(source))fail('social OAuth must remain disabled for evaluation');
source=source.replace(/^main = "src\/evaluation-entry\.js"$/m,`main = "${mainEntry}"`);
source=source.replace(/^directory = "\.\.\/public"$/m,`directory = "${assetsDirectory}"`);
for(const [placeholder,value] of Object.entries(values)){
  const count=source.split(placeholder).length-1;
  if(count!==1)fail(`expected exactly one ${placeholder}, found ${count}`);
  source=source.replace(placeholder,value);
}
if(/REPLACE_WITH_[A-Z0-9_]+/.test(source))fail('unresolved placeholder remains');
process.stdout.write(source);
