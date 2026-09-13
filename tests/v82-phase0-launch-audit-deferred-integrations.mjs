import fs from 'node:fs';

const audit=fs.readFileSync('scripts/production-launch-audit.mjs','utf8');
let pass=0;
const ok=(condition,message)=>{
  if(!condition)throw new Error(`FAIL: ${message}`);
  pass++;
  console.log('PASS',message);
};

ok(audit.includes("function deferred(label,detail='')"), 'launch audit has an explicit deferred integration state');
ok(audit.includes('const anyConfigured=hasClient||hasRedirect||hasSecret'), 'OAuth audit distinguishes fully absent providers from partial configuration');
ok(audit.includes('if(!anyConfigured)')&&audit.includes('deferred OAuth start must fail closed with HTTP 503'), 'fully deferred OAuth must prove its runtime start endpoint fails closed');
ok(audit.includes("redirect!==cfg.callback")&&audit.includes('missing while provider is partially configured'), 'partially configured OAuth remains fail closed');
ok(audit.includes('if(!resendSecret&&!hasEmailFrom)')&&audit.includes("deferred('password-reset email'"), 'transactional email may be fully deferred');
ok(audit.includes('RESEND_API_KEY missing while transactional email is partially configured')&&audit.includes('EMAIL_FROM missing, malformed, or placeholder while transactional email is partially configured'), 'partial transactional email configuration remains a launch failure');
ok(audit.includes('LAUNCH_INTEGRATIONS_READY_OR_DEFERRED'), 'successful launch audit reports configured-or-deferred integration readiness');
ok(!audit.includes('LAUNCH_INTEGRATIONS_READY Google OAuth + Facebook OAuth + Resend sender configuration present'), 'launch audit no longer requires optional integrations unconditionally');

console.log(`Phase 0 deferred integration launch-audit contract: ${pass}/8 PASS`);
