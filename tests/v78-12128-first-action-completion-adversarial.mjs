import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
const migration=fs.readFileSync('cloudflare/migrations/021_v78_first_action_completion.sql','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const profile=JSON.parse(fs.readFileSync('RELEASE_PROFILE.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const checks=[];const check=(name,ok)=>checks.push([name,!!ok]);
const patch=Number(pkg.version.split('.')[2]||0);

check('version 1.21.28+',pkg.version.startsWith('1.21.')&&patch>=28);
check('profile version aligned',profile.package_version===pkg.version);
check('service worker aligned',sw.includes(`bw-business-protection-v78-${pkg.version}`));
for(const k of [
 'first_action_completion_flow','obligation_action_context_server_backed','obligation_assignment_server_backed','obligation_assignment_owner_manager_only',
 'obligation_start_auto_assigns_if_unassigned','obligation_review_requires_mandatory_proof','obligation_completion_attestation_required','obligation_completion_audited',
 'obligation_completion_resolves_escalations','obligation_authoritative_deadline_preserved','obligation_reminders_deadline_backed','obligation_next_action_after_completion',
 'obligation_lifecycle_timestamps'
]) check(`profile flag ${k}`,profile[k]===true);

check('migration adds assigned user',migration.includes('ADD COLUMN assigned_user_id TEXT'));
check('migration adds assigned at',migration.includes('ADD COLUMN assigned_at TEXT'));
check('migration adds started at',migration.includes('ADD COLUMN started_at TEXT'));
check('migration adds review requested at',migration.includes('ADD COLUMN review_requested_at TEXT'));
check('migration adds completed at',migration.includes('ADD COLUMN completed_at TEXT'));
check('migration adds completed by',migration.includes('ADD COLUMN completed_by_user_id TEXT'));
check('migration adds completion note',migration.includes('ADD COLUMN completion_note TEXT'));
check('migration adds assignment index',migration.includes('compliance_obligations_assignment_idx'));
check('schema assigned user',schema.includes('assigned_user_id TEXT'));
check('schema started at',schema.includes('started_at TEXT'));
check('schema review timestamp',schema.includes('review_requested_at TEXT'));
check('schema completion timestamp',schema.includes('completed_at TEXT'));
check('schema completed by',schema.includes('completed_by_user_id TEXT'));
check('schema completion note',schema.includes('completion_note TEXT'));
check('schema assignment index',schema.includes('ON compliance_obligations(tenant_id,assigned_user_id,status,due_at)'));

check('workflow card exists',html.includes('id="proofActionWorkflow"'));
check('workflow steps exists',html.includes('id="proofActionSteps"'));
check('owner region exists',html.includes('id="proofActionOwner"'));
check('deadline region exists',html.includes('id="proofActionDeadline"'));
check('reminder region exists',html.includes('id="proofActionReminder"'));
check('stage region exists',html.includes('id="proofActionStage"'));
check('escalation region exists',html.includes('id="proofActionEscalation"'));
check('completion controls exist',html.includes('id="proofCompletionControls"'));
check('completion attestation exists',html.includes('id="proofCompletionAttest"'));
check('completion note exists',html.includes('id="proofCompletionNote"'));
check('next state exists',html.includes('id="proofActionNextState"'));
check('next action button exists',html.includes('id="proofNextAfterCompleteBtn"'));
check('workflow css responsive',html.includes('@media(max-width:720px){.action-workflow-steps{grid-template-columns:1fr 1fr}'));
check('workflow four stages',html.includes('labels=["Open","In progress","Review","Complete"]'));
check('authoritative deadline no invention',html.includes('Not recorded — confirm the authoritative source'));
check('missing deadline reminder warning',html.includes('Automatic due-date reminders are not reliable until a deadline is confirmed.'));
check('deadline reminder explanation',html.includes('Automatic reminders follow this recorded deadline'));
check('open escalation surfaced',html.includes('openEscalation'));
check('owner assignment select label',html.includes('aria-label="Action owner"'));
check('assignment owner manager client guard',html.includes('["owner","manager"].includes(currentWorkspaceRole())'));
check('reviewer sees assignment disabled',html.includes("canAssign&&!['completed','not_applicable'].includes(ob.status)"));
check('open tells start behavior',html.includes('Start the action to record ownership and work begun.'));
check('proof can happen in progress',html.includes('You can add proof while it is in progress.'));
check('in progress proof gap next state',html.includes('mandatory proof gap'));
check('review copy explicit',html.includes('Review stage: confirm the completion statement') || html.includes('Review stage: the source action is locked from direct approval. Open the management review inbox for a named, attested approve/return decision.'));
check('completion copy audit',html.includes('Action completed. Its completion record remains auditable.'));
check('recurring future obligations preserved',html.includes('recurring future obligations are not closed by this completion'));
check('completion attestation copy',html.includes('I confirm this action has been completed and the required proof has been reviewed.'));
check('upload never completes copy',html.includes('Uploading a file never completes the action by itself.'));

check('action context endpoint client used',html.includes('/action-context`'));
check('proof and workflow loaded together',html.includes('Promise.all([apiJson(`/api/obligations/${encodeURIComponent(id)}/proof-context`),apiJson(`/api/obligations/${encodeURIComponent(id)}/action-context`)]'));
check('assignment endpoint client used',html.includes('/assign`,{method:"POST"'));
check('assignment status audit copy',html.includes('Action owner updated and recorded in the audit trail.'));
check('open advancement allowed before proof check',html.includes('if((next==="review"||next==="completed")&&open.length)') || html.includes('if(next==="review"&&open.length)'));
check('blocked can resume',html.includes('ob.status==="blocked"?"in_progress"'));
check('review requires proof client',html.includes('Mandatory proof is still incomplete. Start the action first'));
check('completion requires checkbox client',html.includes('Confirm the completion statement before recording this action as complete.') || html.includes('Confirm the review attestation before recording the decision.'));
check('completion sends attestation',html.includes('attestation:next==="completed"?true:undefined') || html.includes('body:JSON.stringify({decision:p.decision,note,attestation:true})'));
check('completion sends note',html.includes('completionNote:next==="completed"') || html.includes('body:JSON.stringify({decision:p.decision,note,attestation:true})'));
check('completion reloads proof context',html.includes('apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/proof-context`)'));
check('completion reloads action context',html.includes('apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/action-context`)'));
check('completion refreshes action queue',html.includes('renderUnifiedNextActions()'));
check('completion shows next action',html.includes('showNextActionAfterCompletion'));
check('next action server backed',html.includes('const r=await apiJson("/api/next-actions")'));
check('next action excludes completed id',html.includes('String(x.id)!==String(completedId)'));
check('no next action not all clear',html.includes('This is not a legal all-clear'));
check('next regulatory reopens workflow',html.includes('if(next.source==="regulatory")openActionProof("regulatory",next.id)'));

check('home regulatory work button',html.includes('${proofDirect?"Add proof":"Work action"}'));
check('first value regulatory work button',html.includes('class="btn proof-direct"')&&html.includes('"Work action"'));
check('obligation list shows owner',html.includes(' · owner ${escapeHtml(x.assigned_name)}'));
check('obligation list shows unassigned',html.includes(' · unassigned'));
check('obligation list missing deadline explicit',html.includes(' · deadline not confirmed'));
check('obligation list unified workflow button',html.includes('"Review & complete"') || html.includes('x.status==="review"?"Review decision":"Continue"'));
check('old one click complete removed',!html.includes("data-bw-onclick=\"advanceObligation('${x.id}','completed')\">Complete"));

check('restricted read allows action context',worker.includes('/(evidence|proof-context|action-context)$/.test(path)'));
check('action context route exists',worker.includes('/action-context$/)&&req.method==="GET"'));
check('action context tenant scopes obligation',worker.includes('WHERE o.id=? AND o.tenant_id=? LIMIT 1'));
check('action context eligible roles',worker.includes("m.role IN ('owner','manager','reviewer')"));
check('action context active memberships only',worker.includes("m.status='active'"));
check('assignee directory owner manager only',worker.includes("? IN ('owner','manager')")&&worker.includes('.bind(a.tenant_id,a.role).all()'));
check('action context reminder state',worker.includes('FROM obligation_reminder_state WHERE obligation_id=? AND tenant_id=? LIMIT 1'));
check('action context escalations tenant scoped',worker.includes('FROM obligation_escalations WHERE obligation_id=? AND tenant_id=?'));
check('action context proof summary',worker.includes('missingProof:Math.max(0,mandatory-verified)'));
check('action context stale proof guarded',worker.includes("e.review_status='approved' AND e.scan_status='clean' AND e.scanned_at IS NOT NULL"));
check('action context expiry guarded',worker.includes("e.valid_until IS NULL OR date(e.valid_until)>=date('now')"));

check('assign route exists',worker.includes('/assign$/)&&req.method==="POST"'));
check('assign server owner manager only',worker.includes('if(!roleAllowed(a,"owner","manager"))return json({error:"forbidden"},403);'));
check('assign closed action locked',worker.includes('closed_obligation_assignment_locked'));
check('assign eligible roles only',worker.includes("m.role IN ('owner','manager','reviewer') LIMIT 1"));
check('assign tenant scoped member',worker.includes('m.tenant_id=? AND m.user_id=?'));
check('assign writes timestamp',worker.includes('assigned_at=CURRENT_TIMESTAMP'));
check('assign audit event',worker.includes('OBLIGATION_ASSIGNED'));

check('advance server role bounded',worker.includes('if(!roleAllowed(a,"owner","manager","reviewer"))return json({error:"forbidden"},403);'));
check('advance state machine retained',worker.includes('const allowed={open:["in_progress","not_applicable","blocked"],in_progress:["review","blocked"],review:["completed","blocked"],blocked:["in_progress"]'));
check('superseded completion blocked',worker.includes('superseded_obligation_cannot_complete'));
check('proof gate review and completion',worker.includes('if(next==="review"||next==="completed"){const missing=await proofGate()'));
check('proof gate remains strict',worker.includes('mandatory_evidence_incomplete'));
check('proof gate scan clean',worker.includes("e.scan_status!='clean'"));
check('proof gate scanned attestation',worker.includes('e.scanned_at IS NULL'));
check('proof gate malware null',worker.includes('e.malware_name IS NOT NULL'));
check('proof gate expiry current',worker.includes("date(e.valid_until)<date('now')"));
check('completion attestation server required',worker.includes('completion_attestation_required') || (worker.includes('review_attestation_required') && worker.includes('use_management_review_inbox')));
check('completion note bounded',worker.includes('.trim().slice(0,500)'));
check('start auto assigns current user',worker.includes('assigned_user_id=COALESCE(assigned_user_id,?)'));
check('start records assignment timestamp',worker.includes('assigned_at=COALESCE(assigned_at,CURRENT_TIMESTAMP)'));
check('start records started timestamp',worker.includes('started_at=COALESCE(started_at,CURRENT_TIMESTAMP)'));
check('review records timestamp',worker.includes("review_requested_at=CURRENT_TIMESTAMP"));
check('complete records timestamp',worker.includes("completed_at=CURRENT_TIMESTAMP"));
check('complete records actor',worker.includes('completed_by_user_id=?'));
check('complete stores note',worker.includes('completion_note=?'));
check('complete resolves escalations',worker.includes("UPDATE obligation_escalations SET status='resolved',resolved_at=CURRENT_TIMESTAMP"));
check('state transition audited',worker.includes('OBLIGATION_STATE_CHANGED'));
check('completion audit includes attestation',worker.includes('attested:next==="completed"?true:undefined')||worker.includes('attested:["completed","not_applicable"].includes(next)?true:undefined'));
check('completion does not edit due date',!worker.match(/advance[\s\S]{0,5000}UPDATE compliance_obligations SET due_at=/));
check('obligation list exposes lifecycle fields',worker.includes('o.started_at,o.review_requested_at,o.completed_at,o.completed_by_user_id,o.completion_note'));
check('obligation list joins assignee',worker.includes('LEFT JOIN users au ON au.id=o.assigned_user_id'));
check('read-only action output does not expose assignee email',!worker.includes('assigned_name,au.email assigned_email FROM compliance_obligations'));

check('auditor mutation still globally denied',worker.includes('if(r==="auditor")return false;'));
check('reviewer advance remains explicit allowlist',worker.includes('/^\\/api\\/obligations\\/[^/]+\\/advance$/.test(path))return true;'));
check('reviewer assignment not allowlisted',!worker.includes('/^\\/api\\/obligations\\/[^/]+\\/assign$/.test(path))return true;'));
check('employee reporter not workflow role',!worker.includes('m.role IN (\'owner\',\'manager\',\'reviewer\',\'employee\')'));

const failed=checks.filter(x=>!x[1]);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
console.log(`V78 1.21.28 First-action completion adversarial: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);
