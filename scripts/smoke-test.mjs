import fs from 'fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/server.js',import.meta.url),'utf8');
const required=['authGate','async function bootstrap()','/api/state','/api/evidence/presign','Security Center','function renderSourceRegistry()','function renderPublishing()','hideAuth();logEvent("APP_OPENED"'];
for(const x of required){if(!html.includes(x))throw new Error(`Missing ${x}`)}
for(const x of ['/api/live','/api/ready','/api/ops/diagnostics','GRACEFUL_SHUTDOWN','schema_migrations','workspace_conflict']){if(!server.includes(x))throw new Error(`Missing server operation ${x}`)}
console.log('Static smoke checks passed');

for(const f of ['006_evidence_malware_scan.sql','007_subscriptions.sql']){if(!fs.existsSync(new URL('../db/migrations/'+f,import.meta.url)))throw new Error('Missing migration '+f)}
