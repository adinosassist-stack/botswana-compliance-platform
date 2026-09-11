import fs from 'node:fs';
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const previewApi=JSON.parse(fs.readFileSync(new URL('../preview/preview-api.json',import.meta.url),'utf8'));
const migration=fs.readFileSync(new URL('../cloudflare/migrations/028_v78_management_accountability_effectiveness.sql',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8');
const profile=JSON.parse(fs.readFileSync(new URL('../RELEASE_PROFILE.json',import.meta.url),'utf8'));
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const checks=[];const check=(n,v)=>checks.push([n,!!v]);const patch=Number(pkg.version.split('.')[2]||0);
const helper=worker.slice(worker.indexOf('// v78 1.21.35 — executive exception management.'),worker.indexOf('function structuredDailyOpsNarrative'));
const routes=worker.slice(worker.indexOf('if(url.pathname==="/api/executive-interventions"&&req.method==="POST"'),worker.indexOf('if(url.pathname==="/api/daily-brief"'));
const ui=html.slice(html.indexOf('<section class="card executive-exception-card'),html.indexOf('<details class="home-common-tools"'))+html.slice(html.indexOf('let executiveExceptionState='),html.indexOf('async function renderWorkHub(){'));

check('version 1.21.38+',pkg.version.startsWith('1.21.')&&patch>=38);
check('profile aligned',profile.package_version===pkg.version);
check('service worker aligned',sw.includes(pkg.version));
check('release chain preserves accountability gate after successor',pkg.scripts['test:release-regressions'].includes('node tests/v78-12138-management-accountability-effectiveness-adversarial.mjs')&&pkg.scripts['test:release-regressions'].indexOf('v78-12140-corrective-action-effectiveness-adversarial.mjs')<pkg.scripts['test:release-regressions'].indexOf('v78-12138-management-accountability-effectiveness-adversarial.mjs'));
check('dedicated script includes static gate',pkg.scripts['test:v78-12138'].includes('node tests/v78-12138-management-accountability-effectiveness-adversarial.mjs'));
check('dedicated script includes runtime gate',pkg.scripts['test:v78-12138'].includes('node tests/v78-12138-management-accountability-runtime.mjs'));
for(const k of ['management_accountability_effectiveness','intervention_accountability_server_backed','intervention_recovery_extensions_counted','intervention_blocked_episodes_counted','intervention_at_risk_episodes_counted','intervention_reopens_counted','intervention_missed_commitments_counted','intervention_accountability_leadership_only','intervention_accountability_intervention_level_only','intervention_accountability_no_employee_scoring','intervention_accountability_no_manager_ranking','intervention_accountability_no_disciplinary_inference','intervention_accountability_progressive_disclosure','intervention_accountability_no_second_notification_stream','intervention_accountability_fail_closed'])check(`profile ${k}`,profile[k]===true);
check('profile lookback 180',profile.intervention_accountability_lookback_days===180);

// Migration and fresh schema.
for(const x of ['recovery_extension_count INTEGER NOT NULL DEFAULT 0','blocked_checkpoint_count INTEGER NOT NULL DEFAULT 0','at_risk_checkpoint_count INTEGER NOT NULL DEFAULT 0','reopen_count INTEGER NOT NULL DEFAULT 0','missed_recovery_count INTEGER NOT NULL DEFAULT 0','last_missed_recovery_due_at TEXT','last_recovery_extended_at TEXT','executive_exception_interventions_accountability_idx'])check(`migration ${x}`,migration.includes(x));
for(const x of ['CHECK(recovery_extension_count>=0)','CHECK(blocked_checkpoint_count>=0)','CHECK(at_risk_checkpoint_count>=0)','CHECK(reopen_count>=0)','CHECK(missed_recovery_count>=0)'])check(`migration nonnegative ${x}`,migration.includes(x));
check('migration tenant index',migration.includes('ON executive_exception_interventions(tenant_id,updated_at,recovery_extension_count,blocked_checkpoint_count,reopen_count,missed_recovery_count)'));
for(const x of ['recovery_extension_count INTEGER NOT NULL DEFAULT 0','blocked_checkpoint_count INTEGER NOT NULL DEFAULT 0','at_risk_checkpoint_count INTEGER NOT NULL DEFAULT 0','reopen_count INTEGER NOT NULL DEFAULT 0','missed_recovery_count INTEGER NOT NULL DEFAULT 0','last_missed_recovery_due_at TEXT','last_recovery_extended_at TEXT','executive_exception_interventions_accountability_idx'])check(`fresh schema ${x}`,schema.includes(x));
check('schema preserves progress actor deletion safety',schema.includes('FOREIGN KEY(progress_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL'));
check('schema preserves tenant cascade',schema.includes('FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'));

// Accountability engine is intervention-level, not people scoring.
check('accountability helper exists',helper.includes('function executiveInterventionAccountability(row)'));
check('accountability rows helper exists',helper.includes('async function executiveInterventionAccountabilityRows(env,tenantId)'));
check('extension counter read',helper.includes('row.recovery_extension_count'));
check('blocked counter read',helper.includes('row.blocked_checkpoint_count'));
check('at risk counter read',helper.includes('row.at_risk_checkpoint_count'));
check('reopen counter read',helper.includes('row.reopen_count'));
check('missed counter read',helper.includes('row.missed_recovery_count'));
check('extensions threshold two',helper.includes('extensions>=2'));
check('blocks threshold two',helper.includes('blocked>=2'));
check('reopens threshold two',helper.includes('reopens>=2'));
check('missed threshold two',helper.includes('missed>=2'));
check('at risk threshold three',helper.includes('atRisk>=3'));
check('repeated extensions label',helper.includes('repeated_extensions'));
check('repeated blocks label',helper.includes('repeated_blocks'));
check('repeated reopens label',helper.includes('repeated_reopens'));
check('repeated missed label',helper.includes('repeated_missed_commitments'));
check('repeated at risk label',helper.includes('repeated_at_risk'));
check('missed or reopen critical',helper.includes('(missed>=2||reopens>=2)?"critical":"high"'));
check('accountability policy intervention-level',helper.includes('interventionLevelOnly:true'));
check('accountability policy no employee scoring',helper.includes('noEmployeeScoring:true'));
check('accountability policy no manager ranking',helper.includes('noManagerRanking:true'));
check('accountability policy no disciplinary inference',helper.includes('noDisciplinaryInference:true'));
check('accountability lookback 180 days',helper.includes("updated_at>=datetime('now','-180 day')"));
check('accountability query tenant scoped',helper.includes('WHERE i.tenant_id=? AND i.updated_at'));
check('accountability query repeat thresholds',helper.includes('i.recovery_extension_count>=2 OR i.blocked_checkpoint_count>=2 OR i.at_risk_checkpoint_count>=3 OR i.reopen_count>=2 OR i.missed_recovery_count>=2'));
check('accountability query limited',helper.includes('ORDER BY i.updated_at DESC LIMIT 25'));
check('accountability rows exclude emails',!helper.match(/executiveInterventionAccountabilityRows[\s\S]{0,1200}\bemail\b/));
check('owner display name only',helper.includes("COALESCE(u.display_name,i.owner_name_snapshot,'Recorded management owner') owner_name"));

// Deadline extension tracking.
check('existing intervention fetches old deadline',routes.includes('SELECT id,recovery_due_at,recovery_extension_count,missed_recovery_count,last_missed_recovery_due_at FROM executive_exception_interventions'));
check('extension compares old deadline',routes.includes('priorDueMs=Date.parse(String(existing.recovery_due_at||""))'));
check('extension requires later date',routes.includes('dueMs>priorDueMs'));
check('extension counter increments conditionally',routes.includes('recovery_extension_count=recovery_extension_count+?'));
check('extension timestamp conditional',routes.includes('last_recovery_extended_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP'));
check('non-extension does not increment',routes.includes('recoveryExtended?1:0'));
check('audit records prior deadline',routes.includes('priorRecoveryDueAt:existing.recovery_due_at||null'));
check('audit records extension bool',routes.includes('recoveryExtended,recoveryExtensionCount'));
check('extension route detects already missed prior target',routes.includes('priorRecoveryMissed=Number.isFinite(priorDueMs)&&priorDueMs<now'));
check('extension route dedupes prior missed target',routes.includes('existing.last_missed_recovery_due_at'));
check('extension route increments missed count when needed',routes.includes('missed_recovery_count=missed_recovery_count+?'));
check('extension route stores missed prior target',routes.includes('last_missed_recovery_due_at=CASE WHEN ?=1 THEN ? ELSE last_missed_recovery_due_at END'));
check('extension audit records missed prior commitment',routes.includes('priorRecoveryMissed,missedRecoveryCount'));
check('recovery remains management target',routes.includes('recoveryDeadlineDoesNotReplaceSourceDueDate:true'));
check('new intervention does not pre-count extension',routes.includes("VALUES(?,?,?,?,?,?,'claimed',?,?,?,?,?,?,CURRENT_TIMESTAMP)"));

// Blocked / at-risk episode tracking.
check('blocked entry detects transition',routes.includes('enteredBlocked=progressStatus==="blocked"&&String(row.progress_status||"not_started")!=="blocked"'));
check('at risk entry detects transition',routes.includes('enteredAtRisk=progressStatus==="at_risk"&&String(row.progress_status||"not_started")!=="at_risk"'));
check('blocked counter increments',routes.includes('blocked_checkpoint_count=blocked_checkpoint_count+?'));
check('at risk counter increments',routes.includes('at_risk_checkpoint_count=at_risk_checkpoint_count+?'));
check('blocked same-state not automatically repeated',routes.includes('enteredBlocked?1:0'));
check('at-risk same-state not automatically repeated',routes.includes('enteredAtRisk?1:0'));
check('progress audit records transition',routes.includes('enteredBlocked,enteredAtRisk'));
check('progress audit records blocked count',routes.includes('blockedCheckpointCount:Number(updated.blocked_checkpoint_count||0)'));
check('progress audit records at-risk count',routes.includes('atRiskCheckpointCount:Number(updated.at_risk_checkpoint_count||0)'));
check('progress remains routine no external alert',routes.includes('routineExternalNotificationCreated:false'));
check('progress API remains owner manager',routes.includes('roleAllowed(a,"owner","manager")'));
check('manager ownership guard preserved',routes.includes('intervention_owned_by_another_manager'));
check('progress cannot close ready-to-close',routes.includes('intervention_ready_to_close_use_closure'));

// Reopen tracking.
check('reopen increments durable count',helper.includes('reopen_count=reopen_count+1'));
check('system reopen also at-risk episode',helper.includes('at_risk_checkpoint_count=at_risk_checkpoint_count+1'));
check('reopen only from ready to close',helper.includes("WHERE id=? AND tenant_id=? AND status='ready_to_close'"));
check('reopen returns claimed',helper.includes("SET status='claimed'"));
check('reopen clears underlying clear marker',helper.includes('underlying_cleared_at=NULL'));
check('reopen writes system progress',helper.includes('Underlying leadership exception reappeared after it had cleared.'));
check('reopen audit event',helper.includes('EXECUTIVE_INTERVENTION_REOPENED'));
check('reopen audit records count',helper.includes('reopenCount:row.reopen_count'));
check('reopen audit system detected',helper.includes('systemDetected:true'));

// Missed commitment counting exactly once per distinct target.
check('miss only active open/claimed',helper.includes('["open","claimed"].includes(String(row.status))'));
check('miss requires due in past',helper.includes('dueMs<Date.now()'));
check('miss compares recorded target',helper.includes('String(row.last_missed_recovery_due_at||"")!==String(row.recovery_due_at||"")'));
check('miss increments count',helper.includes('missed_recovery_count=missed_recovery_count+1'));
check('miss stores target',helper.includes('last_missed_recovery_due_at=recovery_due_at'));
check('miss SQL dedupe null/different',helper.includes('(last_missed_recovery_due_at IS NULL OR last_missed_recovery_due_at<>recovery_due_at)'));
check('miss local count update',helper.includes('row.missed_recovery_count=Number(row.missed_recovery_count||0)+1'));
check('miss audit event',helper.includes('EXECUTIVE_INTERVENTION_RECOVERY_MISSED'));
check('miss audit records due',helper.includes('recoveryDueAt:row.recovery_due_at'));
check('miss audit accountability-only label',helper.includes('accountabilitySignalOnly:true'));
check('extended future commitment can later count separately',helper.includes('last_missed_recovery_due_at')&&routes.includes('recovery_due_at=?'));

// Brief integration and counts.
check('accountability rows fetched after lifecycle processing',helper.indexOf('const accountabilityRows=await executiveInterventionAccountabilityRows')>helper.indexOf('for(const row of active)'));
check('accountability filters nulls',helper.includes('.map(executiveInterventionAccountability).filter(Boolean)'));
check('accountability severity sorting',helper.includes('executiveExceptionSeverityRank(x.severity)-executiveExceptionSeverityRank(y.severity)'));
check('accountability max five',helper.includes('items:accountabilityItems.slice(0,5)'));
check('pattern count',helper.includes('patterns:accountabilityItems.length'));
check('critical pattern count',helper.includes('critical:accountabilityItems.filter(x=>x.severity==="critical").length'));
check('repeated extension count',helper.includes('repeatedExtensions:accountabilityItems.filter(x=>x.counts.extensions>=2).length'));
check('repeated block count',helper.includes('repeatedBlocks:accountabilityItems.filter(x=>x.counts.blocked>=2).length'));
check('repeated reopen count',helper.includes('repeatedReopens:accountabilityItems.filter(x=>x.counts.reopens>=2).length'));
check('repeated missed count',helper.includes('repeatedMissedCommitments:accountabilityItems.filter(x=>x.counts.missed>=2).length'));
check('brief returns accountability',helper.includes('items:items.slice(0,5),accountability,policy:'));
check('brief policy embedded',helper.includes('accountabilityPatternsEmbeddedInLeadershipQueue:true'));
check('brief policy no employee scoring',helper.includes('accountabilityNoEmployeeScoring:true'));
check('brief policy no manager ranking',helper.includes('accountabilityNoManagerRanking:true'));
check('existing exception max five preserved',helper.includes('items:items.slice(0,5)'));
check('existing followthrough no second stream preserved',helper.includes('noSecondNotificationStream:true'));
check('existing recovery deadline separation preserved',helper.includes('recoveryDeadlineDoesNotReplaceStatutoryDueDate:true'));
check('existing closure clear requirement preserved',helper.includes('closureRequiresUnderlyingClear:true'));

// View/history privacy and usefulness.
check('view exposes accountability counts',helper.includes('accountabilityCounts:{extensions:Number(row.recovery_extension_count||0)'));
check('view exposes blocked count',helper.includes('blocked:Number(row.blocked_checkpoint_count||0)'));
check('view exposes at risk count',helper.includes('atRisk:Number(row.at_risk_checkpoint_count||0)'));
check('view exposes reopen count',helper.includes('reopens:Number(row.reopen_count||0)'));
check('view exposes missed count',helper.includes('missed:Number(row.missed_recovery_count||0)'));
check('history selects extension count',routes.includes('i.recovery_extension_count'));
check('history selects blocked count',routes.includes('i.blocked_checkpoint_count'));
check('history selects at risk count',routes.includes('i.at_risk_checkpoint_count'));
check('history selects reopen count',routes.includes('i.reopen_count'));
check('history selects missed count',routes.includes('i.missed_recovery_count'));
check('history maps accountability',routes.includes('accountability:executiveInterventionAccountability(x)'));
check('history says intervention-level',routes.includes('accountabilityIsInterventionLevel:true'));
check('history says no employee scoring',routes.includes('noEmployeeScoring:true'));
check('history says no manager ranking',routes.includes('noManagerRanking:true'));
check('history still excludes emails',routes.includes('emailsExcluded:true'));
check('history query contains no email field',!routes.match(/SELECT i\.id,i\.exception_key[\s\S]{0,1100}\bu\.email\b/));
check('executive endpoints still owner manager',routes.match(/\/api\/executive-interventions[\s\S]*roleAllowed\(a,"owner","manager"\)/));

// UI progressive disclosure and fail closed.
check('accountability details present',ui.includes('id="executiveAccountabilityDetails"'));
check('accountability heading',ui.includes('Recurring execution patterns'));
check('accountability intervention-level explanation',ui.includes('intervention-level signals'));
check('UI explicitly no employee scores',ui.includes('not employee scores'));
check('UI explicitly no manager rankings',ui.includes('manager rankings'));
check('accountability count element',ui.includes('id="execAccountabilityCount"'));
check('accountability list element',ui.includes('id="executiveAccountabilityList"'));
check('progressive disclosure details tag',ui.includes('<details class="executive-accountability"'));
check('renderer reads accountability',ui.includes('accountability=r.accountability||{items:[],counts:{},policy:{}}'));
check('renderer sets pattern count',ui.includes('set("execAccountabilityCount",Number(accountability.counts?.patterns||0))'));
check('renderer displays owner context',ui.includes("x.ownerName||'Recorded management owner'"));
check('renderer displays pattern labels',ui.includes('p.label||p.kind||\'pattern\''));
check('renderer no score field',!ui.includes('accountabilityScore'));
check('renderer no rank field',!ui.includes('managerRank'));
check('empty pattern state not legal all clear',ui.includes('not an employee-performance score or a legal all-clear'));
check('empty state explains threshold',ui.includes('no intervention crossed the configured repeat-pattern thresholds'));
check('empty state lookback 180',ui.includes('180-day lookback'));
check('accountability fail closed heading',ui.includes('Accountability pattern check unavailable'));
check('fail closed does not infer absence',ui.includes('Do not infer that recurring execution problems are absent.'));
check('main exception fail closed preserved',ui.includes('Do not assume overdue or high-risk exceptions are clear.'));
check('existing leadership role hide preserved',ui.includes('currentWorkspaceRole())'));
check('mobile accountability CSS',html.includes('@media(max-width:620px){.executive-accountability summary'));
check('no second accountability modal',!ui.includes('accountabilityModal'));
check('no accountability email/whatsapp action',!ui.match(/accountability[\s\S]{0,1600}(WhatsApp|sendEmail|mailto:)/i));

// Standalone preview demonstrates the feature without weakening production semantics. Fixtures are externalized in v1.21.47.
const preview=previewApi['/api/executive-exceptions']?.accountability||{};
const previewKinds=new Set((preview.items||[]).flatMap(x=>(x.patterns||[]).map(p=>p.kind)));
check('preview accountability object',preview.counts?.patterns===1);
check('preview repeated extensions',previewKinds.has('repeated_extensions'));
check('preview repeated blocks',previewKinds.has('repeated_blocks'));
check('preview repeated missed commitments',previewKinds.has('repeated_missed_commitments'));
check('preview no employee scoring',preview.policy?.noEmployeeScoring===true);
check('preview no manager ranking',preview.policy?.noManagerRanking===true);
check('preview intervention-level policy',preview.policy?.interventionLevelOnly===true);
check('preview no second notification stream',preview.policy?.noSecondNotificationStream===true);

// Existing safety boundaries remain obvious.
check('closure still server rechecks underlying exception',routes.includes('underlying_exception_still_open'));
check('closure attestation still required',routes.includes('closure_attestation_required'));
check('closure evidence still required',routes.includes('closure_evidence_required'));
check('closure note still required',routes.includes('closure_note_required'));
check('closure manager ownership guard',routes.includes('intervention_owned_by_another_manager'));
check('recovery max 90 days preserved',routes.includes('recovery_deadline_too_far'));
check('future recovery required',routes.includes('future_recovery_deadline_required'));
check('intervention attestation required',routes.includes('intervention_attestation_required'));
check('intervention note required',routes.includes('intervention_note_required'));
check('intervention owner eligibility required',routes.includes('intervention_owner_not_eligible'));
check('exception must remain open to intervene',routes.includes('exception_no_longer_open'));
check('no accountability notification enqueue',!helper.match(/executiveInterventionAccountability[\s\S]{0,3500}(notification_outbox|queueNotification|sendWhatsApp|sendEmail)/));
check('no poor-performance conclusion language',!helper.match(/poor performance|misconduct conclusion|disciplinary recommendation/i));

const failed=checks.filter(x=>!x[1]);for(const [n,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${n}`);console.log(`V78 1.21.38 Management accountability effectiveness adversarial: ${checks.length-failed.length}/${checks.length} PASS`);if(failed.length)process.exit(1);
