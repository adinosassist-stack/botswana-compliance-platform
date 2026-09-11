import fs from 'fs';
const server=fs.readFileSync('server/server.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const html=fs.readFileSync('public/index.html','utf8');
const migration=fs.readFileSync('db/migrations/026_v78_node_runtime_hardening.sql','utf8');
const checks=[
  ['node release version centralized',server.includes(`const APP_VERSION="${pkg.version}"`)],
  ['role middleware defined',/function requireRole\(\.\.\.allowed\)\{return \[auth,roles\(\.\.\.allowed\)\]\}/.test(server)],
  ['session auth aliases normalized',/userId:row\.user_id,tenantId:row\.tenant_id/.test(server)],
  ['csrf comparison timing safe',/timingSafeTextEqual\(req\.headers\["x-csrf-token"\],req\.auth\.csrf_token\)/.test(server)],
  ['no undefined csrf middleware',!server.includes('auth,csrf,roles(')],
  ['scanner signed GET command valid',/getSignedUrl\(client,new GetObjectCommand\(\{Bucket:config\.OBJECT_STORE_BUCKET,Key:ev\.object_key\}\),\{expiresIn:300\}\)/.test(server)],
  ['download signed GET command valid',/getSignedUrl\(client,new GetObjectCommand\(\{Bucket:config\.OBJECT_STORE_BUCKET,Key:ev\.object_key,ResponseContentDisposition:/.test(server)],
  ['no malformed signed command constructor',!server.includes('new GetObjectCommand, DeleteObjectCommand(')],
  ['object deletion uses configured S3 client',/const client=s3\(\);if\(!client\|\|!config\.OBJECT_STORE_BUCKET\)/.test(server)&&/await client\.send\(new DeleteObjectCommand/.test(server)],
  ['no stale objectStoreBucket key',!server.includes('config.objectStoreBucket')],
  ['account export uses app_state',/pool\.query\("select state,updated_at,version from app_state/.test(server)],
  ['account export avoids nonexistent company table',!server.includes('from companies where tenant_id')],
  ['account export avoids nonexistent cases table',!server.includes('from cases where tenant_id')],
  ['account export audit column valid',/entity_id_text as entity_id/.test(server)],
  ['retention audit column valid',/entity_type,entity_id_text,event_data/.test(server)],
  ['oauth link callback loads session',/if\(state\.mode==="link"\)req\.auth=await loadSessionAuth\(req\)/.test(server)],
  ['oauth session uses canonical session helper',/const oauthSession=await createSession\(db,user\.id,mem\.rows\[0\]\.tenant_id\)/.test(server)],
  ['oauth no invalid sessions role column',!server.includes('sessions(token_hash,user_id,tenant_id,role,expires_at)')],
  ['social auth nullable-password migration',/ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL/.test(migration)&&/password_salt DROP NOT NULL/.test(migration)],
  ['display name migration',/ADD COLUMN IF NOT EXISTS display_name text/.test(migration)],
  ['deletion status migration covers worker states',/processing/.test(migration)&&/failed/.test(migration)],
  ['presigned uploads do not leak CSRF header',!/fetch\(pre\.uploadUrl,[\s\S]{0,220}X-CSRF-Token/.test(html)],
  ['node CSP hashes inline executable scripts',/function inlineScriptHashes\(\)/.test(server)&&/crypto\.createHash\("sha256"\)/.test(server)&&/\.\.\.INLINE_SCRIPT_HASHES/.test(server)],
  ['node CSP disables inline event attributes',/scriptSrcAttr:\["'none'"\]/.test(server)&&!server.includes('scriptSrcAttr:["\'unsafe-inline\'"]')],
  ['node CSP removes unsafe-inline script execution',!/scriptSrc:\[[^\]]*unsafe-inline/.test(server)&&!/scriptSrcElem:\[[^\]]*unsafe-inline/.test(server)],
  ['release health metadata current',/version:APP_VERSION/.test(server)],
];
let pass=0;
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else{pass++;console.log('PASS',name)}}
console.log(`V78 1.21.47 Node runtime hardening static gate: ${pass}/${checks.length} PASS`);
if(pass!==checks.length)process.exit(1);
