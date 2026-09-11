import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const previewApi=JSON.parse(fs.readFileSync('preview/preview-api.json','utf8'));
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const profile=JSON.parse(fs.readFileSync('RELEASE_PROFILE.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const checks=[];
const check=(name,ok)=>{checks.push([name,!!ok]);if(!ok)console.error('FAIL',name)};
const dashboard=html.slice(html.indexOf('<section id="dashboard"'),html.indexOf('<section id="workhub"'));
const unified=html.slice(html.indexOf('async function renderUnifiedNextActions(){'),html.indexOf('async function renderHomeDecisionSignals(){'));
const signals=html.slice(html.indexOf('async function renderHomeDecisionSignals(){'),html.indexOf('\n\n\nasync function renderPartnerPortal()'));

check('package is 1.21.25 or forward 1.21.x',pkg.version.startsWith('1.21.')&&Number(pkg.version.split('.')[2]||0)>=25);
check('release profile is 1.21.25 or forward 1.21.x',profile.package_version.startsWith('1.21.')&&Number(profile.package_version.split('.')[2]||0)>=25);
check('service worker cache is 1.21.25 or forward 1.21.x',/bw-business-protection-v78-1\.21\.(?:2[5-9]|[3-9]\d|\d{3,})/.test(sw));
check('Home gate remains in regression chain',pkg.scripts['test:release-regressions'].includes('node tests/v78-12125-home-decision-center-adversarial.mjs'));
check('dedicated Home test script exposed',pkg.scripts['test:home-v78']==='node tests/v78-12125-home-decision-center-adversarial.mjs');

check('live dashboard metadata names the workspace Home',html.includes('dashboard:["Home","Home","overview"]')&&html.includes('document.getElementById("pageTitle").textContent=meta?.[0]'));
check('static page-title semantic contract remains Dashboard before view resolution',html.includes('<h2 id="pageTitle">Dashboard</h2>'));
check('Home remains role landing for owner manager',html.includes('if(role==="owner"||role==="manager")return "dashboard"'));
check('reviewer still does not receive leadership Home',!html.match(/const REVIEW_ALLOWED=new Set\(\[[^\]]*"dashboard"/s));
check('auditor still does not receive leadership Home',!html.match(/const AUDIT_ALLOWED=new Set\(\[[^\]]*"dashboard"/s));
check('employee remains outside normal leadership workspace',html.includes('const WORKSPACE_ROLES=new Set(["owner","manager","reviewer","auditor"])'));

check('Home begins with decision centre',dashboard.includes('class="home-decision-center" id="homeDecisionCenter"'));
check('decision centre uses Today framing',dashboard.includes('<div class="section-eyebrow">Today</div>'));
check('decision centre promises exact-record routing',dashboard.includes('Open the exact record from here.'));
check('Home status strip is labelled',dashboard.includes('aria-label="Today\'s management status"'));
check('Home open work metric exists',dashboard.includes('id="homeActionCount"'));
check('Home high priority metric exists',dashboard.includes('id="homeHighPriorityCount"'));
check('Home next deadline metric exists',dashboard.includes('id="homeNextDeadline"'));
check('Home reporting coverage metric exists',dashboard.includes('id="homeOpsCoverage"'));
check('status chips route to work',dashboard.includes('data-bw-onclick="showView(\'workhub\')"><b id="homeActionCount"'));
check('deadline chip routes to calendar',dashboard.includes('data-bw-onclick="showView(\'calendar\')"><b id="homeNextDeadline"'));
check('reporting chip routes to daily reports',dashboard.includes('data-bw-onclick="showView(\'dailyreports\')"><b id="homeOpsCoverage"'));

check('priority queue is primary decision card',dashboard.includes('class="home-queue-card"')&&dashboard.includes('<div class="section-eyebrow">Do next</div>'));
check('priority queue retains unified action container',dashboard.includes('id="unifiedNextActions"'));
check('daily operations signal card exists',dashboard.includes('id="homeOpsCardValue"')&&dashboard.includes('<b>Daily reporting</b>'));
check('evidence readiness signal card exists',dashboard.includes('id="homeProofHealth"')&&dashboard.includes('<b>Evidence readiness</b>'));
check('daily operations card routes directly',dashboard.includes('class="home-signal-card" type="button" data-bw-onclick="showView(\'dailyreports\')"'));
check('proof card routes directly',dashboard.includes('class="home-signal-card" type="button" data-bw-onclick="showView(\'evidencehub\')"'));

check('old always-open quick-work rail removed',!dashboard.includes('class="workspace-quickbar" id="workspaceQuickbar"'));
check('common work is progressive disclosure',dashboard.includes('<details class="home-common-tools" id="workspaceQuickbar">'));
check('common work disclosure closed by default',!dashboard.match(/<details class="home-common-tools" id="workspaceQuickbar"[^>]*open/));
check('Add evidence remains reachable',dashboard.includes('data-bw-onclick="openAddEvidence()"')&&dashboard.includes('<span>Add evidence</span>'));
check('business change remains reachable',dashboard.includes("data-bw-onclick=\"showView('businessevents')\"")&&dashboard.includes('Record business change'));
check('daily reports remain reachable in common work',dashboard.includes("data-bw-onclick=\"showView('dailyreports')\"")&&dashboard.includes('<span>Daily reports</span>'));
check('deadlines remain reachable in common work',dashboard.includes("data-bw-onclick=\"showView('calendar')\"")&&dashboard.includes('<span>Check deadlines</span>'));
check('workflow hub remains reachable',dashboard.includes('<span>Open workflow hub</span>'));
check('compliance scan remains reachable but not primary',dashboard.includes('<span>Run compliance scan</span>'));
check('guided setup remains reachable but not primary',dashboard.includes('<span>Guided setup</span>'));
check('legacy workspace pulse contract preserved inside disclosure',dashboard.includes('id="workspacePulseActions"')&&dashboard.includes('id="workspacePulseAlerts"')&&dashboard.includes('id="workspacePulseSetup"'));

check('duplicate Next best action copy removed from Home',!dashboard.includes('Next best action'));
check('duplicate next action button removed from Home',!dashboard.includes('id="nextActionBtn"'));
check('analytics remain progressive disclosure',dashboard.includes('<details class="dashboard-details" id="dashboardDetailPanel">'));
check('analytics disclosure closed by default',!dashboard.match(/<details class="dashboard-details" id="dashboardDetailPanel"[^>]*open/));
check('setup meter remains available in analytics',dashboard.includes('id="setupPercent"')&&dashboard.includes('id="setupBar"'));
check('risk cockpit remains available one level deeper',dashboard.includes('Business risk cockpit'));
check('metric priority link routes to first server action',dashboard.includes('data-bw-onclick="openHomeFirstAction()">Review highest priority'));

check('source-to-view routing map exists',html.includes('const HOME_ACTION_META={'));
check('HR routes to employment cases',html.includes('hr:{target:"employer",label:"Open case"}'));
check('tender routes to tender workspace',html.includes('tender:{target:"tender",label:"Open tender"}'));
check('company action routes to company filing workspace',html.includes('company:{target:"companysecretary",label:"Open company action"}'));
check('licence routes to licence OS',html.includes('licence:{target:"licenceos",label:"Open licence"}'));
check('regulatory action routes to obligations',html.includes('regulatory:{target:"obligations",label:"Review obligation"}'));
check('risk action routes to protection engine',html.includes('risk:{target:"protectionengine",label:"Review risk"}'));
check('unknown action safely falls back to Work hub',html.includes('||{target:"workhub",label:"Open work"}'));
check('first action target defaults safely to Work hub',html.includes('let homeFirstActionTarget="workhub"'));

check('unified renderer uses authoritative next-actions API',unified.includes('apiJson("/api/next-actions")'));
check('unified renderer counts priority one actions',unified.includes('Number(x.priority)===1'));
check('unified renderer limits Home list to five',unified.includes('items.slice(0,5)'));
check('unified action title is escaped',unified.includes('escapeHtml(x.title)'));
check('unified action status is escaped',unified.includes('escapeHtml(x.status||"Open")'));
check('unified renderer adds direct Open buttons',unified.includes('data-bw-onclick="showView(\'${meta.target}\')"'));
check('empty queue is not described as legal all clear',unified.includes('an empty queue is not a legal all-clear'));
check('failed queue is visibly unavailable',unified.includes('Action status unavailable')&&unified.includes('before relying on the Home summary'));
check('failed queue provides retry',unified.includes('data-bw-onclick="renderUnifiedNextActions()"'));

check('Home signals use allSettled so one failed source does not blank everything',signals.includes('Promise.allSettled'));
check('Home deadline uses statutory calendar API',signals.includes('apiJson("/api/statutory-calendar")'));
check('Home reporting uses daily reporting dashboard API',signals.includes('apiJson(`/api/daily-reporting/dashboard?date=${encodeURIComponent(date)}`)'));
check('Home reporting uses Gaborone date helper',signals.includes('browserGaboroneDate'));
check('Home proof uses evidence-health API',signals.includes('apiJson("/api/evidence-health")'));
check('deadline failure is explicit',signals.includes('set("homeNextDeadline","Unavailable")'));
check('reporting failure warns before performance action',signals.includes('before acting on operational performance'));
check('proof failure warns before reliance',signals.includes('Evidence health could not be confirmed'));
check('proof detail reports missing evidence',signals.includes('missingRequired'));
check('proof detail reports expired evidence',signals.includes('expired'));
check('proof detail reports expiring evidence',signals.includes('expiring'));
check('proof detail reports quarantine state',signals.includes('quarantined'));
check('reporting detail reports missing reports',signals.includes('(d.missing||[]).length'));
check('reporting detail reports management flags',signals.includes('d.totals?.attention'));

check('next-actions API remains server owner manager only',worker.includes('if(url.pathname==="/api/next-actions"&&req.method==="GET"){\n        if(!roleAllowed(a,"owner","manager"))return json({error:"forbidden"},403);'));
check('daily reporting dashboard remains server owner manager only',worker.includes('if(url.pathname==="/api/daily-reporting/dashboard"&&req.method==="GET"){\n        if(!roleAllowed(a,"owner","manager"))return json({error:"forbidden"},403);'));
check('next-actions remains tenant scoped HR',worker.includes("FROM hr_cases WHERE tenant_id=?"));
check('next-actions remains tenant scoped tenders',worker.includes("FROM tender_items WHERE tenant_id=?"));
check('next-actions remains tenant scoped company actions',worker.includes("FROM company_actions WHERE tenant_id=?"));
check('next-actions remains tenant scoped licences',worker.includes("FROM licences WHERE tenant_id=?"));
check('next-actions remains tenant scoped obligations',worker.includes("FROM compliance_obligations WHERE tenant_id=?"));
check('next-actions remains tenant scoped risk events',worker.includes("FROM business_risk_events WHERE tenant_id=?"));

check('standalone preview has statutory calendar signal',Array.isArray(previewApi['/api/statutory-calendar']?.schedules)&&Array.isArray(previewApi['/api/statutory-calendar']?.obligations));
check('standalone preview has evidence health signal',previewApi['/api/evidence-health']?.healthScore===82);
check('standalone preview already has management reporting signal',previewApi['/api/daily-reporting/dashboard']?.coverage===88);
check('Home signal renderer registered in renderAll or superseded by daily brief',html.includes('renderUnifiedNextActions();renderHomeDecisionSignals()')||html.includes('renderDailyOperatingBrief()'));

check('Home desktop grid prioritizes queue over signal cards',html.includes('grid-template-columns:minmax(0,1.55fr) minmax(280px,.75fr)'));
check('Home status strip collapses at mobile',html.includes('@media(max-width:650px)')&&html.includes('.home-status-strip{grid-template-columns:1fr 1fr}'));
check('Home decision grid collapses below 1000px',html.includes('@media(max-width:1000px){.home-decision-grid{grid-template-columns:1fr}'));
check('Home action rows collapse on mobile',html.includes('.home-action-row{grid-template-columns:1fr;gap:7px}'));
check('Home cards remain left aligned',html.includes('.home-signal-card{appearance:none')&&html.includes('text-align:left'));
check('no blanket Home centering',!html.includes('.home-decision-center *{text-align:center'));
check('Home status chips have focus state',html.includes('.home-status-chip:hover,.home-status-chip:focus-visible'));
check('Home signal cards have focus state',html.includes('.home-signal-card:hover,.home-signal-card:focus-visible'));

check('release flag outcome-first Home',profile.home_decision_center_outcome_first===true);
check('release flag direct routing',profile.home_unified_action_direct_routing===true);
check('release flag reporting summary',profile.home_daily_reporting_authoritative_summary===true);
check('release flag evidence summary',profile.home_evidence_health_authoritative_summary===true);
check('release flag deadline summary',profile.home_statutory_next_deadline_authoritative_summary===true);
check('release flag common work disclosure',profile.home_common_work_progressive_disclosure===true);
check('release flag duplicate next action removed',profile.home_duplicate_next_action_removed===true);

const failed=checks.filter(x=>!x[1]);
console.log(`V78 1.21.25 Home decision centre adversarial: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);
