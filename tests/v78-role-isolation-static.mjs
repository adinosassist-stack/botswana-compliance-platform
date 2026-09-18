import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/server.js',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8');

const checks=[];
function ok(name,cond){assert.ok(cond,name);checks.push(name)}

ok('employee is not a normal workspace membership role', schema.includes("CHECK(role IN ('owner','manager','reviewer','auditor'))") && !schema.includes("CHECK(role IN ('owner','manager','reviewer','auditor','employee'))"));
ok('frontend recognizes only four workspace roles', html.includes('const WORKSPACE_ROLES=new Set(["owner","manager","reviewer","auditor"])'));
ok('employee reporter role is explicitly documented in UI', html.includes('<b>Employee / Reporter</b>') && html.includes('Own assigned daily-report form only'));
ok('unsupported role portal exists', html.includes('id="roleAccessPortal"') && html.includes('does not open the leadership workspace'));
ok('unsupported role stops before state fetch', html.indexOf('if(!isWorkspaceRole(currentUser?.role)){showRestrictedRolePortal') < html.indexOf('const st=await apiFetch("/api/state")'));
ok('unknown roles get zero workspace views', html.includes('if(r==="auditor")return new Set(AUDIT_ALLOWED);\n return new Set();'));
ok('reviewer cannot open leadership dashboard', html.includes('const REVIEW_ALLOWED=new Set([') && !html.match(/const REVIEW_ALLOWED=new Set\(\[[^\]]*"dashboard"/s));
ok('auditor cannot open leadership dashboard', html.includes('const AUDIT_ALLOWED=new Set([') && !html.match(/const AUDIT_ALLOWED=new Set\(\[[^\]]*"dashboard"/s));
ok('reviewer/auditor do not receive people performance views', !html.match(/const REVIEW_ALLOWED=new Set\(\[[^\]]*"dailyreports"/s) && !html.match(/const AUDIT_ALLOWED=new Set\(\[[^\]]*"dailyreports"/s) && !html.match(/const REVIEW_ALLOWED=new Set\(\[[^\]]*"employees"/s) && !html.match(/const AUDIT_ALLOWED=new Set\(\[[^\]]*"employees"/s));
ok('direct view calls are role guarded', html.includes('function showView(id,options={}){if(!roleCanView(id))'));
ok('reviewer/auditor land on work instead of leadership home', html.includes('if(role==="reviewer"||role==="auditor")return "workhub"'));
ok('billing loads only for owner', html.includes('if(currentWorkspaceRole()!=="owner"){billingInfo=null'));
ok('rendering is role scoped and hidden async modules do not fetch', html.includes('const run=(view,fn)=>{if(!roleCanView(view)||typeof fn!=="function")return;')&&html.includes('if(isAsync&&!target?.classList.contains("active"))return'));
ok('mobile navigation is filtered by the same role matrix', html.includes('function syncMobileRoleNav(role=currentWorkspaceRole())') && html.includes('btn.style.display=roleCanView(target,role)?"":"none"'));
ok('employee/restricted portal removes mobile workspace navigation', html.includes('concealWorkspaceShell();syncMobileRoleNav(role);')&&html.includes('function concealWorkspaceShell(){appShell.style.display="none";appShell.style.visibility="hidden"}'));
ok('employee reporter route removes mobile workspace navigation', html.includes('concealWorkspaceShell();syncMobileRoleNav("");const rolePortal=document.getElementById("roleAccessPortal")'));

ok('worker denies non-workspace session roles before tenant APIs', worker.includes('if(!workspaceSessionRole(a)&&!selfServiceApi(url.pathname,req.method))return json({error:"workspace_role_forbidden"},403)'));
ok('worker state is projected by role', worker.includes('state:projectWorkspaceStateForRole(raw,a.role)'));
ok('reviewer/auditor projection removes turnover and pay-sensitive fields', worker.includes('delete p.turnover;delete p.annualTaxableSupplies;delete p.highestMonthlyEmployeePay;'));
ok('reviewer/auditor projection removes employee/case/fixed-term lists', worker.includes('reviews,cases:[],employees:[],fixedTerms:[],privacy:{controls:{},activities:[]}'));
ok('employee register API is owner/manager only', /\/api\/employees"&&req\.method==="GET"\)\{\n\s*if\(!roleAllowed\(a,"owner","manager"\)\)/.test(worker));
ok('daily operations management remains owner/manager only', worker.includes('if(url.pathname==="/api/daily-reporting/dashboard"&&req.method==="GET"){\n        if(!roleAllowed(a,"owner","manager"))'));
ok('business protection score is leadership only', worker.includes('if(url.pathname==="/api/business-protection-score"&&req.method==="GET"){\n        if(!roleAllowed(a,"owner","manager"))'));
ok('billing status is owner only at worker', worker.includes('if(url.pathname==="/api/billing/status"&&req.method==="GET"){if(!roleAllowed(a,"owner"))'));
ok('entitlement/plan internals are owner only', worker.includes('if(url.pathname==="/api/entitlements"&&req.method==="GET"){\n        if(!roleAllowed(a,"owner"))'));
ok('AI credit ledger is owner/manager only', worker.includes('if(url.pathname==="/api/ai/credits"&&req.method==="GET"){\n        if(!roleAllowed(a,"owner","manager"))'));
ok('employee reporter access response is minimal', worker.includes('return json({employee:{name:access.full_name,roleTitle:access.role_title||""},location:{id:access.location_id,name:access.location_name,code:access.location_code||"",town:access.town||""},companyName:access.company_name,reportDate:gaboroneDate(),expiresAt:access.expires_at}'));
ok('employee reporter token is scoped to employee and location', worker.includes('JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id') && worker.includes('JOIN operating_locations l ON l.id=a.location_id AND l.tenant_id=a.tenant_id'));

ok('Node state endpoint is explicitly workspace-role gated', server.includes('app.get("/api/state",auth,roles("owner","manager","reviewer","auditor")'));
ok('Node state endpoint projects reviewer/auditor state', server.includes('state:projectWorkspaceStateForRole(q.rows[0]?.state||{},req.auth.role)'));
ok('Node billing status is owner only', server.includes('app.get("/api/billing/status",auth,roles("owner")'));

console.log(`v78 role isolation: ${checks.length}/${checks.length} checks passed`);
