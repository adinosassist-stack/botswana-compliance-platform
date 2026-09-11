import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const server=fs.readFileSync('server/server.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const profile=JSON.parse(fs.readFileSync('RELEASE_PROFILE.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const checks=[];const check=(name,ok)=>{checks.push([name,!!ok]);if(!ok)console.error('FAIL',name)};
const modal=html.slice(html.indexOf('id="onboardModal"')-20,html.indexOf('id="planAccessModal"')-20);
const onboardFns=html.slice(html.indexOf('let wizardStep=0;'),html.indexOf('\n\nfunction showSyncError'));
const profileSection=html.slice(html.indexOf('<section id="profile"'),html.indexOf('<div class="modal" id="onboardModal"'));
const taxFn=html.slice(html.indexOf('function renderTaxProfile(){'),html.indexOf('function saveTaxFacts(){'));
const licenceFn=html.slice(html.indexOf('async function renderLicences(){'),html.indexOf('function openLicenceEntry()',html.indexOf('async function renderLicences(){')));

const patch=Number(pkg.version.split('.')[2]||0);
check('release is 1.21.26 or later',pkg.version.startsWith('1.21.')&&patch>=26);
check('release profile follows package',profile.package_version===pkg.version);
check('service worker cache follows package',sw.includes(`bw-business-protection-v78-${pkg.version}`));
check('onboarding gate remains in regression chain',pkg.scripts['test:release-regressions'].includes('node tests/v78-12126-first-value-onboarding-adversarial.mjs'));
check('dedicated onboarding first-value script exposed',pkg.scripts['test:onboarding-first-value-v78']==='node tests/v78-12126-first-value-onboarding-adversarial.mjs');

check('quick start now says two short steps',modal.includes('2 short steps'));
check('quick start has exactly two visible wizard steps',(modal.match(/class="wizardstep(?: active)?"/g)||[]).length===2);
check('wizard step one is factual business identity',modal.includes('1. Tell us what the business is'));
check('wizard step two is factual activities',modal.includes('2. Tick what the business does today'));
check('wizard no longer asks PAYE obligation legal judgement',!modal.includes('PAYE obligations?'));
check('wizard no longer asks trade licence required legal judgement',!modal.includes('Trade licence / registration required?'));
check('wizard no longer asks VAT registration choice',!modal.includes('<label>VAT registered?</label>'));
check('company name is reused from registration',modal.includes('id="wName" type="hidden"')&&modal.includes('id="wizardCompanyNameDisplay"'));
check('legal entity remains required',modal.includes('id="wEntityType"'));
check('industry remains core fact',modal.includes('id="wIndustry"'));
check('employee count remains core fact',modal.includes('id="wEmployees"'));
check('town moved to optional details',modal.indexOf('Add optional details')<modal.indexOf('id="wTown"'));
check('incorporation date remains optional',modal.indexOf('Add optional details')<modal.indexOf('id="wIncorporationDate"'));
check('CIPA month remains optional',modal.indexOf('Add optional details')<modal.indexOf('id="wCipaMonth"'));
check('turnover remains optional',modal.indexOf('Add optional details')<modal.indexOf('id="wTurnover"'));
check('VAT category remains optional',modal.indexOf('Add optional details')<modal.indexOf('id="wVatCategory"'));
check('activity facts use simple checkboxes',modal.includes('id="wPremises" type="checkbox"')&&modal.includes('id="wManufacturing" type="checkbox"')&&modal.includes('id="wData" type="checkbox"')&&modal.includes('id="wTender" type="checkbox"'));
check('tax and licence quick-start values are hidden unknowns',modal.includes('id="wPaye" type="hidden" value="unknown"')&&modal.includes('id="wVat" type="hidden" value="unknown"')&&modal.includes('id="wTrade" type="hidden" value="unknown"'));
check('wizard progress denominator is two',onboardFns.includes('((wizardStep+1)/2*100)'));
check('wizard bound stops at one',onboardFns.includes('Math.min(1,wizardStep+dir)'));
check('final CTA promises first check',onboardFns.includes('wizardStep===1?"Show my first check":"Next"'));
check('legal entity validation fails closed',onboardFns.includes('select entity-specific work without guessing'));

check('blank VAT fact is unknown',html.includes('vat:false,vatStatus:"unknown"'));
check('blank PAYE fact is unknown',html.includes('paye:false,payeStatus:"unknown"'));
check('blank trade fact is unknown',html.includes('trade:false,tradeStatus:"unknown"'));
check('status helper preserves explicit unknown',html.includes('function confirmedStatus(profile,key)')&&html.includes('["true","false","unknown"].includes(raw)'));
check('status boolean only enables explicit true',html.includes('function statusBoolean(value){return String(value)==="true"}'));
check('save wizard persists VAT status separately',onboardFns.includes('vat:statusBoolean(vatStatus),vatStatus'));
check('save wizard persists PAYE status separately',onboardFns.includes('paye:statusBoolean(payeStatus),payeStatus'));
check('save wizard persists trade status separately',onboardFns.includes('trade:statusBoolean(tradeStatus),tradeStatus'));

check('profile VAT supports not confirmed',profileSection.includes('VAT registration status')&&profileSection.includes('<option value="unknown">Not confirmed</option>'));
check('profile PAYE supports not confirmed',profileSection.includes('PAYE registration status')&&profileSection.includes('<option value="unknown">Not confirmed</option>'));
check('profile licence supports not confirmed',profileSection.includes('Trade / business licence status')&&profileSection.includes('<option value="unknown">Not confirmed</option>'));
check('profile save writes VAT status',html.includes('vatStatus:pVat.value||"unknown"'));
check('profile save writes PAYE status',html.includes('payeStatus:pPaye.value||"unknown"'));
check('profile save writes trade status',html.includes('tradeStatus:pTrade.value||"unknown"'));
check('profile fill reads VAT status helper',html.includes('set("pVat",confirmedStatus(p,"vat"))'));
check('profile fill reads PAYE status helper',html.includes('set("pPaye",confirmedStatus(p,"paye"))'));
check('profile fill reads trade status helper',html.includes('set("pTrade",confirmedStatus(p,"trade"))'));

check('tax UI distinguishes VAT unknown',taxFn.includes('vatStatus==="unknown"?"Registration not confirmed"'));
check('tax UI distinguishes PAYE unknown',taxFn.includes('payeStatus==="unknown"?"Not confirmed"'));
check('tax UI refuses threshold inference',taxFn.includes('will not infer registration from turnover, employee count or disputed thresholds'));
check('tax summary prints not confirmed',taxFn.includes('payeStatus==="unknown"?"Not confirmed"')&&taxFn.includes('vatStatus==="unknown"?"Not confirmed"'));
check('licence UI distinguishes unknown',licenceFn.includes('confirmedStatus(state.profile,"trade")==="unknown"'));
check('licence UI refuses industry inference',licenceFn.includes('will not infer legal applicability from industry alone'));

check('workspace persistence helper exists',html.includes('async function persistWorkspaceState()'));
check('persistence updates state before PUT',html.includes('stageWorkspaceState();clearTimeout(saveTimer)'));
check('persistence sends current version',html.includes('JSON.stringify({state:persisted,version:serverStateVersion})'));
check('persistence updates server version',html.includes('serverStateVersion=result.version||serverStateVersion'));
check('normal save still debounces',html.includes('saveTimer=setTimeout(()=>persistWorkspaceState()'));
check('onboarding awaits authoritative state persistence',onboardFns.indexOf('await persistWorkspaceState();')<onboardFns.indexOf('await apiJson("/api/account/onboarding/complete"'));
check('onboarding does not swallow completion failure',!onboardFns.includes('/api/account/onboarding/complete").catch'));
check('onboarding completion failure stays visible',onboardFns.includes('Your setup was not marked complete'));
check('wizard button disables while saving',onboardFns.includes('btn.disabled=true;btn.textContent="Saving…"'));

check('first value panel exists on Home',html.includes('id="firstValuePanel"'));
check('first value panel has action area',html.includes('id="firstValueActions"'));
check('first value panel has confirmation area',html.includes('id="firstValueConfirmations"'));
check('first value panel can retry',html.includes('data-bw-onclick="runFirstProtectionCheck()">Run check again</button>'));
check('first value top action has direct opener',html.includes('function openFirstValueTopAction()'));
check('first value result limits immediate actions to three',onboardFns.includes('rows.slice(0,3)'));
check('first value uses Home source routing',onboardFns.includes('HOME_ACTION_META[first.source]?.target'));
check('first value empty result is not all clear',onboardFns.includes('An empty action queue is not a legal all-clear'));
check('first value empty card repeats no all-clear boundary',onboardFns.includes('Do not treat this as all clear'));
check('first value unknown facts are confirmation tasks',onboardFns.includes('Unknown facts remain confirmation tasks, not compliance conclusions'));

check('first value flags VAT unknown',onboardFns.includes('confirmedStatus(p,"vat")==="unknown"'));
check('first value flags PAYE unknown only when employees exist',onboardFns.includes('Number(p.employees||0)>0&&confirmedStatus(p,"paye")==="unknown"'));
check('first value flags licence unknown',onboardFns.includes('confirmedStatus(p,"trade")==="unknown"'));
check('first value flags missing CIPA timing for registered entity',onboardFns.includes('["company","business_name"].includes(String(p.entityType||""))'));
check('PAYE unknown copy refuses headcount threshold inference',onboardFns.includes('will not infer it from headcount or salary thresholds'));
check('licence unknown copy refuses industry inference',onboardFns.includes('will not infer legal applicability from industry alone'));

check('first protection check is owner only in UI',onboardFns.includes('if(currentWorkspaceRole()!=="owner")return false'));
check('first protection check reads published server rules',onboardFns.includes('apiJson("/api/regulatory/rules")')&&onboardFns.includes('x.status==="published"'));
check('first protection check evaluates server rules',onboardFns.includes('/evaluate`'));
check('first protection check batches evaluations',onboardFns.includes('i+=4')&&onboardFns.includes('Promise.allSettled'));
check('first protection check recalculates statutory calendar',onboardFns.includes('apiJson("/api/statutory-calendar/recalculate"'));
check('first protection check reads authoritative next actions',onboardFns.includes('apiJson("/api/next-actions")'));
check('first protection check marks partial failure pending',onboardFns.includes('firstProtectionCheckStatus:failed?"pending":"complete"'));
check('successful first protection check timestamps completion',onboardFns.includes('firstProtectionCheckAt:failed?null:now'));
check('failed first protection check preserves pending state',onboardFns.includes('firstProtectionCheckStatus:"pending"'));
check('failed first check explicitly assumes no conclusion',onboardFns.includes('No compliance conclusion has been assumed'));
check('first check refreshes Home authoritative summaries',onboardFns.includes('renderUnifiedNextActions()')&&onboardFns.includes('renderHomeDecisionSignals()')&&onboardFns.includes('renderWorkHub()'));

check('completed setup with pending first check gets retry banner',html.includes('firstProtectionCheckStatus==="pending"')&&html.includes('Run first check'));
check('pending first check is resumed only for owner',html.includes('currentUser.role==="owner"&&currentUser.onboardingComplete===true&&state?.profile?.firstProtectionCheckStatus==="pending"'));
check('legacy completed users are not automatically forced into first check',!html.includes('currentUser.onboardingComplete===true&&state?.profile?.firstProtectionCheckStatus!=="complete"'));

check('Cloudflare completion route checks owner',worker.includes('if(url.pathname==="/api/account/onboarding/complete"&&req.method==="POST"){if(!roleAllowed(a,"owner"))return json({error:"forbidden"},403);'));
check('Cloudflare completion writes only current user',worker.includes('UPDATE users SET onboarding_complete=1 WHERE id=?'));
check('Cloudflare completion keeps server audit',worker.includes('writeAudit(env,a.tenant_id,a.user_id,"ONBOARDING_COMPLETED",{})'));
check('Node completion route exists',server.includes('app.post("/api/account/onboarding/complete", requireRole("owner")'));
check('Node completion is owner only',server.includes('requireRole("owner"), async (req,res,next)=>'));
check('Node completion writes only current user',server.includes('update users set onboarding_complete=true where id=$1'));
check('Node completion writes audit',server.includes('eventType:"ONBOARDING_COMPLETED"'));

check('auth registration copy promises small quick start',html.includes('Quick start asks only a few business facts before your first protection check.'));
check('registration still collects company name before quick start',html.includes('payload.companyName=authCompany.value.trim()'));
check('registration still preserves selected plan',html.includes('payload.plan=safeSessionGet("bwcos_selected_plan")'));
check('owner incomplete account still auto-opens onboarding',html.includes('currentUser.role==="owner"&&currentUser.onboardingComplete===false'));
check('non-owner still cannot open guided setup',onboardFns.includes('Only the account owner can complete initial business setup.'));

check('first-value panel collapses on narrower screens',html.includes('@media(max-width:760px){.first-value-grid{grid-template-columns:1fr}'));
check('onboarding fact cards collapse on mobile',html.includes('.onboarding-facts{grid-template-columns:1fr}'));
check('first-value mobile buttons become full width',html.includes('.first-value-actions .btn{width:100%}'));
check('first-value cards remain left aligned',html.includes('.first-value-list,.first-value-confirm{border:1px solid'));

check('release flag two-step onboarding',profile.first_value_onboarding_two_step===true);
check('release flag unknown-safe registration facts',profile.onboarding_registration_facts_unknown_safe===true);
check('release flag persistence before completion',profile.onboarding_persist_before_complete===true);
check('release flag owner-only completion',profile.onboarding_complete_owner_only===true);
check('release flag server-backed first check',profile.onboarding_first_protection_check_server_backed===true);
check('release flag retry state',profile.onboarding_first_check_retry_state===true);
check('release flag tri-state profile facts',profile.profile_tax_licence_unknown_state_preserved===true);
check('release flag Node Cloudflare parity',profile.node_cloudflare_onboarding_complete_parity===true);

const failed=checks.filter(x=>!x[1]);
console.log(`V78 1.21.26 first-value onboarding adversarial: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);
