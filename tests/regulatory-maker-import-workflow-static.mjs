import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/regulatory-maker-import.yml',import.meta.url),'utf8');

const checks=[
  ['manual trigger retained',workflow.includes('workflow_dispatch:')],
  ['push trigger limited to main',workflow.includes('push:')&&workflow.includes('branches: [main]')],
  ['push trigger limited to one trigger file',workflow.includes("- 'operations/regulatory-maker-import-trigger.json'")&&!workflow.includes("- '.github/workflows/regulatory-maker-import.yml'",workflow.indexOf('push:'))],
  ['main ref guard',workflow.includes("github.ref == 'refs/heads/main'")&&workflow.includes("refusing non-main execution")],
  ['manual explicit confirmation',workflow.includes("inputs.confirmation == 'IMPORT_CURRENT_FOUNDATION_PACK'")&&workflow.includes('explicit workflow-dispatch confirmation missing')],
  ['push explicit commit marker',workflow.includes("contains(github.event.head_commit.message, '[run-regulatory-maker-import]')")],
  ['push trigger payload validated',workflow.includes("data.get('schema') == 1")&&workflow.includes("data.get('requested') is True")&&workflow.includes("data.get('packKey') == 'botswana-foundation-v1'")&&workflow.includes("governed-production-foundation-pack-import")],
  ['production environment',workflow.includes('environment: production')],
  ['dedicated maker credentials',workflow.includes('PLATFORM_REGULATORY_MAKER_EMAIL')&&workflow.includes('PLATFORM_REGULATORY_MAKER_PASSWORD')],
  ['governed login',workflow.includes('/api/auth/login')],
  ['platform role proof',workflow.includes('/api/platform/regulatory/status')&&workflow.includes("role in {'editor','admin'}")],
  ['foundation preflight',workflow.includes('/api/platform/regulatory/foundation-pack')&&workflow.includes('/api/platform/regulatory/readiness')],
  ['governed maker import',workflow.includes('/api/platform/regulatory/foundation-pack/import')],
  ['csrf protected mutation',workflow.includes('X-CSRF-Token')&&workflow.includes('Origin: $APP_ORIGIN')],
  ['no source reviewer mutation',!workflow.includes('/api/platform/regulatory/sources/')],
  ['no rule reviewer mutation',!workflow.includes('/api/platform/regulatory/rules/')],
  ['no conflict reviewer mutation',!workflow.includes('/api/platform/regulatory/conflicts/')],
  ['no rollout reviewer mutation',!workflow.includes('/api/platform/regulatory/rollouts/')],
  ['no principal provisioning',!workflow.includes('platform_regulatory_principals')&&!workflow.includes('PLATFORM_REGULATORY_REVIEWERS')],
  ['no direct database mutation',!workflow.includes('wrangler d1')&&!workflow.includes('INSERT INTO')&&!workflow.includes('UPDATE regulatory_')&&!workflow.includes('DELETE FROM')],
  ['post import truth check',workflow.includes('current foundation pack does not have a completed import record')&&workflow.includes('maker import produced no regulatory sources')&&workflow.includes('maker import produced no regulatory rules')],
  ['auth cleanup',workflow.includes('Remove local authentication material')&&workflow.includes('/tmp/thebe-maker-csrf')&&workflow.includes('/tmp/thebe-maker-cookie-path')&&workflow.includes('/tmp/thebe-maker-login.json')]
];

const bad=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(bad.length)process.exit(1);
