import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json')),worker=read('cloudflare/src/worker.js'),profile=JSON.parse(read('RELEASE_PROFILE.json'));
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL: ${m}`)};
ok(['1.21.59','1.21.60','1.21.61','1.21.62','1.21.63','1.21.64','1.21.65','1.21.66','1.21.67','1.21.68','1.21.69','1.21.70','1.21.71','1.21.72','1.21.73','1.21.74','1.21.75','1.21.76','1.21.77','1.21.78','1.21.79','1.21.80','1.21.81','1.21.82','1.21.83','1.21.84','1.21.85','1.21.86','1.21.87','1.21.88','1.21.89','1.21.90','1.21.91','1.21.92','1.21.93','1.21.94','1.21.95','1.21.96','1.21.97','1.21.98','1.21.99','1.21.100','1.21.101'].includes(pkg.version),'package identifies v1.21.59 or reviewed successor');
ok(profile.package_version===pkg.version&&profile.software_release_candidate===`v78.${pkg.version}`,'release profile aligned');
const requestStart=worker.indexOf('if(url.pathname==="/api/auth/password-reset/request"');
const completeStart=worker.indexOf('if(url.pathname==="/api/auth/password-reset/complete"');
const oauthStart=worker.indexOf('if(url.pathname.match(/^\\/api\\/auth\\/oauth',completeStart);
const request=worker.slice(requestStart,completeStart),complete=worker.slice(completeStart,oauthStart);
ok(requestStart>=0&&completeStart>requestStart,'password reset request route located');
if(pkg.version==='1.21.59'||pkg.version==='1.21.60'){
  ok(request.includes('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL'),'new reset invalidates older unused reset tokens');
  ok(request.includes('env.DB.batch([')&&request.includes('INSERT INTO password_reset_tokens'),'old-token invalidation and new-token issue are grouped');
}else{
  ok(!request.includes('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL'),'reviewed successor preserves earlier usable reset links at issuance');
  ok(request.includes('INSERT INTO password_reset_tokens')&&complete.includes('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL'),'reviewed successor revokes remaining reset links only after successful reset');
}
ok(complete.includes('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP RETURNING user_id'),'reset completion atomically claims token once');
ok(!complete.includes('SELECT token_hash,user_id FROM password_reset_tokens'),'legacy read-before-consume race removed');
ok(!complete.includes('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(hash)'), 'legacy unconditional consume removed');
ok(complete.includes('if(!claimed?.user_id)return json({error:"reset_token_invalid_or_expired"},400)'),'losing concurrent reset fails closed');
ok(complete.includes('DELETE FROM sessions WHERE user_id=?')&&complete.includes('claimed.user_id'),'winning reset revokes existing sessions');
ok(complete.indexOf('const claimed=')<complete.indexOf('UPDATE users SET password_hash=?'),'password update occurs only after successful token claim');
ok(profile.v12159_password_reset_single_consumption===true,'profile records password reset hardening');
console.log(`V78 1.21.59 password reset single-consumption gate: ${checks}/${checks} PASS`);
