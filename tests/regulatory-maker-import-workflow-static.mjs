import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/regulatory-maker-import.yml',import.meta.url),'utf8');

const checks=[
  ['manual trigger only',workflow.includes('workflow_dispatch:')&&!/\n\s*(push|pull_request|schedule|workflow_run):/.test(workflow)],
  ['main ref guard',workflow.includes("github.ref == 'refs/heads/main'")&&workflow.includes("refusing non-main execution")],
  ['explicit confirmation',workflow.includes('IMPORT_CURRENT_FOUNDATION_PACK')],
  ['production environment',workflow.includes('environment: production')],
  ['dedicated maker credentials',workflow.includes('PLATFORM_REGULATORY_MAKER_EMAIL')&&workflow.includes('PLATFORM_REGULATORY_MAKER_PASSWORD')],
  ['governed login',workflow.includes('/api/auth/login')],
  ['platform role proof',workflow.includes('/api/platform/regulatory/status')&&workflow.includes("role in {'editor','admin'}")],
  ['foundation preflight',workflow.includes('/api/platform/regulatory/foundation-pack')&&workflow.includes('/api/platform/regulatory/readiness')],
  ['governed maker import',workflow.includes('/api/platform/regulatory/foundation-pack/import')],
  ['csrf protected mutation',workflow.includes('X-CSRF-Token')&&workflow.includes('Origin: $APP_ORIGIN')],
  ['no reviewer mutation endpoints',!workflow.includes('/sources/')||!workflow.includes('/sources/')],
  ['no rule advance',!workflow.includes('/rules/')&&!workflow.includes('/advance')],
  ['no conflict or rollout mutation',!workflow.includes('/conflicts/')&&!workflow.includes('/rollouts/')],
  ['no principal provisioning',!workflow.includes('platform_regulatory_principals')&&!workflow.includes('PLATFORM_REGULATORY_REVIEWERS')],
  ['no direct database mutation',!workflow.includes('wrangler d1')&&!workflow.includes('INSERT INTO')&&!workflow.includes('UPDATE regulatory_')&&!workflow.includes('DELETE FROM')],
  ['post import truth check',workflow.includes('current foundation pack does not have a completed import record')&&workflow.includes('maker import produced no regulatory sources')&&workflow.includes('maker import produced no regulatory rules')],
  ['auth cleanup',workflow.includes('Remove local authentication material')&&workflow.includes('rm -f /tmp/thebe-maker-csrf')]
];

const bad=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(bad.length)process.exit(1);
