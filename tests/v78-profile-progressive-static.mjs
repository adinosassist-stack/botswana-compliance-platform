import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const checks=[]; const ok=(name,cond)=>{assert.ok(cond,name);checks.push(name)};
ok('release version 1.21.10',pkg.version.startsWith('1.21.')&&Number(pkg.version.split('.')[2]||0)>=20);
const profile=html.slice(html.indexOf('<section id="profile"'),html.indexOf('</section>',html.indexOf('<section id="profile"'))+10);
ok('profile renamed to plain-language Business details',profile.includes('<h2>Business details</h2>'));
ok('core business section exists',profile.includes('<h3>Core business</h3>'));
ok('applicability section exists',profile.includes('<h3>What applies to this business?</h3>'));
ok('optional context uses progressive disclosure',profile.includes('id="profileOptionalDetails"')&&profile.includes('Optional business context'));
ok('only three optional context fields stay user-editable there',profile.includes('id="pIncorporationDate"')&&profile.includes('id="pCitizenOwned"')&&profile.includes('id="pTurnover"'));
for(const id of ['pVatCategory','pTradeAnniversary','pCipaMonth','pCipaUin','pCipaStatus','pRegisteredOffice','pAnnualTaxableSupplies','pHighestMonthlyEmployeePay']){
  ok(`${id} retained only as hidden compatibility state`,profile.includes(`id="${id}" type="hidden"`));
}
ok('relevant detailed tools are rendered contextually',html.includes('function syncProfileProgressiveFields()')&&html.includes('id="profileRelevantTools"'));
for(const target of ['corporate','taxprofile','licenceos','manufacturing','privacy','tenderhub'])ok(`context route retained: ${target}`,html.includes(`add("${target}"`));
ok('profile save preserves specialist state instead of overwriting it',html.includes('const prior=state.profile||{},turnover=optionalNonNegativeNumber(pTurnover);')&&html.includes('const profile={...prior')&&html.includes('updateActiveCompany(c=>{c.profile=profile})')&&!html.includes('vatCategory:pVatCategory.value'));
ok('save remains on Business details with visible status',html.includes('showView("profile",{silent:true,skipDataRefresh:true})')&&html.includes('Changes applied. Workspace recalculated.'));
ok('preview reset is hidden in production',profile.includes('profile-preview-reset')&&html.includes('.profile-preview-reset{display:none!important}')&&html.includes('.standalone-preview .profile-preview-reset{display:inline-flex!important}'));
ok('manufacturing route fails closed without turnover',html.includes('if(!Number.isFinite(turnover)||turnover<=0)return "Set annual turnover to determine route"'));
ok('CIPA owner control uses authenticated workspace role',html.includes('const owner=currentWorkspaceRole()==="owner"')&&!html.includes('currentUser?.role||store.activeRole)==="owner"'));
ok('daily operations rendering does not fall back to stale stored role',html.includes('const role=currentWorkspaceRole();if(!["owner","manager"].includes(role))return;'));
ok('service worker cache bumped',sw.includes(`bw-business-protection-v78-${pkg.version}`));
console.log(`v78 progressive Business details: ${checks.length}/${checks.length} checks passed`);
