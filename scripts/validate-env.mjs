import fs from 'fs';
const allowExample=process.argv.includes('--allow-example');
const env=process.env;
const secretValue=k=>env[k]||env[`${k}_FILE`];
const errors=[];
const required=['DATABASE_URL','SESSION_SECRET','PUBLIC_ORIGIN'];
for(const k of required){if(!secretValue(k)&&!allowExample)errors.push(`${k} or ${k}_FILE is required`)}
if(env.SESSION_SECRET && env.SESSION_SECRET.length<32)errors.push('SESSION_SECRET must be at least 32 characters');
const strongSecret=(v,min=32)=>{const x=String(v||'');return x.length>=min&&!/replace|example|changeme|placeholder/i.test(x)};
if(env.APP_ENV==='production'&&!strongSecret(secretValue('RETENTION_JOB_SECRET'),32))errors.push('RETENTION_JOB_SECRET or _FILE must be a strong 32+ character secret in production');
if(env.APP_ENV==='production'&&!env.TURNSTILE_SITE_KEY)errors.push('TURNSTILE_SITE_KEY is required in production');
if(env.APP_ENV==='production'&&!strongSecret(secretValue('TURNSTILE_SECRET_KEY'),20))errors.push('TURNSTILE_SECRET_KEY or _FILE is required in production');
if(env.PUBLIC_ORIGIN && !/^https:\/\//.test(env.PUBLIC_ORIGIN) && env.APP_ENV==='production')errors.push('PUBLIC_ORIGIN must use https in production');
if(env.TRUST_PROXY_HOPS && !/^[0-3]$/.test(String(env.TRUST_PROXY_HOPS)))errors.push('TRUST_PROXY_HOPS must be an integer from 0 to 3');
const objectKeys=['OBJECT_STORE_BUCKET','OBJECT_STORE_ACCESS_KEY_ID','OBJECT_STORE_SECRET_ACCESS_KEY'];
const configured=objectKeys.filter(k=>env[k]).length;
if(configured>0&&configured<objectKeys.length)errors.push('Object storage must be fully configured or fully omitted');
if(env.APP_ENV==='production'&&!env.OBJECT_STORE_BUCKET)errors.push('Private object storage is required in production');
if(env.MALWARE_SCAN_REQUIRED&&!['true','false'].includes(String(env.MALWARE_SCAN_REQUIRED).toLowerCase()))errors.push('MALWARE_SCAN_REQUIRED must be true or false');
if(env.APP_ENV==='production'&&String(env.MALWARE_SCAN_REQUIRED||'').toLowerCase()!=='true')errors.push('MALWARE_SCAN_REQUIRED must be true in production');
if(env.APP_ENV==='production'&&!env.MALWARE_SCAN_WEBHOOK_URL)errors.push('MALWARE_SCAN_WEBHOOK_URL is required in production');
if(env.APP_ENV==='production'&&!secretValue('MALWARE_SCAN_WEBHOOK_SECRET'))errors.push('MALWARE_SCAN_WEBHOOK_SECRET or _FILE is required in production');
if(errors.length){console.error(errors.map(x=>`ENV ERROR: ${x}`).join('\n'));process.exit(1)}
console.log('Environment validation passed');
