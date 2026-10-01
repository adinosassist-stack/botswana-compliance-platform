import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const read=p=>fs.readFileSync(p,'utf8');
let pass=0;
const ok=(condition,message)=>{if(!condition)throw new Error(`FAIL: ${message}`);pass++;console.log('PASS',message)};
const brand='Thebe Desk';
const retired=/BW Business Protection(?: OS)?|BW Protection/;

const publicHome=read('public/home.html');
const authPortal=read('public/auth.html');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const worker=read('cloudflare/src/worker.js');
const server=read('server/server.js');
const sw=read('public/sw.js');
const profile=JSON.parse(read('RELEASE_PROFILE.json'));
const ownerCss=read('public/assets/owner-command-centre.css');
const workspaceCss=read('public/assets/workspace-inline-styles-20260929b.css');
const personalizationCss=read('public/assets/executive-personalization.css');
const personalizationJs=read('public/js/executive-personalization.js');
const bridgeCss=read('public/assets/business-data-bridge.css');
const bridgeJs=read('public/js/business-data-bridge.js');
const productionEntry=read('cloudflare/src/production-entry.js');

ok(publicHome.includes(`<title>${brand} | AI Operating Layer for African Business</title>`) && publicHome.includes(`property="og:site_name" content="${brand}"`),'public home title and Open Graph site identity use Africa-ready Thebe Desk positioning');
ok(/class="brand"[^>]*>[\s\S]*?>Thebe Desk<\/span>/.test(publicHome) && authPortal.includes('aria-label="Thebe Desk"') && /class="brand"[^>]*>[\s\S]*?>Thebe Desk<\/span>/.test(authPortal),'public and authentication surfaces use Thebe Desk');
ok(authPortal.includes('← Back to public site') && authPortal.includes('Open your Thebe Desk workspace.'),'authentication handoff preserves clear Thebe Desk workspace identity');
ok(manifest.name===brand && manifest.short_name===brand,'PWA install identity is Thebe Desk');
ok(publicHome.includes('Live in Botswana · Namibia next'),'public brand preserves the locked Botswana-live Namibia-next rollout line');
ok(!publicHome.includes('South Africa next'),'public brand does not regress the Namibia-next rollout strategy');
ok(manifest.icons.every(x=>String(x.src).includes('thebe-desk-icon-')),'PWA manifest no longer advertises legacy-branded icon paths');
const historicalRecoveryCache=sw.includes('thebe-desk-')&&sw.includes('recovery-r1');
const retiredServiceWorker=sw.includes('LEGACY_CACHE_PREFIX="thebe-desk-"')&&sw.includes('self.registration.unregister()')&&!sw.includes('addEventListener("fetch"')&&!sw.includes('clients.openWindow');
ok(historicalRecoveryCache||retiredServiceWorker,'service-worker state is either rotated for recovery or safely retired for Thebe Desk without request interception/window creation');
ok(worker.includes(`Reset your ${brand} password`) && worker.includes(`${brand} | AI Operating Layer for African Business`),'Worker email and SEO surfaces use Africa-ready Thebe Desk positioning');
ok(server.includes(`Reset your ${brand} password`),'Node fallback email surface uses Thebe Desk');
ok(profile.product_name===brand && profile.final_public_brand===brand && profile.thebe_desk_brand_finalized===true,'release profile records Thebe Desk as final public brand');

const seoPages=[
 'public/cipa-compliance-botswana/index.html','public/burs-tax-compliance-botswana/index.html',
 'public/business-licences-botswana/index.html','public/employment-compliance-botswana/index.html',
 'public/tender-readiness-botswana/index.html','public/compliance-evidence-botswana/index.html','public/pricing/index.html'
];
ok(seoPages.every(p=>read(p).includes(brand) && !retired.test(read(p))),'all public SEO landing pages use the final brand');
ok(read('public/404.html').includes(brand) && !retired.test(read('public/404.html')),'404 experience uses the final brand');

const visibleFiles=['public/home.html','public/auth.html','public/404.html','public/manifest.webmanifest',...seoPages,'cloudflare/src/worker.js','server/server.js','.env.example','README.md'];
ok(visibleFiles.every(p=>!retired.test(read(p))), 'launch-visible text has no retired BW Business Protection brand');

const pngs=['public/assets/favicon-96.png','public/assets/apple-touch-icon.png','public/assets/thebe-desk-icon-192.png','public/assets/thebe-desk-icon-512.png'];
ok(pngs.every(p=>fs.existsSync(p) && fs.statSync(p).size>350),'Thebe Desk PWA/favicon artwork exists and is non-empty');
const hashes=pngs.map(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
ok(new Set(hashes).size===4,'brand artwork is independently rendered at each required size');

const publicTree=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.(?:html|js|json|webmanifest|md|txt)$/i.test(ent.name))publicTree.push(p)}}
walk('public');
ok(publicTree.every(p=>!retired.test(read(p))), 'entire public text tree is free of retired brand strings');

ok(!/\bTD\b/.test(manifest.name) && !/\bTD\b/.test(manifest.short_name),'public install name does not collapse the brand to a TD monogram');

// Workspace UX must preserve the live visual identity while using the current production-owned asset chain.
const finalBlueIndex=workspaceCss.lastIndexOf(':root{--accent:#0b66d6;--soft:#edf5ff;--sidebar:#0f172a;--sidebar2:#111827}');
const legacyGreenIndex=workspaceCss.lastIndexOf('--accent:#176b4f;');
ok(finalBlueIndex>legacyGreenIndex,'final workspace visual authority resolves to Thebe blue/navy after historical green rules');
const finalWorkspaceCss=workspaceCss.slice(finalBlueIndex);
ok(finalWorkspaceCss.includes('#appShell .brand:before{display:none!important;content:none!important}'),'final workspace authority suppresses the retired TD pseudo-logo');
ok(finalWorkspaceCss.includes('#appShell *{min-width:0}#appShell .view{overflow-x:clip}'),'final workspace authority preserves shrink-safe authenticated geometry');
ok(!ownerCss.includes('workspace-ui-ux-10.css'),'owner command centre has no runtime dependency on the retired workspace UX bundle');
ok(ownerCss.includes('#appShell .owner-action-index') && ownerCss.includes('background:#edf5ff!important') && ownerCss.includes('color:#0d5bc8!important'),'owner decision layer remains visually unified with the live blue workspace brand');
ok(workspaceCss.includes('@media(max-width:1000px)') && workspaceCss.includes('@media(prefers-reduced-motion:reduce)'),'active workspace stylesheet retains responsive and reduced-motion behavior');

ok(productionEntry.includes('WORKSPACE_STYLES_ASSET="/assets/workspace-inline-styles-20260929b.css"') && productionEntry.includes('WORKSPACE_REFERENCE_SHELL_V237_CSS_ASSET="/assets/workspace-reference-shell-v237.css"') && productionEntry.includes('WORKSPACE_HOME_COMMAND_V238_CSS_ASSET="/assets/workspace-home-command-v238.css"'),'production entry owns the current cache-safe workspace style chain');
const blueAuthorityCss=finalWorkspaceCss;
ok(finalBlueIndex>=0,'final blue brand authority is sourced from the active workspace stylesheet');
ok(blueAuthorityCss.includes(':root{--accent:#0b66d6;--soft:#edf5ff;--sidebar:#0f172a;--sidebar2:#111827}'),'final authority pins primary brand tokens to Thebe blue/navy rather than the temporary green palette');
ok(blueAuthorityCss.includes('.marketinggate .btn,.authgate .btn{background:#0b66d6;') && blueAuthorityCss.includes('.heroeyebrow,.featureicon,.recommended{background:#edf5ff;color:#0d5bc8}'),'marketing and registration fallback actions inherit Thebe blue');
ok(blueAuthorityCss.includes('#appShell .brand:before{display:none!important;content:none!important}'),'legacy TD pseudo-logo cannot leak into the restored workspace brand');
ok(publicHome.includes('name="theme-color" content="#0B66D6"') && publicHome.includes('--accent:#0b66d6;') && publicHome.includes('--accent2:#0d5bc8;'),'public homepage uses Thebe blue primary branding');
ok(!publicHome.includes('--green:#0f5f46;') && !publicHome.includes('--green2:#0a4c38;'),'public homepage does not retain the temporary green primary brand tokens');
ok(authPortal.includes('name="theme-color" content="#0B66D6"') && authPortal.includes('--accent:#0b66d6;') && authPortal.includes('linear-gradient(145deg,#0b66d6 0%,#0d3f88 100%)'),'authentication portal uses the same blue brand system');
ok(!authPortal.includes('--green:#0f5f46;') && !authPortal.includes('--green2:#0a4c38;'),'authentication portal does not retain the temporary green primary brand tokens');

// Executive Home Briefing must keep the decision path above supporting evidence and preserve the live brand.
ok(ownerCss.includes('content:"Today\'s executive briefing"') && ownerCss.includes('.owner-command-summary{order:1!important') && ownerCss.includes('.owner-signal-list{order:2!important') && ownerCss.includes('.owner-decision-grid{order:3!important'),'executive home brief preserves briefing -> signals -> decisions reading order');
ok(ownerCss.includes('.owner-source-note{order:4!important') && ownerCss.includes('.owner-sales-workspace{order:5!important') && ownerCss.includes('.owner-inputs{order:6!important'),'evidence, sales detail and assumptions remain supporting layers below the decision path');
ok(ownerCss.includes('.owner-signal[data-tone="risk"]{order:-2!important') && ownerCss.includes('.owner-action .btn{background:#0b66d6!important'),'risk signals sort first and primary owner actions use the live Thebe blue accent');
ok(!ownerCss.includes('#appShell .owner-action-index{background:#edf5f1') && !ownerCss.includes('#appShell .owner-command-centre{background:#111713'),'executive briefing does not introduce a green/charcoal workspace rebrand');

// Personalized daily priority and contextual onboarding must remain role-safe, derived and non-invasive.
ok(personalizationJs.includes('const RELEASE="20260929-v180"') && personalizationJs.includes('Management priority today') && personalizationJs.includes('Your priority today'),'personalization gives owner and manager role-aware daily-priority framing');
ok(personalizationJs.includes('#ownerActionPanel .owner-action-list .owner-action') && personalizationJs.includes('action.sourceButton.click()'),'daily priority is derived from the existing evidence-ranked recommendation instead of inventing a parallel decision engine');
ok(personalizationJs.includes('isOwner()&&revenueText.includes("no monthly target projection yet")') && personalizationJs.includes('isOwner()&&cashText.includes("Not configured")') && personalizationJs.includes('isOwner()&&labourText.includes("Not configured")'),'owner-only financial onboarding stays gated to the owner role');
ok(personalizationJs.includes('revenueText.includes("needs more reporting history")') && personalizationJs.includes('salesText.includes("Record enough resolved quotations")'),'contextual onboarding focuses on missing reporting or sales evidence when those capabilities are not decision-ready');
ok(!personalizationJs.includes('/api/state') && !personalizationJs.includes('fetch(') && !personalizationJs.includes('localStorage'),'personalization does not create a second data-write path, direct network transport or persistent profiling store');
ok(personalizationCss.includes('background:#edf5ff') && personalizationCss.includes('color:#0d5bc8') && !personalizationCss.includes('#176b4f') && !personalizationCss.includes('#111713'),'personalization preserves the live blue/white workspace brand without retired workspace variables');
ok(personalizationCss.includes('.executive-personalized #ownerActionPanel .owner-action-list>.owner-action:first-child') && personalizationCss.includes('.owner-action-panel-exhausted'),'promoted top priority is not duplicated in the remaining recommendation list');
ok(productionEntry.includes('OWNER_COMMAND_CENTRE_RELEASE="20261001-workspace-cleanup-v237"') && productionEntry.includes('EXECUTIVE_PERSONALIZATION_RELEASE="20261001-workspace-cleanup-v237"'),'production entry rotates the owner-brief and personalization cache versions together after workspace cleanup');
ok(productionEntry.includes('/assets/executive-personalization.css') && productionEntry.includes('/js/executive-personalization.js') && productionEntry.includes('x-thebe-executive-personalization'),'production HTML injects and identifies the personalization assets');

// Business data bridge must make real SME data easier to ingest without bypassing tenant state, role or provenance controls.
let bridgeParses=true;try{new Function(bridgeJs)}catch{bridgeParses=false}
ok(bridgeParses,'business data bridge browser asset parses');
ok(bridgeJs.includes('const MAX_FILE_BYTES=1024*1024') && bridgeJs.includes('const MAX_ROWS=500'),'CSV ingestion is bounded by explicit file-size and row limits');
ok(bridgeJs.includes('file.text()') && bridgeJs.includes('Preview ready. Nothing has been saved yet.') && bridgeJs.includes('Apply import'),'raw CSV is previewed locally before an explicit apply action');
ok(bridgeJs.includes('global.apiJson') && bridgeJs.includes('request("/api/state")') && bridgeJs.includes('version:envelope.version'),'imports use the centralized same-origin API transport and optimistic state versioning');
ok(!bridgeJs.includes('fetch(') && !bridgeJs.includes('localStorage') && !bridgeJs.includes('sessionStorage') && !bridgeJs.includes('indexedDB'),'data bridge does not bypass API transport or create a browser persistence shadow store');
ok(!bridgeJs.includes('.innerHTML') && !bridgeJs.includes('.outerHTML'),'data bridge does not introduce unsafe HTML assignment');
ok(bridgeJs.includes('canImportSales=()=>["owner","manager"].includes(role())') && bridgeJs.includes('canImportFinance=()=>role()==="owner"'),'sales imports are owner/manager scoped while financial imports remain owner-only');
ok(bridgeJs.includes('Only the business owner can import financial assumptions.') && bridgeJs.includes('type==="financial"&&!canImportFinance()'),'financial import gating is enforced in both planning and execution paths');
ok(bridgeJs.includes('duplicate quotation reference/location/date') && bridgeJs.includes('duplicate campaign name') && bridgeJs.includes('contains more values than the header row'),'malformed and duplicate CSV records fail closed before mutation');
ok(bridgeJs.includes('importSource:"csv"') && bridgeJs.includes('importBatchId:batchId') && bridgeJs.includes('company.dataImports=history.slice(0,MAX_IMPORT_HISTORY)'),'imported commercial data carries bounded provenance and import history');
ok(bridgeJs.includes('existing record${plan.updates===1?" will":"s will"} be updated only after you explicitly apply this import.'),'existing-record updates are disclosed before apply rather than silently overwritten');
ok(bridgeJs.includes('setTimeout(()=>global.ThebeOwnerCommandCentre?.refresh?.(),80)'),'successful imports refresh the existing decision engine instead of creating a separate dashboard');
ok(bridgeCss.includes('background:#fff') && bridgeCss.includes('#0b66d6') && !bridgeCss.includes('#176b4f') && !bridgeCss.includes('#111713'),'business data bridge preserves the live blue/white visual identity');
ok(bridgeCss.includes('@media(max-width:760px)') && bridgeCss.includes('@media(prefers-reduced-motion:reduce)'),'business data bridge remains mobile responsive and reduced-motion safe');
ok(productionEntry.includes('BUSINESS_DATA_BRIDGE_RELEASE="20260913d"') && productionEntry.includes('/assets/business-data-bridge.css') && productionEntry.includes('/js/business-data-bridge.js') && productionEntry.includes('x-thebe-business-data-bridge'),'production entry cache-versions, injects and identifies the business data bridge assets');

console.log(`Thebe Desk final-brand adversarial gate: ${pass}/${pass} PASS`);