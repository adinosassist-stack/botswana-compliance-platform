const DEFAULT_COMPANY={
 id:"co_demo_1",
 profile:{name:"Kgetsi Trading (Pty) Ltd",incorporationDate:"2024-05-14",entityType:"company",industry:"Retail",employees:8,town:"Gaborone",vat:true,vatCategory:"C",paye:true,trade:true,data:true,tender:true,premises:true,tradeAnniversary:"2027-02-28",cipaMonth:"May",cipaUin:"BW00001234567",cipaStatus:"active",registeredOffice:"Gaborone",citizenOwned:true,turnover:1800000,annualTaxableSupplies:null,highestMonthlyEmployeePay:null,manufacturing:false,mfgActivity:"",mfgFactory:false,mfgAnniversary:""},
 evidence:[
  {id:"ev1",name:"Certificate of Incorporation",cat:"Corporate",date:"",verified:true},
  {id:"ev2",name:"2026 CIPA Annual Return Receipt",cat:"Corporate",date:"2027-05-31",verified:true},
  {id:"ev3",name:"Trade Licence / Registration Certificate",cat:"Licensing",date:"2027-02-28",verified:true},
  {id:"ev4",name:"Employee Contract Set",cat:"Employment",date:"2026-09-01",verified:true}
 ],
 completed:{"cipa":true,"contracts":true,"trade":true},
 cases:[],
 employees:[
  {id:"emp1",name:"Employee 001",role:"Sales Assistant",start:"2026-01-10",contract:true,asset:false},
  {id:"emp2",name:"Employee 002",role:"Supervisor",start:"2025-06-15",contract:true,asset:true}
 ],
 privacy:{
  controls:{inventory:false,notice:false,access:true,retention:false,incident:false,processor:false},
  activities:[]
 },
 reviews:[],
 fixedTerms:[
  {id:"ft_demo_1",employee:"Employee 003",start:"2025-08-01",end:"2026-10-31",justified:false}
 ]
};
const DEFAULT_STATE={activeCompanyId:"co_demo_1",activeRole:"owner",companies:[structuredClone(DEFAULT_COMPANY)],audit:[]};
function blankBusinessProfile(name="My Business"){
 return {name:String(name||"My Business").trim()||"My Business",incorporationDate:"",entityType:"",industry:"Other",employees:0,town:"",vat:false,vatStatus:"unknown",vatCategory:"",paye:false,payeStatus:"unknown",trade:false,tradeStatus:"unknown",data:false,tender:false,premises:false,tradeAnniversary:"",cipaMonth:"",cipaUin:"",cipaStatus:"",registeredOffice:"",citizenOwned:true,turnover:null,annualTaxableSupplies:null,highestMonthlyEmployeePay:null,manufacturing:false,mfgActivity:"",mfgFactory:false,mfgAnniversary:"",firstProtectionCheckStatus:"not_started",firstProtectionCheckAt:null};
}
function blankCompany(name="My Business"){
 return {id:`co_${globalThis.crypto?.randomUUID?.()||Date.now()}`,profile:blankBusinessProfile(name),evidence:[],completed:{},cases:[],employees:[],privacy:{controls:{},activities:[]},reviews:[],fixedTerms:[],bwReadiness:{}};
}
function blankWorkspaceState(name="My Business",role="owner"){
 const c=blankCompany(name);return {activeCompanyId:c.id,activeRole:String(role||"owner"),companies:[c],audit:[]};
}
function optionalNonNegativeNumber(input){const raw=String(input?.value??"").trim();if(raw==="")return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null}
function confirmedStatus(profile,key){const raw=String(profile?.[key+"Status"]||"").toLowerCase();if(["true","false","unknown"].includes(raw))return raw;return profile?.[key]===true?"true":profile?.[key]===false?"false":"unknown"}
function statusBoolean(value){return String(value)==="true"}
let store={activeCompanyId:null,activeRole:"",companies:[],audit:[]};
let state=null;
const workspaceStateStore=BW.state.createStore(store);
function syncWorkspaceRefs(){
  store=workspaceStateStore.getState();
  state=(store.companies||[]).find(c=>c.id===store.activeCompanyId)||(store.companies||[])[0]||null;
  return state;
}
function replaceWorkspaceStore(next){workspaceStateStore.replace(next||{activeCompanyId:null,activeRole:"",companies:[],audit:[]});return syncWorkspaceRefs()}
function updateWorkspaceStore(updater){workspaceStateStore.update(current=>updater(current));return syncWorkspaceRefs()}
function updateActiveCompany(mutator){
  if(!state)return null;
  const currentId=state.id,draft=structuredClone(state),result=mutator(draft),nextCompany=result&&result!==draft?result:draft;
  updateWorkspaceStore(root=>({...root,activeCompanyId:currentId,companies:(root.companies||[]).map(c=>c.id===currentId?nextCompany:c)}));
  return state;
}
function updateWorkspaceMeta(patch){updateWorkspaceStore(root=>({...root,...patch}));return store}
let csrfToken="";
let currentUser=null;
let platformRegulatoryAccess=false;
let authMode="login";let selectedPublicPlan="business";let billingInfo=null;
let serverStateVersion=1;
let saveTimer=null;
let cipaRegistryData=null;

const rules=[
 {id:"cipa",area:"Corporate",title:"Keep CIPA annual return current",risk:"High",authority:"CIPA",effectiveFrom:"2022-06-03",review:"Annual/source change",requiresExpert:false,
  applies:p=>true,status:()=>state.completed.cipa?"Compliant":"Action required",
  source:"CIPA annual return guidance",url:"https://www.cipa.co.bw/",why:"Companies have recurring annual-return obligations. Filing status and evidence should be monitored against the entity's actual due month."},
 {id:"constitution",area:"Corporate",title:"Maintain company constitution",risk:"High",authority:"CIPA / Companies Act",effectiveFrom:"2025-03-19",review:"On corporate change",requiresExpert:true,
  applies:p=>true,status:()=>state.evidence.some(e=>/constitution/i.test(e.name))?"Evidence present":"Action required",
  source:"CIPA OBRS Upgrade Public Notice",url:"https://www.cipa.co.bw/wp-content/uploads/2025/03/OBRS-Upgrade-Public-Notice-PDF.pdf",why:"CIPA's 2025 OBRS upgrade notice states that constitutions are mandatory for new and existing companies following the Companies Amendment Act, 2022."},
 {id:"beneficial_owner",area:"Corporate",title:"Maintain beneficial-owner declaration",risk:"High",authority:"CIPA / Companies Act / FIA framework",effectiveFrom:"2025-03-19",review:"On ownership/control change",requiresExpert:true,
  applies:p=>true,status:()=>state.evidence.some(e=>/beneficial owner|beneficial ownership/i.test(e.name))?"Evidence present":"Evidence to verify",
  source:"CIPA OBRS Upgrade Public Notice",url:"https://www.cipa.co.bw/wp-content/uploads/2025/03/OBRS-Upgrade-Public-Notice-PDF.pdf",why:"CIPA's upgraded OBRS requires new and existing companies to declare natural persons with ultimate ownership or control and the nature of their interest."},
 {id:"paye",area:"Tax",title:"PAYE payment and records",risk:"High",authority:"BURS",effectiveFrom:"current",review:"Monthly",requiresExpert:false,
  applies:p=>p.paye,status:()=>"Due monthly",
  source:"BURS Payments",url:"https://www.burs.org.bw/index.php/tax/payments",why:"PAYE is generally payable by the employer within 15 days after month-end."},
 {id:"vat",area:"Tax",title:"VAT return/payment cycle",risk:"High",authority:"BURS",effectiveFrom:"current",review:"Tax period",requiresExpert:false,
  applies:p=>p.vat,status:()=>"Active",
  source:"BURS Payments / Returns",url:"https://www.burs.org.bw/index.php/tax/payments",why:"VAT registered persons must meet the applicable tax-period filing and payment deadlines."},
 {id:"trade",area:"Licensing",title:"Maintain applicable trade licence / registration and annual fee",risk:"High",authority:"MTI / District Council",effectiveFrom:"2020-06-01",review:"Anniversary",requiresExpert:false,
  applies:p=>p.trade,status:()=>state.completed.trade?"Compliant":"Action required",
  source:"Botswana Trade eServices / Government guidance",url:"https://trade.gov.bw/Home/Applications?AppId=21&DeptId=10",why:"Current MTI guidance describes licences/registration certificates as valid indefinitely, with an annual fee of 25% of the licence/registration fee. The annual fee must be tracked against the applicable anniversary."},
 {id:"citizen_reserved",area:"Licensing",title:"Check citizen-reserved activity restriction",risk:"High",authority:"Government of Botswana",effectiveFrom:"current",review:"On activity/ownership change",requiresExpert:true,
  applies:p=>p.trade && !p.citizenOwned && ["Cleaning Services","Funeral / Memorial Services"].includes(p.industry),
  status:()=>"Professional review required",
  source:"Government of Botswana – Trade Licence Application",url:"https://www.gov.bw/trade/trade-license-application?page=0",why:"Some trade activities are reserved for citizens or wholly citizen-owned companies. Ownership and exact activity must be validated before licensing."},
 {id:"contracts",area:"Employment",title:"Review employee contracts and statutory employment records",risk:"High",authority:"Employment & Labour Relations",effectiveFrom:"2026-09-01",review:"On law/contract change",requiresExpert:true,
  applies:p=>p.employees>0,status:()=>state.completed.contracts?"Review due":"Action required",
  source:"Employment and Labour Relations Act 2025 / official Botswana sources",url:"https://elaws.gov.bw/",why:"Employment workflows must be mapped to the law in force on the relevant date. The 2025 Act is scheduled to commence on 1 September 2026."},
 {id:"fixed_term_12m",area:"Employment",title:"Review fixed-term contracts exceeding 12 months",risk:"High",authority:"Employment & Labour Relations",effectiveFrom:"2026-09-01",review:"On contract creation/renewal",requiresExpert:true,
  applies:p=>p.employees>0,status:()=>fixedTermFlags()>0?fixedTermFlags()+" contract(s) need review":"No flagged metadata",
  source:"Botswana Government / DailyNews – Employment Act implementation",url:"https://dailynews.gov.bw/news-detail/91734",why:"Government's June 2026 explanation states fixed-term contracts are limited to 12 months unless objectively justified. The platform flags duration/justification for review."},
 {id:"discipline",area:"Employment",title:"Maintain disciplinary and performance evidence",risk:"Medium",authority:"Employment controls",effectiveFrom:"2026-09-01",review:"Per case",requiresExpert:true,
  applies:p=>p.employees>0,status:()=>"3 evidence gaps",
  source:"Official Botswana employment law sources",url:"https://elaws.gov.bw/",why:"Consistent, dated evidence and fair process improve procedural defensibility in employment disputes."},
 {id:"data",area:"Data protection",title:"Assess personal-data handling and privacy controls",risk:"Medium",authority:"Data protection",effectiveFrom:"2025-01-14",review:"Quarterly/change",requiresExpert:true,
  applies:p=>p.data,status:()=>"Assessment due",
  source:"Botswana data-protection framework / official legal sources",url:"https://elaws.gov.bw/",why:"Businesses processing personal information should map data, purposes, access, security, retention and applicable legal duties."},
 {id:"tender",area:"Tender readiness",title:"Keep tender evidence pack current",risk:"Medium",authority:"Procurement / customer requirements",effectiveFrom:"current",review:"Per tender",requiresExpert:false,
  applies:p=>p.tender,status:()=>"2 documents to verify",
  source:"Botswana procurement readiness",url:"https://www.ppadb.co.bw/",why:"Up-to-date corporate, tax, licence, financial and capability evidence reduces tender submission failures."},
 {id:"industrial_licence",area:"Industrial / Manufacturing",title:"Industrial licence or registration route",risk:"High",authority:"Industrial Licensing Authority / Local Authority",effectiveFrom:"2020",review:"On startup/product/location/ownership change",requiresExpert:false,
  applies:p=>p.manufacturing,status:()=>p_mfg_status(),
  source:"Government of Botswana – Issuance of Industrial Licence",url:"https://www.gov.bw/trade/issuance-industrial-licence",why:"Manufacturing enterprises require the applicable industrial licence/registration before commencement. Processing route differs by annual turnover."},
 {id:"industrial_renewal",area:"Industrial / Manufacturing",title:"Industrial licence annual renewal / fee control",risk:"High",authority:"Industrial Licensing Authority",effectiveFrom:"current",review:"Annual",requiresExpert:false,
  applies:p=>p.manufacturing,status:()=>state.profile.mfgAnniversary?"Tracked":"Anniversary missing",
  source:"Government of Botswana – Issuance of Industrial Licence",url:"https://www.gov.bw/trade/issuance-industrial-licence",why:"Government guidance states industrial licences are renewed annually on or before the date of first issue."},
 {id:"factory_registration",area:"Occupational health & safety",title:"Assess factory registration requirement",risk:"High",authority:"Department of Occupational Health and Safety",effectiveFrom:"current",review:"Before operation/location change",requiresExpert:true,
  applies:p=>p.manufacturing && p.mfgFactory,status:()=>"Professional review required",
  source:"Government of Botswana – Factory Registration",url:"https://www.gov.bw/occupational-health-safety/factory-registration",why:"Certain premises where persons are regularly employed in manufacturing and related activities require registration before operation."},
 {id:"premises",area:"Licensing",title:"Maintain premises, zoning and health evidence where applicable",risk:"Medium",authority:"District Council / MTI",effectiveFrom:"2020-06-01",review:"On move/activity change",requiresExpert:false,
  applies:p=>p.trade && p.premises,status:()=>"Verify premises evidence",
  source:"Government of Botswana – Trade Licence Application",url:"https://www.gov.bw/trade/trade-license-application?page=0",why:"New trade applications can require proof of premises, zoning and environmental-health inspection records."}
];



const sourceConflicts=[
 {id:"vat_threshold",area:"Tax",topic:"Compulsory VAT registration threshold",severity:"High",
  sourceA:{label:"BURS Registration page",claim:"More than P1,000,000 taxable supplies per annum",url:"https://www.burs.org.bw/index.php/about-us/46-tax-articles/income-tax?Itemid=161&id=48&option=com_content&view=article"},
  sourceB:{label:"BURS VAT FAQ",claim:"Taxable supplies exceed P500,000 per annum",url:"https://www.burs.org.bw/index.php/about-us/faq/tax-faq/vat-faq"},
  handling:"Do not infer compulsory registration from turnover. Use confirmed taxpayer VAT status and queue threshold rule for professional/source-owner validation."},
 {id:"paye_threshold",area:"Tax",topic:"PAYE employee taxable threshold",severity:"Medium",
  sourceA:{label:"BURS Partnerships page",claim:"Above P3,000 per month",url:"https://www.burs.org.bw/index.php/tax/income-tax/partnerships"},
  sourceB:{label:"BURS PAYE page",claim:"Above P2,500 per month",url:"https://www.burs.org.bw/index.php/tax/income-tax/pay-as-you-earn"},
  handling:"Do not calculate employee tax liability from these web snippets. Use the current official tax tables/guidance for the tax year."}
];

const sourceRegistry=[
 {authority:"CIPA",domain:"cipa.co.bw / sesigo.cipa.co.bw",coverage:"Company registration, annual returns, constitutions, beneficial ownership, corporate records and available APIs",confidence:"Primary",review:"Monthly"},
 {authority:"BURS",domain:"burs.org.bw",coverage:"PAYE, VAT, tax payments/returns and taxpayer guidance",confidence:"Primary",review:"Monthly"},
 {authority:"Ministry of Trade & Entrepreneurship",domain:"trade.gov.bw / gov.bw",coverage:"Trade licensing, business registration, industrial licences, EDD",confidence:"Primary",review:"Monthly"},
 {authority:"Employment / e-Laws",domain:"elaws.gov.bw / gov.bw / dailynews.gov.bw",coverage:"Employment and Labour Relations Act, regulations, commencement and implementation guidance",confidence:"Primary / official government publication",review:"Daily during 2026 transition"},
 {authority:"Occupational Health & Safety",domain:"gov.bw",coverage:"Factory registration and workplace regulatory services",confidence:"Primary",review:"Quarterly"},
 {authority:"Procurement",domain:"ppadb.co.bw / procurement portals",coverage:"Procurement registration and tender requirements",confidence:"Primary/portal-specific",review:"Per tender"},
 {authority:"Data protection",domain:"gov.bw / official legal publications",coverage:"Data Protection Act and implementation guidance",confidence:"Primary",review:"On regulator guidance"}
];

const lawChanges=[
 {date:"2026-09-01",title:"Employment and Labour Relations Act commencement",impact:"High",text:"The latest government statement dated 19 August 2026 says the Employment and Labour Relations Act 2025 commences on 1 September 2026, with implementation regulations being finalised.",source:"DailyNews / Ministry of Labour and Home Affairs",url:"https://dailynews.gov.bw/news-detail/92813"},
 {date:"2026 transition",title:"Fixed-term contract duration control",impact:"High",text:"Government's June 2026 implementation explanation says fixed-term contracts are limited to 12 months unless objectively justified. The product now flags >12-month fixed-term metadata for review instead of assuming invalidity.",source:"DailyNews / Ministry of Labour and Home Affairs",url:"https://dailynews.gov.bw/news-detail/91734"},
 {date:"Current source validation",title:"BURS VAT threshold conflict detected",impact:"High",text:"Two current BURS public pages present different compulsory VAT-registration thresholds. Automatic turnover-based VAT registration advice is blocked pending validation against the current legislation/tax guidance.",source:"BURS Registration + VAT FAQ",url:"https://www.burs.org.bw/index.php/about-us/faq/tax-faq/vat-faq"},
 {date:"Current source validation",title:"BURS PAYE threshold conflict detected",impact:"Medium",text:"Different BURS public pages currently show P3,000 and P2,500 monthly thresholds in PAYE-related guidance. Payroll tax calculations should use current tax tables rather than either snippet.",source:"BURS PAYE guidance",url:"https://www.burs.org.bw/index.php/tax/income-tax/pay-as-you-earn"},
 {date:"2025-03",title:"CIPA beneficial-owner and nominee declarations",impact:"High",text:"CIPA's upgraded OBRS requires beneficial-owner declarations for new and existing companies and declaration of nominee or alternate directors/shareholders where such arrangements exist.",source:"CIPA OBRS Upgrade Public Notice",url:"https://www.cipa.co.bw/wp-content/uploads/2025/03/OBRS-Upgrade-Public-Notice-PDF.pdf"},
 {date:"Current",title:"Industrial licensing route and annual renewal",impact:"High",text:"Government guidance states manufacturing enterprises require the applicable industrial licence before commencing operations. For enterprises above P5 million turnover, applications go to the Department of Industrial Affairs; below P5 million they go through local authority commercial offices. Industrial licences are renewed annually on or before the first-issue date.",source:"Government of Botswana – Industrial Licence",url:"https://www.gov.bw/trade/issuance-industrial-licence"},
 {date:"Current",title:"Factory-registration trigger",impact:"High",text:"Certain premises where persons are regularly employed in manufacturing or related processes require factory registration before operation. Manufacturing onboarding now triggers this assessment.",source:"Government of Botswana – Factory Registration",url:"https://www.gov.bw/occupational-health-safety/factory-registration"},
 {date:"2025-03",title:"CIPA mandatory company constitutions",impact:"High",text:"CIPA's OBRS upgrade notice states that company constitutions became mandatory for both new and existing companies following the Companies Amendment Act, 2022. Add constitution evidence to the corporate compliance pack.",source:"CIPA OBRS Upgrade Public Notice",url:"https://www.cipa.co.bw/wp-content/uploads/2025/03/OBRS-Upgrade-Public-Notice-PDF.pdf"},
 {date:"2025-01-14",title:"Data Protection Act 2024 commencement",impact:"High",text:"Botswana's Data Protection Act No.18 of 2024 commenced on 14 January 2025. Businesses processing employee or customer personal data should establish data inventories, access controls, transparency, retention and incident-response processes.",source:"Botswana Government / DailyNews",url:"https://dailynews.gov.bw/common_up/dailynews/dailynews_pdf/18-11-2025_07-26-44_1763443604_dailynews_pdf.pdf"},
 {date:"Current",title:"Trade licence annual fee model",impact:"Medium",text:"Current MTI guidance states that licences and registration certificates are valid indefinitely and that 25% of the licence/registration fee is payable each year as an annual fee. Track the anniversary even where the licence itself does not expire.",source:"MTI eServices",url:"https://trade.gov.bw/Home/Applications?AppId=21&DeptId=10"},
 {date:"2026-09-01",title:"Employment law transition",impact:"High",text:"Review employment contracts, leave, discipline, termination and employee record workflows against the legislation in force from this date. Production rule packs should be lawyer-validated before automated recommendations are released.",source:"DailyNews / official Botswana legal sources",url:"https://dailynews.gov.bw/news-detail/92813"},
 {date:"Ongoing",title:"CIPA annual return compliance",impact:"High",text:"Maintain annual-return due-month tracking and evidence of filing/payment. The product should escalate before a company enters penalty/removal risk.",source:"CIPA",url:"https://www.cipa.co.bw/"},
 {date:"Monthly / tax period",title:"BURS PAYE and VAT deadlines",impact:"High",text:"PAYE and VAT rules create recurring high-value reminders. Production should calculate due dates from taxpayer status and period, not hard-code a universal date.",source:"BURS",url:"https://www.burs.org.bw/index.php/tax/payments"}
];


const reservedManufacturing=["School uniforms","School furniture","Burglar bars","Protective clothing","Sorghum milling","Cement bricks","Bread and confectionery","Peanut butter","Bottled water","Traditional sour milk","Packaging","Floor polish","Traditional leather products","Traditional crafts","Signage","Fencing materials","Candles","Ice making","Meat processing"];
function p_mfg_status(){
 if(!state.profile.manufacturing)return "Not applicable";
 if(!state.profile.mfgActivity)return "Activity not classified";
 return "Industrial route active"
}
function mfgRoute(){
 if(!state.profile.manufacturing)return "Not applicable";
 const turnover=Number(state.profile.turnover);
 if(!Number.isFinite(turnover)||turnover<=0)return "Set annual turnover to determine route";
 return turnover>5000000?"Department of Industrial Affairs":"District / Town / City Council";
}

function applicable(){return rules.filter(r=>r.applies(state.profile))}
function riskClass(r){return r==="High"?"bad":r==="Medium"?"warn":"good"}
function scoreData(){
 const a=applicable();let penalties=0,protection=0;
 a.forEach(r=>{
  const st=r.status();
  if(/Action required|gaps|verify|Professional review required/i.test(st))penalties+=r.risk==="High"?12:7;
  if(["Employment","Data protection","Tender readiness"].includes(r.area)&&/gaps|verify|review|Action required/i.test(st))protection+=10
 });
 let emps=state.employees||[];if(emps.length){let missing=emps.filter(e=>!e.contract||!e.asset).length;protection+=Math.min(20,missing*4)}
 if(state.profile.data){let pc=state.privacy?.controls||{};let pg=privacyControls.filter(x=>!pc[x[0]]).length;penalties+=Math.min(15,pg*2);protection+=Math.min(15,pg*2)}
 let verified=(state.evidence||[]).filter(e=>e.verified).length,totalEv=(state.evidence||[]).length;if(totalEv&&verified/totalEv<.75)protection+=6;
 let comp=Math.max(35,100-penalties),prot=Math.max(30,90-protection);
 return {comp,prot,open:a.filter(r=>/Action required|gaps|verify|Professional review required/i.test(r.status())).length};
}


const securityControls=[
 {id:"auth",name:"Real authentication and secure server sessions",prototype:true,production:true},
 {id:"tenant",name:"Server-enforced tenant isolation on application data",prototype:true,production:true},
 {id:"db",name:"Server-side PostgreSQL persistence and migrations",prototype:true,production:true},
 {id:"objects",name:"Private evidence object storage with short-lived signed URLs",prototype:true,production:true},
 {id:"audit",name:"Authoritative server-side audit log",prototype:true,production:true},
 {id:"secrets",name:"Deploy production secrets through a secret manager",prototype:false,production:true},
 {id:"validation",name:"Strict API input/schema validation and CSRF/origin checks",prototype:true,production:true},
 {id:"uploads",name:"Upload size/type restrictions plus malware scanning",prototype:false,production:true},
 {id:"backup",name:"Encrypted backups + successful restore drill",prototype:false,production:true},
 {id:"retention",name:"Automated retention/deletion workflow for personal data",prototype:false,production:true},
 {id:"rate",name:"General and authentication-specific rate limiting",prototype:true,production:true},
 {id:"headers",name:"Security headers and HTTPS-only production cookies",prototype:true,production:true}
];
async function loadDiagnostics(){
 let el=document.getElementById("opsDiagnostics");if(!el)return;el.safeHTML='<div class="muted small">Checking database, migrations, storage and process health…</div>';
 try{let d=await apiFetch("/api/ops/diagnostics");let storage=d.objectStorage||{};el.safeHTML=`<div class="statusgrid"><div class="metricmini"><div class="kpi">Version</div><b>${escapeHtml(d.version||"—")}</b></div><div class="metricmini"><div class="kpi">Uptime</div><b>${Math.floor((d.uptimeSec||0)/60)} min</b></div><div class="metricmini"><div class="kpi">Memory RSS</div><b>${d.memoryMb?.rss||0} MB</b></div><div class="metricmini"><div class="kpi">Object storage</div><b>${storage.configured?(storage.reachable===false?"Configured / check failed":"Configured") : "Missing"}</b></div></div><div class="small muted" style="margin-top:10px">Latest migration: ${escapeHtml(d.latestMigration?.version||"none")} · Requests since start: ${d.metrics?.requests||0} · Server errors: ${d.metrics?.errors||0} · Auth failures: ${d.metrics?.authFailures||0}</div>`}catch(err){el.safeHTML=`<div class="rulebad"><b>Diagnostics failed</b><div class="small">${escapeHtml(err.message)}</div></div>`}
}
function renderSecurity(){
 let q=id=>document.getElementById(id);if(!q("securityScore"))return;
 let proto=securityControls.filter(c=>c.prototype).length,score=Math.round(proto/securityControls.length*100),blockers=securityControls.length-proto;
 q("securityScore").textContent=score;q("securityBlockers").textContent=blockers;
 q("securityControls").safeHTML=securityControls.map(c=>`<div class="securityrow"><div><b>${c.name}</b></div><span class="badge ${c.prototype?"good":"warn"}">${c.prototype?"Prototype partial":"Production required"}</span><span class="small muted">${c.production?"Required":"Optional"}</span></div>`).join("")
}


function renderGlobalConflict(){
 let el=document.getElementById("globalConflictBanner");if(!el)return;
 if(!sourceConflicts.length){el.style.display="none";return}
 el.style.display="block";el.safeHTML=`<div class="between row"><div><b>Source validation in progress</b><div class="small">${sourceConflicts.length} rule conflict(s) are safely blocked from automation.</div></div><button class="btn alt" data-bw-onclick="showView('sources')">Review sources</button></div>`;
}


const COMMAND_META={
  dashboard:["Home","Home","overview"],workhub:["Work & deadlines","Work","actions deadlines changes"],sites:["Sites & field work","Work","sites jobs field work tasks"],obligations:["What needs action","Work","actions obligations compliance"],calendar:["Deadlines","Work","calendar due dates"],statutorycalendar:["Filing deadlines","Work","BURS CIPA statutory filing"],changes:["Rule updates","Work","law regulation changes"],
  peopleops:["People","People","employees daily work"],employees:["Employees","People","staff register"],dailyreports:["Daily reports","People","branch reports reporting coverage performance"],employer:["Employment cases","People","HR disciplinary grievance"],employmentcontrols:["Contracts & employment controls","People","labour contracts"],employershield:["Employment protection","People","contracts fixed term process"],privacy:["Privacy","People","personal data"],
  businesshub:["Business","Business","company licences tax changes"],taxprofile:["Tax details","Business","BURS tax"],bwreadiness:["Botswana business checklist","Business","setup readiness compliance"],corporate:["Company records","Business","company records"],companysecretary:["Company changes & filings","Business","CIPA company secretary"],licenceos:["Licences","Business","licence renewals"],businessevents:["Record a business change","Business","move ownership activity change"],events:["Business change examples","Business","change scenarios"],manufacturing:["Manufacturing requirements","Business","manufacturing licence"],profile:["Business details","Business","profile settings"],industryintel:["Industry watch","Business","industry risk"],
  evidencehub:["Documents & proof","Documents","evidence proof documents"],vault:["Evidence library","Documents","uploads proof"],evidenceintegrity:["Evidence checks","Documents","integrity malware approval"],documents:["Documents","Documents","document centre"],compliancepassport:["Share verified proof","Documents","compliance passport sharing"],expert:["Professional reviews","Documents","review queue"],inspectionreadiness:["Inspection preparation","Documents","inspection defence"],assurancefreshness:["Evidence freshness","Documents","freshness"],controllineage:["Control history","Documents","audit assurance history"],audit:["Activity history","Documents","audit history"],auditintegrity:["Protected audit trail","Documents","sealed audit"],
  tenderhub:["Tenders","Tenders","tender readiness procurement"],tender:["Tender register","Tenders","opportunities closing dates"],tenderready:["Tender readiness","Tenders","mandatory gaps"],
  automationhub:["AI & reminders","AI","copilot workflows notifications"],aiservices:["AI copilot","AI","assistant brief risk"],workflowhub:["Automated follow-up","AI","workflow automation"],notifications:["Notifications","AI","email WhatsApp reminders"],recurringautomation:["Recurring work","AI","schedule recurring"],regulatoryintel:["Rule updates & impact","AI","law changes intelligence"],regulatoryobligations:["Rule checks","AI","rules obligations"],aicontrols:["AI credits & limits","AI","credits cost limits"],
  accounthub:["Settings","Settings","security billing integrations"],accountsocial:["Sign-in methods","Settings","Google Facebook login"],accountsecurity:["Account security","Settings","password sessions"],accountdata:["Export my data","Settings","data export"],datadeletion:["Delete account data","Settings","delete retention"],billing:["Plan & billing","Settings","subscription billing"],payments:["Payments","Settings","payment provider"],entitlements:["Plan features","Settings","entitlements access"],integrations:["Connections","Settings","integrations"],security:["Security checks","Settings","security diagnostics"],
  protectionengine:["Risk protection","Specialist","risk protection"],controlcenter:["Controls overview","Specialist","assurance controls"],riskengine:["Risk events","Specialist","risk engine"],partnerportal:["Partner access","Specialist","accountant consultant"],portfolioRisk:["Client portfolio risk","Specialist","portfolio"],partneractioncenter:["Partner work queue","Specialist","partner tasks"],servicesmarketplace:["Professional services","Specialist","services"],sources:["Official sources","Administration","sources"],rules:["Compliance rules","Administration","rules"],publishing:["Publish rules","Administration","publishing"],regulatorygovernance:["Regulatory controls","Administration","governance"]
};
const COMMAND_HUBS=new Set(["dashboard","workhub","peopleops","businesshub","evidencehub","tenderhub","automationhub","accounthub"]);
const COMMAND_GROUP_ORDER=["Work","People","Business","Documents","Tenders","AI","Settings","Specialist","Administration"];
const COMMAND_RECENT_KEY="bw-recent-tools-v78s2";
let commandRecentFallback=[];
let commandMode="suggested",commandCategory="Work";
function getCommandSections(){
  const rows=[],seen=new Set();
  document.querySelectorAll('#nav button[data-view]').forEach(el=>{
    const id=el.dataset.view;if(seen.has(id))return;seen.add(id);
    const meta=COMMAND_META[id]||[(el.textContent||id).trim(),"Advanced",""];
    rows.push([id,meta[0],meta[1],meta[2]||""]);
  });
  return rows;
}
function allowedCommandIds(){return new Set([...document.querySelectorAll('.nav button[data-view]')].filter(b=>b.style.display!=="none").map(b=>b.dataset.view))}
function commandRow(x){return `<button class="commanditem" data-bw-onclick="commandGo('${x[0]}')"><span><b>${x[1]}</b><small>${x[2]}</small></span><span class="commandarrow">→</span></button>`}
function commandHeading(title,copy=""){return `<div class="commandsection"><b>${title}</b>${copy?`<span>${copy}</span>`:""}</div>`}
function commandActionRow(id,label,copy,icon){return `<button class="commandquick" data-bw-onclick="commandGo('${id}')"><span class="commandquickicon">${icon}</span><span><b>${label}</b><small>${copy}</small></span></button>`}
function readRecentTools(){try{const rows=JSON.parse(sessionStorage.getItem(COMMAND_RECENT_KEY)||"[]");return Array.isArray(rows)&&rows.length?rows:commandRecentFallback}catch(_){return commandRecentFallback}}
function recordRecentTool(id){if(!COMMAND_META[id]||COMMAND_HUBS.has(id))return;let rows=readRecentTools().filter(x=>x!==id);rows.unshift(id);commandRecentFallback=rows.slice(0,8);try{sessionStorage.setItem(COMMAND_RECENT_KEY,JSON.stringify(commandRecentFallback))}catch(_){}}
function syncCommandModeButtons(){document.querySelectorAll('[data-command-mode]').forEach(b=>b.classList.toggle('active',b.dataset.commandMode===commandMode))}
function setCommandMode(mode){commandMode=["suggested","recent","all"].includes(mode)?mode:"suggested";const input=document.getElementById("commandInput");if(input)input.value="";syncCommandModeButtons();renderCommandResults("")}
function setCommandCategory(group){commandCategory=group;renderCommandResults("")}
function openCommandPaletteWithQuery(q=""){openCommandPalette();const input=document.getElementById("commandInput");if(input){input.value=q;renderCommandResults(q)}}
function openCommandPalette(){let sh=document.getElementById("commandShade");if(!sh)return;sh.classList.add("open");commandMode="suggested";commandCategory="Work";syncCommandModeButtons();renderCommandResults("");setTimeout(()=>document.getElementById("commandInput")?.focus(),20)}
function closeCommandPalette(){document.getElementById("commandShade")?.classList.remove("open")}
function renderCommandResults(q=""){
  const allowed=allowedCommandIds(),query=q.trim().toLowerCase();
  const sections=getCommandSections().filter(x=>allowed.has(x[0]));
  const role=currentWorkspaceRole();
  const actions=[
    canEditEvidence()&&["__add_evidence","Add evidence","Upload or record proof","＋"],
    role==="owner"&&["__guided_setup","Guided setup","Finish the business basics","✓"],
    ["owner","manager"].includes(role)&&["__run_scan","Run compliance scan","Refresh actions and gaps","↻"],
    ["__website","Back to website","Open the public BW homepage","←"],
    ["__logout","Log out","End this session","→"]
  ].filter(Boolean);
  syncCommandModeButtons();
  if(query){
    const actionMatches=actions.filter(x=>(x[1]+" "+x[2]).toLowerCase().includes(query));
    const searchScore=x=>{const label=x[1].toLowerCase(),group=x[2].toLowerCase(),keywords=x[3].toLowerCase();let score=label===query?0:label.startsWith(query)?1:label.includes(query)?2:group.includes(query)?4:keywords.includes(query)?5:9;if(COMMAND_HUBS.has(x[0]))score+=2;return score};
    const matches=sections.filter(x=>(x[1]+" "+x[2]+" "+x[3]).toLowerCase().includes(query)).sort((a,b)=>searchScore(a)-searchScore(b)||a[1].localeCompare(b[1])).slice(0,24);
    commandResults.safeHTML=(actionMatches.length||matches.length)?commandHeading("Search results",`${actionMatches.length+matches.length} match${actionMatches.length+matches.length===1?"":"es"}`)+actionMatches.map(x=>commandActionRow(x[0],x[1],x[2],x[3])).join("")+matches.map(commandRow).join(""):`<div class="empty"><b>No matching task</b><span class="muted small">Try a plain word such as employee, licence, tender, tax or document.</span></div>`;
    return;
  }
  if(commandMode==="suggested"){
    const suggested=["obligations","calendar","dailyreports","businessevents","vault","aiservices","tenderready"].map(id=>sections.find(x=>x[0]===id)).filter(Boolean).slice(0,6);
    commandResults.safeHTML=`<div class="commandquickgrid">${actions.slice(0,4).map(x=>commandActionRow(x[0],x[1],x[2],x[3])).join("")}</div>${commandHeading("Suggested for you","Common jobs for your access level")}${suggested.map(commandRow).join("")}`;
    return;
  }
  if(commandMode==="recent"){
    const recent=readRecentTools().map(id=>sections.find(x=>x[0]===id)).filter(Boolean);
    commandResults.safeHTML=recent.length?commandHeading("Recent tools","Your latest specialist views")+recent.map(commandRow).join(""):`<div class="empty"><b>No recent tools yet</b><span class="muted small">Open a specialist tool and it will appear here.</span></div>`;
    return;
  }
  const specialist=sections.filter(x=>!COMMAND_HUBS.has(x[0]));
  const groups=COMMAND_GROUP_ORDER.filter(g=>specialist.some(x=>x[2]===g));
  if(!groups.includes(commandCategory))commandCategory=groups[0]||"Work";
  const rows=specialist.filter(x=>x[2]===commandCategory);
  commandResults.safeHTML=`<div class="commandcategories">${groups.map(g=>`<button type="button" class="${g===commandCategory?"active":""}" data-bw-onclick="setCommandCategory('${g}')">${g}</button>`).join("")}</div>${commandHeading(commandCategory,"All available tools in this area")}${rows.map(commandRow).join("")}`;
}
function commandGo(id){closeCommandPalette();if(id==="__add_evidence")return openAddEvidence();if(id==="__guided_setup")return openOnboarding();if(id==="__run_scan")return openModal("scanModal");if(id==="__website")return returnToPublicWebsite();if(id==="__logout")return logoutUser();recordRecentTool(id);showView(id)}
function commandKey(e){if(e.key==="Escape")closeCommandPalette();if(e.key==="Enter"){let first=document.querySelector('#commandResults .commanditem,#commandResults .commandquick');if(first)first.click()}}
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommandPalette()}else if(e.key==="/"&&!/input|textarea|select/i.test(document.activeElement?.tagName||"")){e.preventDefault();openCommandPalette()}else if(e.key==="Escape")closeCommandPalette()});
function mobileGo(id){showView(id);updateMobileNav(id)}
function updateMobileNav(id){document.querySelectorAll('[data-mobile-view]').forEach(b=>b.classList.toggle('active',b.dataset.mobileView===id))}
function setupProgress(){
 let p=state.profile||{};let items=[!!p.name,!!p.industry,!!p.town,Number.isFinite(+p.employees),!!p.cipaMonth,(!p.trade||!!p.tradeAnniversary),(state.evidence||[]).some(e=>e.verified)];
 let done=items.filter(Boolean).length,pct=Math.round(done/items.length*100);let bar=document.getElementById('setupBar');if(bar)bar.style.width=pct+'%';if(document.getElementById('setupPercent'))setupPercent.textContent=pct+'%';
 if(document.getElementById('setupHint'))setupHint.textContent=pct===100?'Core workspace setup is complete.':'Complete '+(items.length-done)+' setup item'+(items.length-done===1?'':'s')+' to improve recommendations.';
}
let managementReviewState={items:[],reviewers:[],counts:{},policy:{}},pendingReviewDecision=null;
function focusManagementReviewInbox(){const el=document.getElementById("managementReviewCard");if(el){el.scrollIntoView({behavior:"smooth",block:"start"});setTimeout(()=>el.querySelector("button,select")?.focus(),250)}}
function reviewAgeLabel(hours){hours=Number(hours||0);return hours<24?`${hours}h waiting`:`${Math.floor(hours/24)}d waiting`}
function reviewEvidenceLabel(e){if(!e)return "No dedicated proof checklist";return `${Number(e.ready||0)}/${Number(e.total||0)} ${e.label||"evidence"} ready`}
function canRecordManagementReview(item){const role=currentWorkspaceRole(),uid=String(currentUser?.id||"");return ["owner","reviewer"].includes(role)&&(!item.reviewerUserId||String(item.reviewerUserId)===uid)}
async function renderManagementReviewInbox(){
  const allowed=["owner","manager","reviewer"].includes(currentWorkspaceRole());document.querySelectorAll(".review-role-only").forEach(x=>x.hidden=!allowed);if(!allowed)return;
  const box=document.getElementById("managementReviewList"),set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};if(!box)return;
  try{
    const r=await apiJson("/api/review-inbox");managementReviewState=r||{items:[],reviewers:[],counts:{},policy:{}};const items=r.items||[],c=r.counts||{},reviewers=r.reviewers||[],role=currentWorkspaceRole(),uid=String(currentUser?.id||"");
    set("reviewInboxTotal",Number(c.total||0));set("reviewInboxUnassigned",Number(c.unassigned||0));set("reviewInboxOverdue",Number(c.overdue||0));set("workWaitingReviews",Number(c.total||0));set("workOldestReview",items.length?reviewAgeLabel(Math.max(...items.map(x=>Number(x.ageHours||0)))):"None");set("workReviewDetail",items.length?`${items.length} item${items.length===1?" is":"s are"} waiting for an explicit decision${Number(c.overdue||0)?`; ${Number(c.overdue)} overdue.`:"."}`:"No source workflow is currently waiting for a review decision.");
    box.safeHTML=items.length?items.map(x=>{const assigned=String(x.reviewerUserId||""),mine=assigned&&assigned===uid,canDecide=canRecordManagementReview(x),evidence=reviewEvidenceLabel(x.evidence),due=x.dueAt?` · due ${new Date(x.dueAt).toLocaleDateString()}`:"",age=reviewAgeLabel(x.ageHours),assign=role==="owner"||role==="manager"?`<select aria-label="Reviewer for ${escapeHtml(x.title||"review")}" data-bw-onchange="assignManagementReview('${safeId(x.sourceType)}','${safeId(x.sourceId)}',this.value)"><option value="">${assigned?"Change reviewer":"Assign reviewer"}</option>${reviewers.map(rv=>`<option value="${safeId(rv.user_id)}" ${String(rv.user_id)===assigned?"selected":""}>${escapeHtml(rv.display_name||rv.email||"Reviewer")} · ${escapeHtml(rv.role)}</option>`).join("")}</select>`:!assigned?`<button class="btn soft" type="button" data-bw-onclick="assignManagementReview('${safeId(x.sourceType)}','${safeId(x.sourceId)}','${safeId(uid)}')">Claim review</button>`:`<span class="badge ${mine?"good":""}">${mine?"Assigned to you":`Assigned · ${escapeHtml(x.reviewerName||"reviewer")}`}</span>`;const decide=["owner","reviewer"].includes(role)?canDecide?`<button class="btn soft" type="button" data-bw-onclick="openManagementReviewDecision('${safeId(x.sourceType)}','${safeId(x.sourceId)}','return')">Return</button><button class="btn" type="button" data-bw-onclick="openManagementReviewDecision('${safeId(x.sourceType)}','${safeId(x.sourceId)}','approve')">Approve</button>`:`<span class="muted small">Decision belongs to ${escapeHtml(x.reviewerName||"the assigned reviewer")}.</span>`:"";return `<div class="management-review-row ${x.overdue?"overdue":""}"><div><div class="section-eyebrow">${escapeHtml(x.kind||"Review")}</div><h4>${escapeHtml(x.title||"Review item")}</h4><small>${escapeHtml(x.summary||"Waiting for review.")}</small><div class="review-context"><span>${escapeHtml(age)}${x.overdue?" · overdue":""}</span><span>${escapeHtml(evidence)}</span>${x.actionOwner?`<span>action owner · ${escapeHtml(x.actionOwner)}</span>`:""}${due?`<span>${escapeHtml(due.replace(/^ · /,""))}</span>`:""}</div></div><div class="management-review-actions">${assign}${decide}</div></div>`}).join(""):'<div class="notice good"><b>No work is waiting for a management review decision.</b><div class="small">This only describes the review queue; it is not a legal all-clear for open actions or future deadlines.</div></div>';
  }catch(e){set("reviewInboxTotal","—");set("reviewInboxUnassigned","—");set("reviewInboxOverdue","—");set("workWaitingReviews","—");set("workOldestReview","Unavailable");set("workReviewDetail","Review status unavailable. Do not infer that the queue is clear.");box.safeHTML=`<div class="notice bad"><b>Review inbox unavailable</b><div class="small">${escapeHtml(e.message||String(e))}. Do not assume pending approvals are clear.</div><button class="btn alt" style="margin-top:8px" data-bw-onclick="renderManagementReviewInbox()">Retry</button></div>`}
}
async function assignManagementReview(sourceType,sourceId,reviewerUserId){if(!reviewerUserId)return false;try{await apiJson(`/api/review-inbox/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}/assign`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reviewerUserId})});await renderManagementReviewInbox();return true}catch(e){notifyUser(e.message||String(e));await renderManagementReviewInbox();return false}}
function openManagementReviewDecision(sourceType,sourceId,decision){const item=(managementReviewState.items||[]).find(x=>String(x.sourceType)===String(sourceType)&&String(x.sourceId)===String(sourceId));if(!item)return;pendingReviewDecision={sourceType,sourceId,decision,item};const title=document.getElementById("reviewDecisionTitle"),summary=document.getElementById("reviewDecisionSummary"),note=document.getElementById("reviewDecisionNote"),att=document.getElementById("reviewDecisionAttest"),err=document.getElementById("reviewDecisionError"),btn=document.getElementById("reviewDecisionSubmit");if(title)title.textContent=decision==="approve"?"Approve review":"Return for more work";if(summary)summary.safeHTML=`<b>${escapeHtml(item.title||"Review item")}</b><small>${escapeHtml(item.kind||"Review")} · ${escapeHtml(reviewEvidenceLabel(item.evidence))} · ${escapeHtml(reviewAgeLabel(item.ageHours))}</small>`;if(note)note.value="";if(att)att.checked=false;if(err)err.textContent="";if(btn)btn.textContent=decision==="approve"?"Approve & record":"Return & record";openModal("reviewDecisionModal")}
async function submitManagementReviewDecision(){const p=pendingReviewDecision;if(!p)return;const note=(document.getElementById("reviewDecisionNote")?.value||"").trim(),att=!!document.getElementById("reviewDecisionAttest")?.checked,err=document.getElementById("reviewDecisionError"),btn=document.getElementById("reviewDecisionSubmit");if(note.length<10){if(err)err.textContent="Add a short decision note (at least 10 characters).";return}if(!att){if(err)err.textContent="Confirm the review attestation before recording the decision.";return}try{if(btn){btn.disabled=true;btn.textContent="Recording…"}if(STANDALONE_PREVIEW){managementReviewState.items=(managementReviewState.items||[]).filter(x=>!(x.sourceType===p.sourceType&&x.sourceId===p.sourceId));closeModal("reviewDecisionModal");const box=document.getElementById("managementReviewList");if(box)box.safeHTML='<div class="notice good"><b>Preview decision recorded locally.</b><div class="small">Production records reviewer identity, note, attestation and source-state change in the audit trail.</div></div>';return}await apiJson(`/api/review-inbox/${encodeURIComponent(p.sourceType)}/${encodeURIComponent(p.sourceId)}/decision`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision:p.decision,note,attestation:true})});closeModal("reviewDecisionModal");pendingReviewDecision=null;await Promise.allSettled([renderManagementReviewInbox(),renderManagementReviewAudit(),renderWorkHub(),renderUnifiedNextActions(),renderComplianceObligations(),renderCompanyActions(),renderHrCases(),renderHomeDecisionCenter?.()])}catch(e){if(err)err.textContent=e.message||String(e)}finally{if(btn){btn.disabled=false;btn.textContent=p?.decision==="approve"?"Approve & record":"Return & record"}}}

let managementReReviewState={items:[],counts:{},policy:{}};
function focusManagementReReview(){const el=document.getElementById("managementReReviewCard");if(el)el.scrollIntoView({behavior:"smooth",block:"start"})}
async function claimManagementReReview(id){try{await apiJson(`/api/re-review/${encodeURIComponent(id)}/claim`,{method:"POST"});await Promise.allSettled([renderManagementReReview(),renderManagementReviewInbox()])}catch(e){notifyUser(e.message||String(e))}}
async function decideManagementReReview(id,decision){const approving=decision==="approve";const note=await BW.dialog.prompt({title:approving?"Approve management re-review":"Return management re-review",message:approving?"Explain what you rechecked and why the approval remains valid.":"Explain what must change before this work can be approved.",multiline:true,required:true,minLength:10,maxLength:900,confirmLabel:"Continue"});if(note===null)return;if(note.trim().length<10){notifyUser("Add a decision note of at least 10 characters.");return}const attested=await BW.dialog.confirm({title:"Confirm re-review attestation",message:"I attest that I reviewed the current source record and current proof before recording this re-review decision.",confirmLabel:approving?"Approve & record":"Return & record"});if(!attested)return;try{await apiJson(`/api/re-review/${encodeURIComponent(id)}/decision`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision,note:note.trim(),attestation:true})});await Promise.allSettled([renderManagementReReview(),renderManagementReviewAudit(),renderManagementReviewInbox(),renderWorkHub()])}catch(e){notifyUser(e.message||String(e))}}
async function renderManagementReReview(){
  const allowed=["owner","manager","reviewer"].includes(currentWorkspaceRole());if(!allowed)return;const box=document.getElementById("managementReReviewList"),set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};if(!box)return;
  try{const r=await apiJson("/api/re-review");managementReReviewState=r||{items:[],counts:{},policy:{}};const items=r.items||[],c=r.counts||{};set("reReviewOpen",Number(c.open||0));set("reReviewUnassigned",Number(c.unassigned||0));set("reReviewOverdue",Number(c.overdue||0));
    box.safeHTML=items.length?items.map(x=>`<div class="rereview-row ${x.overdue?"overdue":""}"><div><div class="section-eyebrow">${escapeHtml(String(x.source_type||"review").replaceAll("_"," "))}</div><h4 style="margin:2px 0 4px">Re-review required</h4><div class="small"><b>What changed:</b> ${escapeHtml(x.reason||"Approval basis changed.")}</div><div class="rereview-meta"><span>prior reviewer · ${escapeHtml(x.prior_reviewer_name||"recorded")}</span><span>response due · ${escapeHtml(x.response_due_at?new Date(x.response_due_at).toLocaleString():"unknown")}</span><span>${x.overdue?"overdue":"within response target"}</span></div></div><div class="actions"><button class="btn alt" data-bw-onclick="claimManagementReReview('${escapeHtml(x.id)}')">${x.reviewer_user_id?"Claimed":"Claim"}</button><button class="btn" data-bw-onclick="decideManagementReReview('${escapeHtml(x.id)}','approve')">Re-approve</button><button class="btn soft" data-bw-onclick="decideManagementReReview('${escapeHtml(x.id)}','return')">Return</button></div></div>`).join(""):'<div class="notice good"><b>No stale approvals are waiting for re-review.</b><div class="small">This is a queue state, not a legal all-clear. Sealed approvals are still dynamically checked against current source facts and proof.</div></div>';
  }catch(e){set("reReviewOpen","—");set("reReviewUnassigned","—");set("reReviewOverdue","—");box.safeHTML=`<div class="notice bad"><b>Re-review queue unavailable</b><div class="small">${escapeHtml(e.message||String(e))}. Do not assume stale approvals have been resolved.</div><button class="btn alt" style="margin-top:8px" data-bw-onclick="renderManagementReReview()">Retry</button></div>`}
}

let managementReviewAuditState={items:[],counts:{},policy:{}};
function focusManagementReviewAudit(){const el=document.getElementById("managementReviewAuditCard");if(el){el.scrollIntoView({behavior:"smooth",block:"start"});setTimeout(()=>el.querySelector("button")?.focus(),250)}}
function reviewAuditValidityLabel(v){return v==="valid"?"Current":v==="stale"?"Needs re-review":v==="returned"?"Returned":"Seal incomplete"}
async function renderManagementReviewAudit(){
  const allowed=["owner","manager","reviewer","auditor"].includes(currentWorkspaceRole());document.querySelectorAll(".audit-role-only").forEach(x=>x.hidden=!allowed);if(!allowed)return;
  const box=document.getElementById("managementReviewAuditList"),set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};if(!box)return;
  try{
    const r=await apiJson("/api/review-audit");managementReviewAuditState=r||{items:[],counts:{},policy:{}};const items=r.items||[],c=r.counts||{};set("reviewAuditValid",Number(c.valid||0));set("reviewAuditStale",Number(c.stale||0));set("reviewAuditReturned",Number(c.returned||0));set("workAuditDetail",items.length?`${Number(c.valid||0)} current approval${Number(c.valid||0)===1?"":"s"}; ${Number(c.stale||0)} need re-review.`:"No sealed management review decision is recorded yet.");
    box.safeHTML=items.length?items.map(x=>{const proof=(x.evidence||[]).filter(e=>e.evidenceId),proofHtml=proof.length?`<div class="review-audit-proof">${proof.slice(0,4).map(e=>`<span>${escapeHtml(e.displayName||e.label||"Evidence")} · ${escapeHtml(String(e.contentSha256||"").slice(0,10)||"no hash")}${e.validUntil?` · valid to ${escapeHtml(new Date(e.validUntil).toLocaleDateString())}`:""}</span>`).join("")}${proof.length>4?`<span>+${proof.length-4} more proof item${proof.length-4===1?"":"s"}</span>`:""}</div>`:'<div class="muted small" style="margin-top:7px">No evidence file was sealed with this decision.</div>';const changes=(x.changes||[]).length?`<div class="notice ${x.validity==="stale"?"bad":""}" style="margin-top:8px"><b>Changed after decision</b><div class="small">${escapeHtml((x.changes||[]).join(" "))}</div></div>`:"";return `<div class="review-audit-row ${escapeHtml(x.validity||"")}"><div><div class="section-eyebrow">${escapeHtml(String(x.sourceType||"review").replaceAll("_"," "))}</div><h4>${escapeHtml(x.title||"Review decision")}</h4><small>${escapeHtml(x.decision==="approve"?"Approved":"Returned")} by ${escapeHtml(x.reviewerName||"Recorded reviewer")} · ${escapeHtml(x.attestedAt?new Date(x.attestedAt).toLocaleString():"time unavailable")}</small><div class="review-audit-meta"><span>decision · ${escapeHtml(x.decision||"")}</span><span>sealed status · ${escapeHtml(x.sealedStatus||"unknown")}</span><span>attested</span></div><div class="small" style="margin-top:7px"><b>Why:</b> ${escapeHtml(x.note||"No note recorded")}</div>${proofHtml}${changes}</div><div class="review-audit-status"><span class="badge ${x.validity==="valid"?"good":x.validity==="stale"?"warn":""}">${escapeHtml(reviewAuditValidityLabel(x.validity))}</span><div class="muted small">Decision ID<br>${escapeHtml(String(x.id||"").slice(0,14))}</div></div></div>`}).join(""):'<div class="notice"><b>No sealed review decisions yet.</b><div class="small">The audit trail will populate after an explicit approve or return decision. An empty history is not an approval or compliance conclusion.</div></div>';
  }catch(e){set("reviewAuditValid","—");set("reviewAuditStale","—");set("reviewAuditReturned","—");set("workAuditDetail","Audit status unavailable. Do not assume prior approvals are still current.");box.safeHTML=`<div class="notice bad"><b>Review audit trail unavailable</b><div class="small">${escapeHtml(e.message||String(e))}. Do not rely on a prior approval without verifying the sealed decision and current proof.</div><button class="btn alt" style="margin-top:8px" data-bw-onclick="renderManagementReviewAudit()">Retry</button></div>`}
}

let executiveExceptionState={items:[],counts:{},policy:{},accountability:{items:[],counts:{},policy:{}}},pendingExecutiveIntervention=null,pendingExecutiveInterventionProgress=null,pendingExecutiveInterventionClose=null,pendingSystemicCorrective=null,pendingSystemicCorrectiveClose=null,pendingControlPreventiveAction=null,pendingControlReplacementGovernance=null,pendingControlReplacementRetirement=null;
function executiveExceptionAction(x){
  if(x.kind==="missed_deadline")return `<button class="btn alt" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">Work deadline</button>`;
  if(x.kind==="proof_expiry")return `<button class="btn alt" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">Renew proof</button>`;
  if(x.kind==="rereview")return `<button class="btn alt" type="button" data-bw-onclick="showView('workhub');setTimeout(focusManagementReReview,120)">Open re-review</button>`;
  if(x.kind==="review_bottleneck")return `<button class="btn alt" type="button" data-bw-onclick="showView('workhub');setTimeout(focusManagementReviewInbox,120)">Open review</button>`;
  if(x.kind==="escalation")return `<button class="btn alt" type="button" data-bw-onclick="showView('notifications')">Open escalation</button>`;
  if(x.kind==="intervention_closure")return "";
  return `<button class="btn alt" type="button" data-bw-onclick="showView('${safeId(x.target||'workhub')}')">Open</button>`;
}
function executiveInterventionSummary(x){
  const i=x.intervention;if(!i)return "";
  const due=i.recoveryDueAt?new Date(i.recoveryDueAt).toLocaleString():"not recorded",f=i.followThrough||{},status=x.closureReady?"Underlying issue cleared — closure record required":f.recoveryOverdue?"Recovery commitment missed":f.needsAttention?"Recovery follow-through needs attention":"Intervention active",progress=String(i.progressStatus||"not_started").replaceAll("_"," "),progressAt=i.progressUpdatedAt?new Date(i.progressUpdatedAt).toLocaleString():"no checkpoint yet",reason=f.reasons?.length?`<small><b>Follow-through:</b> ${escapeHtml(f.reasons.join(" · "))}</small>`:"",progressNote=i.progressNote?`<small><b>Latest checkpoint:</b> ${escapeHtml(i.progressNote)} · ${escapeHtml(progressAt)}</small>`:`<small><b>Progress:</b> ${escapeHtml(progress)} · ${escapeHtml(progressAt)}</small>`;
  return `<div class="executive-intervention-summary"><b>${escapeHtml(status)}</b><small>${escapeHtml(i.ownerName||"Recorded management owner")} · recover by ${escapeHtml(due)} · ${escapeHtml(i.decision||"management intervention")}</small>${reason}${progressNote}<div class="executive-intervention-meta"><span>${escapeHtml(String(i.status||"claimed").replaceAll("_"," "))}</span><span class="${i.progressStatus==='blocked'?'followup':i.progressStatus==='at_risk'?'atrisk':''}">${escapeHtml(progress)}</span>${f.noProgress?'<span class="followup">progress stale</span>':""}${f.recoveryDueSoon?'<span class="atrisk">recovery due soon</span>':""}${f.recoveryOverdue?'<span class="overdue">recovery overdue</span>':""}</div></div>`;
}
function executiveInterventionActions(x){
  const source=executiveExceptionAction(x),intervention=x.intervention;
  if(x.closureReady&&intervention)return `<div class="executive-exception-actions">${source}<button class="btn" type="button" data-bw-onclick="openExecutiveInterventionClosure('${safeId(intervention.id)}')">Close intervention</button></div>`;
  const label=intervention?"Update intervention":"Intervene",progress=intervention?`<button class="btn alt" type="button" data-bw-onclick="openExecutiveInterventionProgress('${safeId(intervention.id)}')">Update progress</button>`:"";
  return `<div class="executive-exception-actions">${source}${progress}<button class="btn" type="button" data-bw-onclick="openExecutiveIntervention('${encodeURIComponent(String(x.key||""))}')">${label}</button></div>`;
}
let pendingControlPreventiveEffectiveness=null;
function openControlPreventiveEffectiveness(preventiveActionId){const item=(executiveExceptionState.accountability?.items||[]).find(x=>String(x.correctiveActionPreventiveAction?.id||x.correctiveAction?.preventiveAction?.id||"")===String(preventiveActionId));if(!item)return;const p=item.correctiveActionPreventiveAction||item.correctiveAction?.preventiveAction;if(!p)return;pendingControlPreventiveEffectiveness={item,p};document.getElementById("controlPreventiveEffectivenessTitle").textContent=`Verify prevention: ${item.title||"control drift"}`;document.getElementById("controlPreventiveEffectivenessEvidence").value="";document.getElementById("controlPreventiveEffectivenessNote").value="";document.getElementById("controlPreventiveEffectivenessAttest").checked=false;document.getElementById("controlPreventiveEffectivenessError").textContent="";openModal("controlPreventiveEffectivenessModal");}
async function submitControlPreventiveEffectiveness(){const x=pendingControlPreventiveEffectiveness,p=x?.p;if(!p?.id)return;const verificationEvidence=(document.getElementById("controlPreventiveEffectivenessEvidence")?.value||"").trim(),verificationNote=(document.getElementById("controlPreventiveEffectivenessNote")?.value||"").trim(),attestation=!!document.getElementById("controlPreventiveEffectivenessAttest")?.checked,err=document.getElementById("controlPreventiveEffectivenessError"),btn=document.getElementById("controlPreventiveEffectivenessSubmit");if(verificationEvidence.length<15){err.textContent="Record objective verification evidence or a reference (at least 15 characters).";return}if(verificationNote.length<10){err.textContent="Record why the preventive action worked (at least 10 characters).";return}if(!attestation){err.textContent="Confirm the preventive-effectiveness attestation.";return}try{btn.disabled=true;btn.textContent="Verifying…";if(STANDALONE_PREVIEW){p.effectiveness={...(p.effectiveness||{}),status:"passed",verificationEvidence,verificationNote,verifiedAt:new Date().toISOString(),daysRemaining:0};const s=x.item.correctiveActionSustainability||x.item.correctiveAction?.sustainability;if(s){s.warningActive=false;s.warningStartedAt=null;s.warningReason=null;s.warningClearedAt=new Date().toISOString()}x.item.correctiveActionSustainabilityWarning=false;closeModal("controlPreventiveEffectivenessModal");pendingControlPreventiveEffectiveness=null;await renderExecutiveExceptions();return}await apiJson(`/api/executive-control-preventive-actions/${encodeURIComponent(p.id)}/effectiveness`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({verificationEvidence,verificationNote,attestation:true})});closeModal("controlPreventiveEffectivenessModal");pendingControlPreventiveEffectiveness=null;await renderExecutiveExceptions()}catch(e){const m={preventive_effectiveness_observation_incomplete:"The recovery observation period has not ended yet.",preventive_effectiveness_failed_drift:"New drift appeared after preventive completion. Review the new preventive/root-cause action instead.",control_already_relapsed:"Repeated drift crossed the relapse threshold. Open a fresh root-cause corrective action.",preventive_action_owned_by_another_manager:"This preventive action is owned by another manager. The account owner can coordinate it."};err.textContent=m[e.message]||e.message||String(e)}finally{btn.disabled=false;btn.textContent="Verify preventive effectiveness"}}
function controlReplacementGovernanceSummary(x){const g=x.correctiveActionReplacementGovernance,p=x.correctiveActionPreventivePattern;if(!p?.replacementRequired&&!g)return "";if(!g)return `<div class="control-replacement-governance required"><b>Control replacement plan required</b><small>Before opening the replacement corrective cycle, document what weak control will be retired, what replaces it, why the replacement is materially stronger, the transition risk and accountable implementation owner.</small></div>`;const status=String(g.status||"planned"),due=g.implementationDueAt?new Date(g.implementationDueAt).toLocaleString():"not recorded",klass=status==="verified"?"verified":status==="retired"?"retired":"",label=status==="verified"?"Replacement governance verified":status==="retired"?"Old control retired · replacement verification pending":"Replacement plan recorded";return `<div class="control-replacement-governance ${klass}"><b>${escapeHtml(label)}</b><small><b>Retire:</b> ${escapeHtml(g.retiredControl||"Not recorded")}</small><small><b>Replace with:</b> ${escapeHtml(g.replacementControl||"Not recorded")}</small><small><b>Why stronger:</b> ${escapeHtml(g.strongerReason||"Not recorded")}</small><small><b>Transition risk:</b> ${escapeHtml(g.transitionRisk||"Not recorded")} · <b>Mitigation:</b> ${escapeHtml(g.transitionMitigation||"Not recorded")}</small><small><b>Owner:</b> ${escapeHtml(g.ownerName||"Management owner")} · target ${escapeHtml(due)}</small>${g.retirementEvidence?`<small><b>Retirement proof:</b> ${escapeHtml(g.retirementEvidence)}</small>`:""}</div>`}
function preventiveControlPatternSummary(x){const p=x.correctiveActionPreventivePattern;if(!p?.replacementRequired)return "";const trigger=p.repeatedTriggerKind?String(p.repeatedTriggerKind).replaceAll("_"," "):"mixed drift",klass=p.severity==="critical"?"critical":"",tags=[`${Number(p.preventiveActionCount||0)} preventive actions / ${Number(p.lookbackDays||180)}d`,`${Number(p.failedEffectivenessCount||0)} failed verifications`,`${Number(p.supersededActionCount||0)} superseded by relapse`,`${Number(p.repeatedTriggerCount||0)} repeat ${trigger}`];return `<div class="preventive-control-pattern ${klass}"><b>Weak preventive-control pattern · replace or materially strengthen the control</b><small>${escapeHtml(p.reason||"Repeated preventive work suggests the temporary control is not durable.")}</small><small>This is a control-design signal, not a manager or employee score. Repeating the same temporary preventive step does not resolve the pattern.</small><div class="preventive-pattern-tags">${tags.map(t=>`<span>${escapeHtml(t)}</span>`).join("")}</div></div>${controlReplacementGovernanceSummary(x)}`}
function systemicCorrectiveSummary(x){
  const pattern=preventiveControlPatternSummary(x),c=x.correctiveAction,e=x.correctiveActionEffectiveness||c?.effectiveness||null,s=x.correctiveActionSustainability||c?.sustainability||null,p=x.correctiveActionPreventiveAction||c?.preventiveAction||null;if(!c&&x.correctiveActionRequired){const why=x.correctiveActionPreventiveReplacementRequired?"Repeated preventive work indicates the temporary control is weak. Replace or materially strengthen the underlying control instead of repeating the same preventive step.":x.correctiveActionSustainabilityRelapsed?"The verified control crossed the repeated-drift relapse threshold; a fresh root-cause corrective action is required.":x.correctiveActionEffectivenessFailed?"The previous remediation failed effectiveness verification; a new root-cause corrective action is required.":"This recurring pattern needs a recorded root cause, corrective action, accountable management owner and target date. Extending the intervention recovery date does not close this requirement.";return `<div class="systemic-corrective required"><b>Systemic corrective action required</b><small>${escapeHtml(why)}</small></div>${pattern}`}
  if(!c)return pattern;const due=c.targetDueAt?new Date(c.targetDueAt).toLocaleString():"not recorded",klass=c.status==="closed"?"closed":c.overdue?"overdue":"",state=c.status==="closed"?"Remediation closed":c.overdue?"Corrective target missed":"Corrective action open";
  let prevention="";if(p){const ps=String(p.status||"open"),pe=p.effectiveness||null,pes=String(pe?.status||""),pd=p.targetDueAt?new Date(p.targetDueAt).toLocaleString():"not recorded",pk=ps==="completed"?"completed":p.overdue?"overdue":"",label=ps==="completed"?(pes==="passed"?"Preventive action verified effective":pes==="failed"?"Preventive action effectiveness failed":pes==="ready"?"Preventive action completed · verification due":"Preventive action completed · observing recovery"):ps==="superseded"?"Preventive action superseded by relapse":"Early warning · preventive action";let peHtml="";if(ps==="completed"&&pe){const due=pe.observationDueAt?new Date(pe.observationDueAt).toLocaleString():"not recorded",pl=pes==="passed"?"Recovery verified":pes==="failed"?"Recovery not verified":pes==="ready"?"Observation complete · verification due":"7-day recovery observation";peHtml=`<div class="control-prevention-effectiveness ${escapeHtml(pes)}"><b>${escapeHtml(pl)}</b><small>Observation target: ${escapeHtml(due)}${pe.daysRemaining!=null?` · ${Number(pe.daysRemaining)} day(s) remaining`:""}</small>${pe.failureReason?`<small><b>Failure:</b> ${escapeHtml(pe.failureReason)}</small>`:""}${pe.verificationEvidence?`<small><b>Verification evidence:</b> ${escapeHtml(pe.verificationEvidence)}</small>`:""}<small>Completion alone does not clear the early-warning state; only a passed effectiveness verification does.</small></div>`}prevention=`<div class="control-prevention ${escapeHtml(pk)}"><b>${escapeHtml(label)}</b><small>${escapeHtml(p.triggerReason||s?.warningReason||"Early control drift was detected.")}</small><small><b>Action:</b> ${escapeHtml(p.preventiveAction||"Review the early control drift and record a preventive step.")}</small><small><b>Owner:</b> ${escapeHtml(p.ownerName||c.ownerName||"Recorded management owner")} · target ${escapeHtml(pd)}</small>${p.completionEvidence?`<small><b>Completion evidence:</b> ${escapeHtml(p.completionEvidence)}</small>`:""}<small>This preventive checkpoint does not reset the effectiveness baseline or change legal/source deadlines.</small>${peHtml}</div>`}
  let sustainability="";if(s){const ss=String(s.status||"watching"),warning=!!s.warningActive,sd=s.watchDueAt?new Date(s.watchDueAt).toLocaleString():"not recorded",sl=ss==="relapsed"?"Control sustainability · Relapse detected":warning?"Control sustainability · Early warning":ss==="sustained"?"Control sustainability · Sustained":"Control sustainability · Watching";sustainability=`<div class="control-sustainability ${escapeHtml(ss)}"><b>${escapeHtml(sl)}</b><small>${ss==="relapsed"?escapeHtml(s.relapseReason||"Repeated post-verification drift crossed the relapse threshold."):warning?escapeHtml(s.warningReason||"A new drift signal was detected before full relapse."):ss==="watching"?`90-day watch target: ${escapeHtml(sd)}${s.daysRemaining!=null?` · ${Number(s.daysRemaining)} day(s) remaining`:""}`:"The initial sustainability window completed without repeated post-verification drift. Long-term recurrence detection remains active."}</small><small>${warning?"One drift signal opens preventive work; repeated post-verification drift triggers full relapse.":"Long-term monitoring stays quiet unless drift appears."} This control state is not a legal all-clear and creates no employee or manager score.</small>${prevention}</div>`}
  let eff="";if(c.status==="closed"){const es=String(e?.status||"monitoring"),ed=e?.monitoringDueAt?new Date(e.monitoringDueAt).toLocaleString():"not recorded",label=es==="passed"?(s?.warningActive?"Effectiveness verified · preventive attention":"Effectiveness verified · Stabilized"):es==="failed"?"Effectiveness failed":es==="ready"?"Monitoring complete · verification due":"Effectiveness monitoring",criteria=e?.successCriteria||"Success criteria not available";eff=`<div class="corrective-effectiveness ${escapeHtml(es)}"><b>${escapeHtml(label)}</b><small>Monitoring target: ${escapeHtml(ed)}${e?.monitoringDays?` · ${Number(e.monitoringDays)} days`:""}</small><small><b>Success criteria:</b> ${escapeHtml(criteria)}</small>${e?.failureReason?`<small><b>Failure:</b> ${escapeHtml(e.failureReason)}</small>`:""}${e?.verificationEvidence?`<small><b>Verification evidence:</b> ${escapeHtml(e.verificationEvidence)}</small>`:""}${sustainability}</div>`}
  return `<div class="systemic-corrective ${klass}"><b>${escapeHtml(state)}</b><small><b>Owner:</b> ${escapeHtml(c.ownerName||"Recorded management owner")} · target ${escapeHtml(due)}${Number(c.targetExtensionCount||0)?` · target extended ${Number(c.targetExtensionCount)} time(s)`:""}</small><small><b>Root cause:</b> ${escapeHtml(c.rootCause||"Not recorded")}</small><small><b>Action:</b> ${escapeHtml(c.correctiveAction||"Not recorded")}</small>${c.status==="closed"?`<div class="corrective-closed-note"><small><b>Closure evidence:</b> ${escapeHtml(c.closureEvidence||"Recorded")}</small></div>${eff}`:""}</div>${pattern}`;
}
function systemicCorrectiveActions(x){
  const c=x.correctiveAction,e=x.correctiveActionEffectiveness||c?.effectiveness||null,p=x.correctiveActionPreventiveAction||c?.preventiveAction||null,pattern=x.correctiveActionPreventivePattern||null,g=x.correctiveActionReplacementGovernance||null,replace=pattern?.replacementRequired?!g?`<button class="btn" type="button" data-bw-onclick="openControlReplacementGovernance('${safeId(x.interventionId)}')">Plan control replacement</button>`:g.status==="planned"&&!g.replacementCorrectiveActionId?`<button class="btn" type="button" data-bw-onclick="openSystemicCorrectiveAction('${safeId(x.interventionId)}')">Open replacement corrective action</button><button class="btn alt" type="button" data-bw-onclick="openControlReplacementGovernance('${safeId(x.interventionId)}')">Update replacement plan</button>`:g.status==="planned"?`<button class="btn" type="button" data-bw-onclick="openControlReplacementRetirement('${safeId(g.id)}')">Record old-control retirement proof</button>`:"":"";if(!c)return `<div class="systemic-corrective-actions">${replace||`<button class="btn" type="button" data-bw-onclick="openSystemicCorrectiveAction('${safeId(x.interventionId)}')">Create corrective action</button>`}</div>`;
  if(p?.status==="open")return `<div class="systemic-corrective-actions"><button class="btn" type="button" data-bw-onclick="openControlPreventiveAction('${safeId(p.id)}')">Complete preventive action</button>${replace}</div>`;if(p?.status==="completed"){const pe=p.effectiveness||null,pes=String(pe?.status||"");if(pes==="ready")return `<div class="systemic-corrective-actions"><button class="btn" type="button" data-bw-onclick="openControlPreventiveEffectiveness('${safeId(p.id)}')">Verify preventive effectiveness</button></div>`;if(pes==="monitoring")return `<div class="systemic-corrective-actions"><button class="btn alt" type="button" disabled title="The recovery observation must end before verification">Recovery observation in progress</button>${replace}</div>`;}
  if(c.status==="closed"){if(!e)return `<div class="systemic-corrective-actions"><button class="btn" type="button" data-bw-onclick="openSystemicCorrectiveClosure('${safeId(c.id)}')">Set effectiveness monitoring</button></div>`;if(e?.status==="ready")return `<div class="systemic-corrective-actions"><button class="btn" type="button" data-bw-onclick="openSystemicCorrectiveEffectiveness('${safeId(c.id)}')">Verify effectiveness</button></div>`;if(e?.status==="monitoring")return `<div class="systemic-corrective-actions"><button class="btn alt" type="button" disabled title="Monitoring period must end before an effectiveness pass">Monitoring in progress</button>${replace}</div>`;return replace?`<div class="systemic-corrective-actions">${replace}</div>`:""}
  const canClose=String(x.status)==="closed",close=canClose?`<button class="btn" type="button" data-bw-onclick="openSystemicCorrectiveClosure('${safeId(c.id)}')">Close remediation & start monitoring</button>`:`<button class="btn alt" type="button" disabled title="Close the underlying intervention first">Close intervention first</button>`;return `<div class="systemic-corrective-actions"><button class="btn alt" type="button" data-bw-onclick="openSystemicCorrectiveAction('${safeId(x.interventionId)}')">Update corrective action</button>${close}</div>`;
}
function openControlPreventiveAction(preventiveActionId){
  const item=(executiveExceptionState.accountability?.items||[]).find(x=>String(x.correctiveActionPreventiveAction?.id||x.correctiveAction?.preventiveAction?.id||"")===String(preventiveActionId));if(!item)return;const p=item.correctiveActionPreventiveAction||item.correctiveAction?.preventiveAction;if(!p)return;pendingControlPreventiveAction=item;document.getElementById("controlPreventiveActionTitle").textContent=`Prevent relapse: ${item.title||"verified control"}`;document.getElementById("controlPreventiveActionSummary").safeHTML=`<b>${escapeHtml(p.triggerReason||"Early control drift detected")}</b><br>${escapeHtml(p.preventiveAction||"Review and correct the early drift before it repeats.")}<br><span class="muted small">Target: ${escapeHtml(p.targetDueAt?new Date(p.targetDueAt).toLocaleString():"not recorded")}</span>`;document.getElementById("controlPreventiveEvidence").value="";document.getElementById("controlPreventiveNote").value="";document.getElementById("controlPreventiveAttest").checked=false;document.getElementById("controlPreventiveError").textContent="";openModal("controlPreventiveActionModal");
}
async function submitControlPreventiveAction(){
  const item=pendingControlPreventiveAction,p=item?.correctiveActionPreventiveAction||item?.correctiveAction?.preventiveAction;if(!p?.id)return;const completionEvidence=(document.getElementById("controlPreventiveEvidence")?.value||"").trim(),completionNote=(document.getElementById("controlPreventiveNote")?.value||"").trim(),attestation=!!document.getElementById("controlPreventiveAttest")?.checked,err=document.getElementById("controlPreventiveError"),btn=document.getElementById("controlPreventiveSubmit");if(completionEvidence.length<15){err.textContent="Record preventive evidence or a reference (at least 15 characters).";return}if(completionNote.length<10){err.textContent="Record what was done (at least 10 characters).";return}if(!attestation){err.textContent="Confirm the preventive-action attestation.";return}
  try{btn.disabled=true;btn.textContent="Rechecking…";if(STANDALONE_PREVIEW){p.status="completed";p.completedAt=new Date().toISOString();p.completionEvidence=completionEvidence;p.completionNote=completionNote;p.effectiveness={id:"preview-preventive-effectiveness",status:"monitoring",observationDays:7,observationStartedAt:new Date().toISOString(),observationDueAt:new Date(Date.now()+7*86400000).toISOString(),baselineCounts:p.triggerCounts||{},daysRemaining:7};const s=item.correctiveActionSustainability||item.correctiveAction?.sustainability;if(s){s.warningActive=true;s.warningStartedAt=s.warningStartedAt||new Date().toISOString();s.warningReason="Preventive action completed; effectiveness observation is still required.";s.warningCounts=p.triggerCounts||s.warningCounts||null}item.correctiveActionSustainabilityWarning=true;closeModal("controlPreventiveActionModal");pendingControlPreventiveAction=null;renderExecutiveExceptions();return}
    await apiJson(`/api/executive-control-preventive-actions/${encodeURIComponent(p.id)}/complete`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({completionEvidence,completionNote,attestation:true})});closeModal("controlPreventiveActionModal");pendingControlPreventiveAction=null;await renderExecutiveExceptions()}
  catch(e){const m={control_already_relapsed:"Repeated drift has already crossed the relapse threshold. Open a fresh root-cause corrective action instead.",preventive_action_owned_by_another_manager:"This preventive action is owned by another manager. The account owner can coordinate it."};err.textContent=m[e.message]||e.message||String(e)}finally{btn.disabled=false;btn.textContent="Record preventive completion"}
}
function openControlReplacementGovernance(interventionId){const item=findAccountabilityItem(interventionId);if(!item)return;pendingControlReplacementGovernance=item;const g=item.correctiveActionReplacementGovernance||{};document.getElementById("controlReplacementGovernanceTitle").textContent=g.id?"Update control replacement plan":"Plan control replacement";document.getElementById("controlReplacementRetiredControl").value=g.retiredControl||"";document.getElementById("controlReplacementNewControl").value=g.replacementControl||"";document.getElementById("controlReplacementStrongerReason").value=g.strongerReason||"";document.getElementById("controlReplacementTransitionRisk").value=g.transitionRisk||"";document.getElementById("controlReplacementTransitionMitigation").value=g.transitionMitigation||"";document.getElementById("controlReplacementDue").value=g.implementationDueAt?new Date(g.implementationDueAt).toISOString().slice(0,16):"";document.getElementById("controlReplacementGovernanceAttest").checked=false;document.getElementById("controlReplacementGovernanceError").textContent="";openModal("controlReplacementGovernanceModal")}
async function submitControlReplacementGovernance(){const item=pendingControlReplacementGovernance,p=item?.correctiveActionPreventivePattern;if(!p?.id)return;const retiredControl=(document.getElementById("controlReplacementRetiredControl")?.value||"").trim(),replacementControl=(document.getElementById("controlReplacementNewControl")?.value||"").trim(),strongerReason=(document.getElementById("controlReplacementStrongerReason")?.value||"").trim(),transitionRisk=(document.getElementById("controlReplacementTransitionRisk")?.value||"").trim(),transitionMitigation=(document.getElementById("controlReplacementTransitionMitigation")?.value||"").trim(),rawDue=document.getElementById("controlReplacementDue")?.value||"",attestation=!!document.getElementById("controlReplacementGovernanceAttest")?.checked,err=document.getElementById("controlReplacementGovernanceError"),btn=document.getElementById("controlReplacementGovernanceSubmit");if(retiredControl.length<15){err.textContent="Identify the weak control being retired (at least 15 characters).";return}if(replacementControl.length<15){err.textContent="Describe the replacement control (at least 15 characters).";return}if(strongerReason.length<20){err.textContent="Explain why the replacement is materially stronger (at least 20 characters).";return}if(transitionRisk.length<10||transitionMitigation.length<10){err.textContent="Record the transition risk and mitigation (at least 10 characters each).";return}if(!rawDue||Date.parse(rawDue)<=Date.now()){err.textContent="Choose a future implementation target.";return}if(!attestation){err.textContent="Confirm the replacement-governance attestation.";return}try{btn.disabled=true;btn.textContent="Recording…";if(STANDALONE_PREVIEW){item.correctiveActionReplacementGovernance={id:"preview-replacement-governance",preventivePatternId:p.id,interventionId:item.interventionId,status:"planned",retiredControl,replacementControl,strongerReason,transitionRisk,transitionMitigation,ownerName:"Preview owner",implementationDueAt:new Date(rawDue).toISOString()};closeModal("controlReplacementGovernanceModal");renderExecutiveExceptions();return}await apiJson("/api/executive-control-replacement-governance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({preventivePatternId:p.id,retiredControl,replacementControl,strongerReason,transitionRisk,transitionMitigation,implementationDueAt:new Date(rawDue).toISOString(),attestation:true})});closeModal("controlReplacementGovernanceModal");pendingControlReplacementGovernance=null;await renderExecutiveExceptions()}catch(e){err.textContent=e.message||String(e)}finally{btn.disabled=false;btn.textContent="Record replacement plan"}}
function openControlReplacementRetirement(governanceId){const item=(executiveExceptionState.accountability?.items||[]).find(x=>String(x.correctiveActionReplacementGovernance?.id||"")===String(governanceId));if(!item)return;pendingControlReplacementRetirement=item;document.getElementById("controlReplacementRetirementEvidence").value="";document.getElementById("controlReplacementRetirementNote").value="";document.getElementById("controlReplacementRetirementAttest").checked=false;document.getElementById("controlReplacementRetirementError").textContent="";openModal("controlReplacementRetirementModal")}
async function submitControlReplacementRetirement(){const item=pendingControlReplacementRetirement,g=item?.correctiveActionReplacementGovernance;if(!g?.id)return;const retirementEvidence=(document.getElementById("controlReplacementRetirementEvidence")?.value||"").trim(),retirementNote=(document.getElementById("controlReplacementRetirementNote")?.value||"").trim(),attestation=!!document.getElementById("controlReplacementRetirementAttest")?.checked,err=document.getElementById("controlReplacementRetirementError"),btn=document.getElementById("controlReplacementRetirementSubmit");if(retirementEvidence.length<15){err.textContent="Record old-control retirement evidence (at least 15 characters).";return}if(retirementNote.length<10){err.textContent="Record how reliance on the old control ended (at least 10 characters).";return}if(!attestation){err.textContent="Confirm that the old weak control is no longer relied upon.";return}try{btn.disabled=true;btn.textContent="Recording…";if(STANDALONE_PREVIEW){g.status="retired";g.retirementEvidence=retirementEvidence;g.retirementNote=retirementNote;g.retiredAt=new Date().toISOString();closeModal("controlReplacementRetirementModal");renderExecutiveExceptions();return}await apiJson(`/api/executive-control-replacement-governance/${encodeURIComponent(g.id)}/retire`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({retirementEvidence,retirementNote,attestation:true})});closeModal("controlReplacementRetirementModal");pendingControlReplacementRetirement=null;await renderExecutiveExceptions()}catch(e){err.textContent=e.message||String(e)}finally{btn.disabled=false;btn.textContent="Record retirement proof"}}
function findAccountabilityItem(interventionId){return (executiveExceptionState.accountability?.items||[]).find(x=>String(x.interventionId)===String(interventionId))}
function openSystemicCorrectiveAction(interventionId){
  const item=findAccountabilityItem(interventionId);if(!item)return;pendingSystemicCorrective=item;const c=item.correctiveAction?.status==="open"?item.correctiveAction:null;
  document.getElementById("systemicCorrectiveActionTitle").textContent=c?"Update root-cause corrective action":"Open root-cause corrective action";document.getElementById("systemicCorrectiveRootCause").value=c?.rootCause||"";document.getElementById("systemicCorrectiveActionText").value=c?.correctiveAction||"";document.getElementById("systemicCorrectiveTargetDue").value=c?.targetDueAt?new Date(c.targetDueAt).toISOString().slice(0,16):"";document.getElementById("systemicCorrectiveExtensionReason").value="";document.getElementById("systemicCorrectiveAttest").checked=false;document.getElementById("systemicCorrectiveError").textContent="";openModal("systemicCorrectiveActionModal");
}
async function submitSystemicCorrectiveAction(){
  const item=pendingSystemicCorrective;if(!item)return;const rootCause=(document.getElementById("systemicCorrectiveRootCause")?.value||"").trim(),correctiveAction=(document.getElementById("systemicCorrectiveActionText")?.value||"").trim(),rawDue=document.getElementById("systemicCorrectiveTargetDue")?.value||"",extensionReason=(document.getElementById("systemicCorrectiveExtensionReason")?.value||"").trim(),attestation=!!document.getElementById("systemicCorrectiveAttest")?.checked,err=document.getElementById("systemicCorrectiveError"),btn=document.getElementById("systemicCorrectiveSubmit");
  if(rootCause.length<20){err.textContent="Record the root cause in enough detail (at least 20 characters).";return}if(correctiveAction.length<20){err.textContent="Record the concrete corrective action (at least 20 characters).";return}if(!rawDue||!Number.isFinite(Date.parse(rawDue))||Date.parse(rawDue)<=Date.now()){err.textContent="Choose a future corrective-action target.";return}if(!attestation){err.textContent="Confirm the corrective-action attestation.";return}
  try{btn.disabled=true;btn.textContent="Recording…";if(STANDALONE_PREVIEW){item.correctiveAction={id:item.correctiveAction?.id||"preview-corrective",interventionId:item.interventionId,status:"open",ownerName:item.ownerName||"Preview owner",rootCause,correctiveAction,targetDueAt:new Date(rawDue).toISOString(),targetExtensionCount:item.correctiveAction?.targetExtensionCount||0,openedAt:new Date().toISOString(),overdue:false};item.correctiveActionRequired=false;closeModal("systemicCorrectiveActionModal");renderExecutiveExceptions();return}
    await apiJson("/api/executive-corrective-actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({interventionId:item.interventionId,rootCause,correctiveAction,targetDueAt:new Date(rawDue).toISOString(),extensionReason,attestation:true})});closeModal("systemicCorrectiveActionModal");pendingSystemicCorrective=null;await renderExecutiveExceptions()}
  catch(e){const m={replacement_governance_required:"Plan and attest the control replacement before opening the replacement corrective action.",replacement_governance_owned_by_another_manager:"This control replacement is owned by another manager. The account owner can coordinate it.",corrective_target_extension_owner_only:"Only the account owner can extend a corrective-action target.",corrective_target_extension_limit:"This corrective-action target has already been extended once. Record progress or escalate the root cause instead of extending it again.",corrective_target_extension_reason_required:"Record why the corrective-action target must be extended.",intervention_owned_by_another_manager:"This recurring intervention is owned by another manager. The account owner can coordinate the corrective action."};err.textContent=m[e.message]||e.message||String(e)}finally{btn.disabled=false;btn.textContent="Record corrective action"}
}
function openSystemicCorrectiveClosure(correctiveActionId){
  const item=(executiveExceptionState.accountability?.items||[]).find(x=>String(x.correctiveAction?.id||"")===String(correctiveActionId));if(!item)return;pendingSystemicCorrectiveClose=item;const alreadyClosed=item.correctiveAction?.status==="closed";document.getElementById("systemicCorrectiveCloseTitle").textContent=alreadyClosed?`Set effectiveness monitoring: ${item.title||"recurring intervention pattern"}`:`Close corrective action: ${item.title||"recurring intervention pattern"}`;document.getElementById("systemicCorrectiveClosureEvidence").value=alreadyClosed?(item.correctiveAction?.closureEvidence||"Previously recorded remediation closure evidence."):"";document.getElementById("systemicCorrectiveClosureNote").value=alreadyClosed?(item.correctiveAction?.closureNote||"Previously recorded corrective-action closure."):"";document.getElementById("systemicCorrectiveSuccessCriteria").value="";document.getElementById("systemicCorrectiveMonitoringDays").value="30";document.getElementById("systemicCorrectiveCloseAttest").checked=false;document.getElementById("systemicCorrectiveCloseError").textContent="";openModal("systemicCorrectiveCloseModal");
}
async function submitSystemicCorrectiveClosure(){
  const item=pendingSystemicCorrectiveClose,c=item?.correctiveAction;if(!c?.id)return;const closureEvidence=(document.getElementById("systemicCorrectiveClosureEvidence")?.value||"").trim(),closureNote=(document.getElementById("systemicCorrectiveClosureNote")?.value||"").trim(),successCriteria=(document.getElementById("systemicCorrectiveSuccessCriteria")?.value||"").trim(),monitoringDays=Number(document.getElementById("systemicCorrectiveMonitoringDays")?.value||0),attestation=!!document.getElementById("systemicCorrectiveCloseAttest")?.checked,err=document.getElementById("systemicCorrectiveCloseError"),btn=document.getElementById("systemicCorrectiveCloseSubmit");
  if(closureEvidence.length<15){err.textContent="Record remediation evidence or a reference (at least 15 characters).";return}if(closureNote.length<10){err.textContent="Record what changed (at least 10 characters).";return}if(successCriteria.length<20){err.textContent="Define objective effectiveness success criteria (at least 20 characters).";return}if(!Number.isInteger(monitoringDays)||monitoringDays<14||monitoringDays>90){err.textContent="Choose a monitoring period from 14 to 90 days.";return}if(!attestation){err.textContent="Confirm the corrective-action closure attestation.";return}
  try{btn.disabled=true;btn.textContent="Verifying…";if(STANDALONE_PREVIEW){c.status="closed";c.closedAt=new Date().toISOString();c.closureEvidence=closureEvidence;c.closureNote=closureNote;c.effectiveness={id:"preview-effectiveness",status:"monitoring",monitoringDays,monitoringStartedAt:new Date().toISOString(),monitoringDueAt:new Date(Date.now()+monitoringDays*86400000).toISOString(),successCriteria,stabilized:false};item.correctiveActionEffectiveness=c.effectiveness;item.correctiveActionResolved=true;item.correctiveActionStabilized=false;closeModal("systemicCorrectiveCloseModal");renderExecutiveExceptions();return}
    await apiJson(`/api/executive-corrective-actions/${encodeURIComponent(c.id)}/close`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({closureEvidence,closureNote,successCriteria,monitoringDays,attestation:true})});closeModal("systemicCorrectiveCloseModal");pendingSystemicCorrectiveClose=null;await renderExecutiveExceptions()}
  catch(e){err.textContent=e.message==="underlying_intervention_not_closed"?"Close the underlying leadership intervention first. Corrective-action closure must follow genuine resolution of the exception.":(e.message||String(e))}finally{btn.disabled=false;btn.textContent="Verify & close corrective action"}
}
function openSystemicCorrectiveEffectiveness(correctiveActionId){
  const item=(executiveExceptionState.accountability?.items||[]).find(x=>String(x.correctiveAction?.id||"")===String(correctiveActionId));if(!item)return;pendingSystemicCorrectiveEffectiveness=item;document.getElementById("systemicCorrectiveEffectivenessTitle").textContent=`Verify effectiveness: ${item.title||"systemic corrective action"}`;document.getElementById("systemicCorrectiveEffectivenessOutcome").value="pass";document.getElementById("systemicCorrectiveEffectivenessEvidence").value="";document.getElementById("systemicCorrectiveEffectivenessNote").value="";document.getElementById("systemicCorrectiveEffectivenessAttest").checked=false;document.getElementById("systemicCorrectiveEffectivenessError").textContent="";openModal("systemicCorrectiveEffectivenessModal");
}
async function submitSystemicCorrectiveEffectiveness(){
  const item=pendingSystemicCorrectiveEffectiveness,c=item?.correctiveAction;if(!c?.id)return;const outcome=document.getElementById("systemicCorrectiveEffectivenessOutcome")?.value||"",verificationEvidence=(document.getElementById("systemicCorrectiveEffectivenessEvidence")?.value||"").trim(),verificationNote=(document.getElementById("systemicCorrectiveEffectivenessNote")?.value||"").trim(),attestation=!!document.getElementById("systemicCorrectiveEffectivenessAttest")?.checked,err=document.getElementById("systemicCorrectiveEffectivenessError"),btn=document.getElementById("systemicCorrectiveEffectivenessSubmit");
  if(verificationEvidence.length<15){err.textContent="Record objective monitoring evidence or a reference (at least 15 characters).";return}if(verificationNote.length<10){err.textContent="Explain the observed result (at least 10 characters).";return}if(!attestation){err.textContent="Confirm the effectiveness verification attestation.";return}
  try{btn.disabled=true;btn.textContent="Verifying…";if(STANDALONE_PREVIEW){const e=c.effectiveness||item.correctiveActionEffectiveness||{};e.status=outcome==="pass"?"passed":"failed";e.verificationEvidence=verificationEvidence;e.verificationNote=verificationNote;e.verifiedAt=new Date().toISOString();e.stabilized=outcome==="pass";c.effectiveness=e;item.correctiveActionEffectiveness=e;item.correctiveActionStabilized=outcome==="pass";if(outcome==="pass"){const s={id:"preview-sustainability",status:"watching",watchDays:90,watchStartedAt:new Date().toISOString(),watchDueAt:new Date(Date.now()+90*86400000).toISOString(),daysRemaining:90,sustained:false,relapsed:false};c.sustainability=s;item.correctiveActionSustainability=s}else{item.correctiveAction=null;item.correctiveActionRequired=true;item.correctiveActionEffectivenessFailed=true}closeModal("systemicCorrectiveEffectivenessModal");renderExecutiveExceptions();return}
    await apiJson(`/api/executive-corrective-actions/${encodeURIComponent(c.id)}/effectiveness`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({outcome,verificationEvidence,verificationNote,attestation:true})});closeModal("systemicCorrectiveEffectivenessModal");pendingSystemicCorrectiveEffectiveness=null;await renderExecutiveExceptions()}
  catch(e){const m={effectiveness_monitoring_period_not_complete:"The monitoring period has not ended. Continue observing the control before recording an effectiveness pass.",corrective_action_owned_by_another_manager:"This corrective action is owned by another manager. The account owner can coordinate verification."};err.textContent=m[e.message]||e.message||String(e)}finally{btn.disabled=false;btn.textContent="Record effectiveness decision"}
}
function openExecutiveIntervention(encodedKey){
  const key=decodeURIComponent(String(encodedKey||"")),item=(executiveExceptionState.items||[]).find(x=>String(x.key)===key);if(!item)return;
  pendingExecutiveIntervention=item;document.getElementById("executiveInterventionTitle").textContent=item.intervention?"Update leadership intervention":"Record leadership intervention";
  document.getElementById("executiveInterventionDecision").value=item.intervention?.decision||"";document.getElementById("executiveInterventionNote").value=item.intervention?.decisionNote||"";document.getElementById("executiveInterventionDue").value=item.intervention?.recoveryDueAt?new Date(item.intervention.recoveryDueAt).toISOString().slice(0,16):"";
  document.getElementById("executiveInterventionAttest").checked=false;document.getElementById("executiveInterventionError").textContent="";openModal("executiveInterventionModal");
}
async function submitExecutiveIntervention(){
  const item=pendingExecutiveIntervention;if(!item)return;const decision=(document.getElementById("executiveInterventionDecision")?.value||"").trim(),note=(document.getElementById("executiveInterventionNote")?.value||"").trim(),rawDue=document.getElementById("executiveInterventionDue")?.value||"",attestation=!!document.getElementById("executiveInterventionAttest")?.checked,err=document.getElementById("executiveInterventionError"),btn=document.getElementById("executiveInterventionSubmit");
  if(decision.length<6){err.textContent="Record the management decision (at least 6 characters).";return}if(note.length<10){err.textContent="Record why leadership is intervening (at least 10 characters).";return}if(!rawDue||!Number.isFinite(Date.parse(rawDue))||Date.parse(rawDue)<=Date.now()){err.textContent="Choose a future recovery deadline.";return}if(!attestation){err.textContent="Confirm responsibility for the intervention.";return}
  try{btn.disabled=true;btn.textContent="Recording…";if(STANDALONE_PREVIEW){item.intervention={id:item.intervention?.id||"preview-intervention",status:"claimed",ownerName:"Preview owner",decision,decisionNote:note,recoveryDueAt:new Date(rawDue).toISOString(),openedAt:new Date().toISOString(),overdue:false};closeModal("executiveInterventionModal");renderExecutiveExceptions();return}
    await apiJson("/api/executive-interventions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({exceptionKey:item.key,decision,note,recoveryDueAt:new Date(rawDue).toISOString(),attestation:true})});closeModal("executiveInterventionModal");pendingExecutiveIntervention=null;await Promise.allSettled([renderExecutiveExceptions(),renderHomeDecisionCenter?.(),renderWorkHub?.()])}
  catch(e){err.textContent=e.message||String(e)}finally{btn.disabled=false;btn.textContent="Record intervention"}
}
function openExecutiveInterventionProgress(id){
  const item=(executiveExceptionState.items||[]).find(x=>String(x.intervention?.id||"")===String(id));if(!item)return;pendingExecutiveInterventionProgress=item;const i=item.intervention||{};
  document.getElementById("executiveInterventionProgressTitle").textContent=`Progress: ${item.title||"leadership intervention"}`;document.getElementById("executiveInterventionProgressStatus").value=["on_track","at_risk","blocked"].includes(i.progressStatus)?i.progressStatus:"on_track";document.getElementById("executiveInterventionProgressNote").value=i.progressNote||"";document.getElementById("executiveInterventionProgressError").textContent="";openModal("executiveInterventionProgressModal");
}
async function submitExecutiveInterventionProgress(){
  const item=pendingExecutiveInterventionProgress,id=item?.intervention?.id;if(!id)return;const progressStatus=document.getElementById("executiveInterventionProgressStatus")?.value||"",progressNote=(document.getElementById("executiveInterventionProgressNote")?.value||"").trim(),err=document.getElementById("executiveInterventionProgressError"),btn=document.getElementById("executiveInterventionProgressSubmit");
  if(progressNote.length<10){err.textContent="Record a meaningful progress note (at least 10 characters).";return}
  try{btn.disabled=true;btn.textContent="Recording…";if(STANDALONE_PREVIEW){item.intervention.progressStatus=progressStatus;item.intervention.progressNote=progressNote;item.intervention.progressUpdatedAt=new Date().toISOString();item.intervention.followThrough={...(item.intervention.followThrough||{}),blocked:progressStatus==="blocked",atRisk:progressStatus==="at_risk",noProgress:false,needsAttention:["blocked","at_risk"].includes(progressStatus),level:["blocked","at_risk"].includes(progressStatus)?"high":"none",reasons:progressStatus==="blocked"?["Progress checkpoint is blocked"]:progressStatus==="at_risk"?["Progress checkpoint is at risk"]:[]};closeModal("executiveInterventionProgressModal");renderExecutiveExceptions();return}
    await apiJson(`/api/executive-interventions/${encodeURIComponent(id)}/progress`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({progressStatus,progressNote})});closeModal("executiveInterventionProgressModal");pendingExecutiveInterventionProgress=null;await Promise.allSettled([renderExecutiveExceptions(),renderHomeDecisionCenter?.()])}
  catch(e){err.textContent=e.message==="intervention_owned_by_another_manager"?"This intervention is owned by another manager. The account owner can coordinate reassignment.":(e.message||String(e))}finally{btn.disabled=false;btn.textContent="Record checkpoint"}
}
function openExecutiveInterventionClosure(id){
  const item=(executiveExceptionState.items||[]).find(x=>String(x.intervention?.id||"")===String(id));if(!item)return;pendingExecutiveInterventionClose=item;
  document.getElementById("executiveInterventionCloseTitle").textContent=`Close: ${item.title||"leadership intervention"}`;document.getElementById("executiveInterventionClosureEvidence").value="";document.getElementById("executiveInterventionClosureNote").value="";document.getElementById("executiveInterventionCloseAttest").checked=false;document.getElementById("executiveInterventionCloseError").textContent="";openModal("executiveInterventionCloseModal");
}
async function submitExecutiveInterventionClosure(){
  const item=pendingExecutiveInterventionClose,id=item?.intervention?.id;if(!id)return;const closureEvidence=(document.getElementById("executiveInterventionClosureEvidence")?.value||"").trim(),closureNote=(document.getElementById("executiveInterventionClosureNote")?.value||"").trim(),attestation=!!document.getElementById("executiveInterventionCloseAttest")?.checked,err=document.getElementById("executiveInterventionCloseError"),btn=document.getElementById("executiveInterventionCloseSubmit");
  if(closureEvidence.length<10){err.textContent="Record the closure evidence or reference (at least 10 characters).";return}if(closureNote.length<10){err.textContent="Record a closure note (at least 10 characters).";return}if(!attestation){err.textContent="Confirm the closure attestation.";return}
  try{btn.disabled=true;btn.textContent="Verifying…";if(STANDALONE_PREVIEW){executiveExceptionState.items=(executiveExceptionState.items||[]).filter(x=>String(x.intervention?.id||"")!==String(id));closeModal("executiveInterventionCloseModal");renderExecutiveExceptions();return}
    await apiJson(`/api/executive-interventions/${encodeURIComponent(id)}/close`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({closureEvidence,closureNote,attestation:true})});closeModal("executiveInterventionCloseModal");pendingExecutiveInterventionClose=null;await Promise.allSettled([renderExecutiveExceptions(),renderHomeDecisionCenter?.(),renderWorkHub?.()])}
  catch(e){err.textContent=e.message==="underlying_exception_still_open"?"The underlying exception is still open. Correct the source problem before closing this intervention.":(e.message||String(e))}finally{btn.disabled=false;btn.textContent="Verify & close"}
}
async function renderExecutiveExceptions(){
  const card=document.getElementById("executiveExceptionCard"),allowed=["owner","manager"].includes(currentWorkspaceRole());if(card)card.hidden=!allowed;if(!allowed)return;
  const list=document.getElementById("executiveExceptionList"),set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};if(!list)return;
  try{const r=await apiJson("/api/executive-exceptions");executiveExceptionState=r||{items:[],counts:{},policy:{},accountability:{items:[],counts:{},policy:{}}};const items=r.items||[],c=r.counts||{},accountability=r.accountability||{items:[],counts:{},policy:{}};set("execExceptionTotal",Number(c.total||0));set("execExceptionCritical",Number(c.critical||0));set("execExceptionReview",Number(c.reviewBottlenecks||0));set("execExceptionInterventions",Number(c.activeInterventions||0));set("execExceptionFollowup",Number(c.followThroughAttention||0));set("execExceptionReady",Number(c.readyToClose||0));set("execAccountabilityCount",Number(accountability.counts?.patterns||0));set("execCorrectiveRequired",Number(accountability.counts?.correctiveActionsRequired||0));
    list.safeHTML=items.length?items.map(x=>`<div class="executive-exception-row ${escapeHtml(x.severity||'warning')}"><div><b>${escapeHtml(x.title||'Management exception')}</b><small>${escapeHtml(x.detail||'Leadership intervention is required.')}</small><span class="badge ${x.severity==='critical'?'bad':x.severity==='high'?'warn':''}">${escapeHtml(String(x.severity||'warning').replaceAll('_',' '))}</span>${executiveInterventionSummary(x)}</div><div>${executiveInterventionActions(x)}</div></div>`).join(""):'<div class="notice good"><b>No leadership exception is currently returned.</b><div class="small">Routine work can still be open. This is not a legal all-clear; use Today and Work & deadlines for the full operating queue.</div></div>';
    const accountabilityList=document.getElementById("executiveAccountabilityList"),patterns=accountability.items||[];if(accountabilityList)accountabilityList.safeHTML=patterns.length?patterns.map(x=>`<div class="executive-accountability-row ${escapeHtml(x.severity||'high')}"><b>${escapeHtml(x.title||'Leadership intervention')}</b><small>${escapeHtml(x.ownerName||'Recorded management owner')} · ${escapeHtml(String(x.status||'recorded').replaceAll('_',' '))} · recurring execution pattern</small><div class="pattern-tags">${(x.patterns||[]).map(p=>`<span>${escapeHtml(p.label||p.kind||'pattern')}</span>`).join("")}</div>${systemicCorrectiveSummary(x)}${systemicCorrectiveActions(x)}</div>`).join(""):'<div class="notice good"><b>No recurring intervention pattern is currently detected.</b><div class="small">This is not an employee-performance score or a legal all-clear. It only means no intervention crossed the configured repeat-pattern thresholds in the 180-day lookback.</div></div>';
  }catch(e){set("execExceptionTotal","—");set("execExceptionCritical","—");set("execExceptionReview","—");set("execExceptionInterventions","—");set("execExceptionFollowup","—");set("execExceptionReady","—");set("execAccountabilityCount","—");set("execCorrectiveRequired","—");const accountabilityList=document.getElementById("executiveAccountabilityList");if(accountabilityList)accountabilityList.safeHTML='<div class="notice bad"><b>Accountability pattern check unavailable · corrective-action / effectiveness / sustainability / relapse-prevention / preventive-effectiveness check unavailable · control-replacement governance check unavailable</b><div class="small">Do not infer that recurring execution problems are absent. Do not infer that required corrective actions, effectiveness checks, early-warning preventive actions, preventive-effectiveness checks or sustainability relapses are absent. Do not infer that required control-replacement governance is absent.</div></div>';list.safeHTML=`<div class="notice bad"><b>Leadership exception queue unavailable</b><div class="small">${escapeHtml(e.message||String(e))}. Do not assume overdue or high-risk exceptions are clear.</div><button class="btn alt" type="button" style="margin-top:8px" data-bw-onclick="renderExecutiveExceptions()">Retry</button></div>`}
}
async function renderWorkHub(){
  if(!roleCanView("workhub"))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value},reviewAllowed=["owner","manager","reviewer"].includes(currentWorkspaceRole()),auditAllowed=["owner","manager","reviewer","auditor"].includes(currentWorkspaceRole());document.querySelectorAll(".review-role-only").forEach(x=>x.hidden=!reviewAllowed);document.querySelectorAll(".audit-role-only").forEach(x=>x.hidden=!auditAllowed);
  try{
    const [o,calendar,impacts]=await Promise.all([apiJson("/api/obligations"),apiJson("/api/statutory-calendar"),apiJson("/api/regulatory/impacts")]);
    const items=o.items||[],open=items.filter(x=>!["completed","not_applicable"].includes(x.status));
    const now=Date.now(),dueSoon=open.filter(x=>x.due_at&&new Date(x.due_at).getTime()>now&&new Date(x.due_at).getTime()-now<=30*86400000);
    const dated=(calendar.obligations||[]).filter(x=>x.due_at&&new Date(x.due_at).getTime()>=now).sort((a,b)=>new Date(a.due_at)-new Date(b.due_at));
    const next=dated[0]||null,review=(impacts.items||[]).filter(x=>["pending","review"].includes(String(x.status||"").toLowerCase())||["urgent","action"].includes(String(x.impact_level||"").toLowerCase()));
    set("workOpenActions",open.length);set("workDueSoon",dueSoon.length);set("workNextDeadline",next?new Date(next.due_at).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"None set");set("workRuleImpacts",review.length);
    set("workActionDetail",open.length?`${open.length} open obligation${open.length===1?"":"s"}; ${dueSoon.length} due within 30 days.`:"No open generated obligation is currently recorded.");
    set("workDeadlineDetail",next?`Next recorded statutory due date: ${new Date(next.due_at).toLocaleDateString()}. Verify the underlying source and business facts before filing.`:"No future statutory due date is currently generated. Review schedule setup for missing inputs.");
    set("workRuleDetail",review.length?`${review.length} recorded rule impact${review.length===1?"":"s"} need review or are marked action/urgent.`:"No current rule impact is flagged for review or action.");
  }catch(e){["workOpenActions","workDueSoon","workNextDeadline","workRuleImpacts"].forEach(id=>set(id,"—"));set("workActionDetail","Status unavailable. Open actions to inspect the authoritative records directly.");set("workDeadlineDetail","Deadline summary unavailable. Open the calendar before relying on a due-date conclusion.");set("workRuleDetail","Rule-impact summary unavailable. Open rule updates for the authoritative status.")}
  if(reviewAllowed){await renderManagementReviewInbox();await renderManagementReReview();}
  if(auditAllowed)await renderManagementReviewAudit();
}
async function renderTenderHub(){
  if(!roleCanView("tenderhub")||!["owner","manager"].includes(currentWorkspaceRole()))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  try{
    const r=await apiJson("/api/tenders"),items=r.items||[],now=Date.now();
    const active=items.filter(x=>String(x.status||"watching").toLowerCase()!=="closed"),soon=active.filter(x=>x.closing_at&&new Date(x.closing_at).getTime()>now&&new Date(x.closing_at).getTime()-now<=14*86400000);
    set("tenderHubTracked",active.length);set("tenderHubClosingSoon",soon.length);set("tenderHubApplicability",state?.profile?.tender?"Enabled":"Not enabled");
    set("tenderHubTrackingDetail",active.length?`${active.length} active tender workspace${active.length===1?"":"s"}${soon.length?`; ${soon.length} close within 14 days.`:"; none close within 14 days."}`:"No active tender workspace is recorded. Add only opportunities the business is actually pursuing.");
    set("tenderHubReadinessDetail","Use the evidence checklist as a reusable baseline, then verify the issuing authority’s current tender-specific requirements before submission.");
  }catch(e){set("tenderHubTracked","—");set("tenderHubClosingSoon","—");set("tenderHubApplicability",state?.profile?.tender?"Enabled":"Not enabled");set("tenderHubTrackingDetail","Tender status unavailable. Open the tender workspace before relying on closing-date information.")}
}
async function renderAutomationHub(){
  if(!roleCanView("automationhub")||!["owner","manager"].includes(currentWorkspaceRole()))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  try{
    const [workflows,schedules,notifications,credits]=await Promise.all([apiJson("/api/workflow-rules"),apiJson("/api/compliance-schedules"),apiJson("/api/notifications"),apiJson("/api/ai/credits")]);
    const active=(workflows.items||[]).filter(x=>Number(x.enabled)!==0).length,enabled=(schedules.items||[]).filter(x=>Number(x.enabled)!==0).length,queued=(notifications.items||[]).filter(x=>["queued","pending","retry"].includes(String(x.status||"").toLowerCase())).length,balance=Number(credits.wallet?.balance||0);
    set("automationWorkflowCount",active);set("automationScheduleCount",enabled);set("automationQueuedCount",queued);set("automationCreditBalance",balance);
    set("automationAiDetail",`${balance} AI credit${balance===1?"":"s"} available. Copilot remains read-only and grounded to permitted workspace context.`);
    set("automationReminderDetail",queued?`${queued} reminder${queued===1?" is":"s are"} queued or awaiting retry. Delivery status remains explicit.`:"No reminder is currently queued or awaiting retry.");
    set("automationScheduleDetail",enabled?`${enabled} recurring compliance schedule${enabled===1?" is":"s are"} enabled.`:"No recurring compliance schedule is currently enabled.");
  }catch(e){["automationWorkflowCount","automationScheduleCount","automationQueuedCount","automationCreditBalance"].forEach(id=>set(id,"—"));set("automationAiDetail","Automation summary unavailable. Open the underlying tool before relying on its current status.")}
}
async function renderSettingsHub(){
  if(!roleCanView("accounthub"))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  try{
    const [sessions,social]=await Promise.all([apiJson("/api/account/sessions"),apiJson("/api/account/social")]);
    const count=(sessions.items||[]).length,linked=(social.google?.linked?1:0)+(social.facebook?.linked?1:0);
    set("settingsActiveSessions",count);set("settingsLinkedMethods",linked);set("settingsSecurityDetail",`${count} active session${count===1?"":"s"} recorded for this account.`);set("settingsSignInDetail",`${linked} linked social sign-in${linked===1?"":"s"}. Email/password access remains separate from workspace role permissions.`);
    if(roleCanView("billing")){
      try{const billing=await apiJson("/api/billing/status");set("settingsPlanStatus",billing.status||"Unknown");set("settingsBillingDetail",`${billing.plan||"Current"} plan · ${billing.status||"status unavailable"}. Payment return pages do not settle invoices without verified provider confirmation.`)}catch(_){set("settingsPlanStatus","Unavailable");set("settingsBillingDetail","Billing status unavailable. Open Plan & billing before making a subscription decision.")}
    }
  }catch(e){set("settingsActiveSessions","—");set("settingsLinkedMethods","—");set("settingsSecurityDetail","Account security summary unavailable. Open Account security to inspect the current session list.")}
}

function renderAll(){
 const s=scoreData(),a=applicable();
 document.getElementById("companyHero").textContent=state.profile.name;
 ["complianceScore","protectionScore"].forEach((id,i)=>{let v=i?s.prot:s.comp;let el=document.getElementById(id);el.textContent=v;el.className="score "+(v>=85?"good":v>=70?"warn":"bad")});
 document.getElementById("complianceBar").style.width=s.comp+"%";document.getElementById("protectionBar").style.width=s.prot+"%";
 animateNumber(document.getElementById("openActions"),s.open);document.getElementById("navAlerts").textContent=s.open;let ac=document.getElementById("attentionCount");if(ac)ac.textContent=sourceConflicts.length?`${sourceConflicts.length} source conflict${sourceConflicts.length===1?"":"s"}`:(s.open?`${s.open} to review`:"No local gaps");
 {const evMetric=document.getElementById("evidenceCoverage"),evCaption=document.getElementById("evidenceMetricCaption");if(STANDALONE_PREVIEW){const reviewed=(state.evidence||[]).filter(e=>e.verified).length;evMetric.textContent=Math.min(100,Math.round(reviewed/(a.length||1)*100))+"%";if(evCaption)evCaption.textContent="Preview estimate · local reviewed metadata only"}else{evMetric.textContent="—";if(evCaption)evCaption.textContent="Waiting for server assurance"}}
 let priority=a.filter(r=>/Action required|gaps|due|verify/i.test(r.status())).slice(0,5);
 document.getElementById("priorityList").safeHTML=priority.length?priority.map(r=>`<div class="item"><div class="between row"><b>${escapeHtml(r.title)}</b><span class="badge ${riskClass(r.risk)}">${escapeHtml(r.risk)}</span></div><div class="muted small">${escapeHtml(r.status())}</div></div>`).join(""):`<div class="notice good">No urgent actions detected in this demo rule pack.</div>`;
 let areas=[...new Set(a.map(x=>x.area))];
 document.getElementById("areaScores").safeHTML=areas.map(area=>{let ar=a.filter(x=>x.area===area), issues=ar.filter(x=>/Action required|gaps|due|verify/i.test(x.status())).length;let sc=Math.max(55,100-issues*18);let band=sc>=85?"Strong":sc>=70?"Watch":"Needs action";return `<div class="area-health-row"><div class="area-mini-ring" style="--ring-value:${sc}" role="img" aria-label="${escapeHtml(area)} ${sc} percent"><div>${sc}<span>%</span></div></div><div class="area-health-copy"><b>${escapeHtml(area)}</b><div class="muted small">${band}${issues?` · ${issues} item${issues===1?"":"s"} to review`:" · no immediate gaps"}</div></div><button class="area-arrow" type="button" data-bw-onclick="showView('obligations')" aria-label="Review ${escapeHtml(area)} obligations">→</button></div>`}).join("");
 applyRoleUi();
 const shouldRender=view=>{if(!roleCanView(view))return false;const target=document.getElementById(view),active=!!target?.classList.contains("active"),coldLanding=window.__THEBE_WORKSPACE_READY__!==true&&view===roleLandingView(currentUser?.role);return active||coldLanding};const run=(view,fn)=>{if(!shouldRender(view)||typeof fn!=="function")return;try{const result=fn();if(result&&typeof result.catch==="function")result.catch(error=>reportClientError(error,`render:${view}`))}catch(error){reportClientError(error,`render:${view}`)}};
 if(shouldRender("dashboard")){renderGlobalConflict();setupProgress();renderDeadlines();renderOnboardingBanner();if(document.getElementById("dashboard")?.classList.contains("active")){renderDailyOperatingBrief();if(["owner","manager"].includes(currentWorkspaceRole()))renderExecutiveExceptions()}}
 run("security",renderSecurity);run("obligations",renderObligations);run("calendar",renderCalendar);run("workhub",renderWorkHub);run("peopleops",renderPeopleOperationsHub);run("peopleops",renderPeopleReportingSetup);run("businesshub",renderBusinessHub);run("evidencehub",renderDocumentsProofHub);run("tenderhub",renderTenderHub);run("automationhub",renderAutomationHub);run("accounthub",renderSettingsHub);run("vault",renderVault);run("employer",renderEmployees);run("employees",renderEmployeeRegister);run("dailyreports",renderDailyOperations);run("privacy",renderPrivacy);run("tender",renderTender);run("manufacturing",renderManufacturing);run("sources",renderSourceRegistry);run("taxprofile",renderTaxProfile);run("bwreadiness",renderBwReadiness);run("corporate",renderCorporate);run("employmentcontrols",renderEmploymentControls);run("publishing",renderPublishing);run("documents",renderDocs);run("changes",renderChanges);renderCompanies();run("audit",renderAudit);run("rules",renderRuleLibrary);run("employer",renderCases);run("expert",renderExpert);run("profile",fillProfile);run("accountsocial",renderSocialAccounts);run("accountsecurity",renderAccountSecurity);run("accountdata",renderDeletionStatus);run("aicontrols",renderAiCredits);run("aicontrols",renderAiCostControls);run("tenderready",renderTenderReady);if((document.getElementById("employershield")?.classList.contains("active")||document.getElementById("protectionengine")?.classList.contains("active"))&&(roleCanView("employershield")||roleCanView("protectionengine"))){renderEmployeesForHr();renderHrCases()}run("companysecretary",renderCompanyActions);run("licenceos",renderLicences);run("partnerportal",renderPartnerPortal);run("compliancepassport",renderPassport);if(["owner","manager"].includes(currentWorkspaceRole()))run("compliancepassport",renderPassportShares);run("workflowhub",renderWorkflowRules);run("notifications",renderNotifications);run("notifications",renderNotificationDeadLetters);run("recurringautomation",renderSchedules);run("partnerportal",renderPartnerInvites);run("partnerportal",renderPartnerAccess);run("servicesmarketplace",renderProfessionalServices);run("payments",renderPayments);run("payments",renderPaymentProviders);run("payments",renderPaymentReconciliation);run("entitlements",renderEntitlements);run("regulatoryintel",renderRegulatoryIntelligence);if(["sources","rules","publishing","regulatorygovernance"].some(v=>roleCanView(v)&&document.getElementById(v)?.classList.contains("active")))renderPlatformRegulatoryGovernance();run("regulatoryobligations",renderComplianceObligations);run("inspectionreadiness",renderInspectionReadiness);run("datadeletion",renderDeletion);run("evidenceintegrity",renderEvidenceIntegrity);run("protectionengine",renderProtectionEngine);run("controlcenter",renderControlCenter);run("controllineage",renderControlLineageOptions);run("riskengine",renderRiskEvents);run("portfolioRisk",renderPortfolioRisk);run("partneractioncenter",renderPartnerActionCenter);setTimeout(animateViewItems,30);
}
function addDays(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}
function endOfMonth(y,m){return new Date(y,m+1,0)}
function nextMonthlyDeadline(dayOffset){
 let now=new Date(), base=endOfMonth(now.getFullYear(),now.getMonth()-1), due=addDays(base,dayOffset);
 if(due<now){base=endOfMonth(now.getFullYear(),now.getMonth());due=addDays(base,dayOffset)}
 return due
}
function nextVatDeadline(){
 let now=new Date(), base=endOfMonth(now.getFullYear(),now.getMonth()-1), due=addDays(base,25);
 if(due<now){base=endOfMonth(now.getFullYear(),now.getMonth());due=addDays(base,25)}
 return due
}
function monthNum(name){return ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(name)}
function nextCipaDeadline(){
 let m=monthNum(state.profile.cipaMonth);if(m<0)return null;if(m===0)m=1;else if(m===11)m=10;let now=new Date(),y=now.getFullYear(),d=endOfMonth(y,m);if(d<now)d=endOfMonth(y+1,m);return d
}
function cipaSurvivalState(){let m=monthNum(state.profile.cipaMonth);if(m<0)return {kind:"warn",label:"Set due month",detail:"Set the CIPA annual-return due month in Company Profile."};if(m===0)m=1;else if(m===11)m=10;const now=new Date(),y=now.getFullYear(),due=endOfMonth(y,m),start=new Date(y,m,1),graceEnd=new Date(y,m+1,10,23,59,59),removal=new Date(y,m+1,11);if(now<start){return {kind:"good",label:`Due ${start.toLocaleString(undefined,{month:"long"})}`,detail:`Annual return window opens ${start.toLocaleDateString()} and runs to ${due.toLocaleDateString()}. File early.`}}if(now<=due)return {kind:"warn",label:"Due this month",detail:`File and pay the P500 annual return by ${due.toLocaleDateString()}.`};if(now<=graceEnd)return {kind:"bad",label:"Penalty window",detail:`CIPA guidance adds a P500 penalty in the first 10 days after the due month. File immediately.`};if(now>=removal)return {kind:"bad",label:"Removal risk",detail:"CIPA guidance says an unfiled company is removed on day 11 after the due month. Verify current OBRS status immediately."};return {kind:"warn",label:"Review",detail:"Verify current CIPA filing status."}}
function ensureBwReadiness(){return state?.bwReadiness||{}}
function setBwReadiness(key,val){updateActiveCompany(c=>{c.bwReadiness={...(c.bwReadiness||{}),[key]:!!val}});save();renderBwReadiness()}
function renderBwReadiness(){const box=document.getElementById("bwReadinessChecklist");if(!box)return;const rs=cipaSurvivalState(),badge=document.getElementById("bwCipaStatus"),detail=document.getElementById("bwCipaDetail");if(badge){badge.className=`readiness-status ${rs.kind}`;badge.textContent=rs.label}if(detail)detail.textContent=rs.detail;const v=ensureBwReadiness(),items=[["taxRecords","Tax records mapped for eight-year retention","Identify tax records and ensure deletion policies do not destroy them early."],["einvoice","E-invoicing readiness owner assigned","Identify invoicing system/vendor and monitor BURS technical implementation."],["labour","Employment-law transition reviewed","Review contracts, fixed-term rationale, leave, attendance and case evidence."],["cipa","CIPA annual return evidence current","Keep filing/payment evidence in the secure Evidence Vault."],["egp","PPRA / e-procurement readiness reviewed","Keep supplier registration and reusable tender evidence current."],["taxAgent","Tax-service delivery boundary verified","Route tax preparation, objections and BURS representation through appropriately authorised professionals / registered tax agents."],["mobile","Branch reporting tested on mobile","Test daily reporting on normal mobile data and weak connectivity."]];box.safeHTML=items.map(x=>`<label class="readiness-check"><input type="checkbox" ${v[x[0]]?"checked":""} data-bw-onchange="setBwReadiness('${x[0]}',this.checked)"><div><b>${x[1]}</b><div class="muted small">${x[2]}</div></div></label>`).join("")}
function nextAnniversary(){
 if(!state.profile.tradeAnniversary)return null;let a=new Date(state.profile.tradeAnniversary+"T00:00:00"),now=new Date();let d=new Date(now.getFullYear(),a.getMonth(),a.getDate());if(d<now)d=new Date(now.getFullYear()+1,a.getMonth(),a.getDate());return d
}
function fmtDate(d){return d?d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"Not set"}
function daysUntil(d){return d?Math.ceil((d-new Date())/86400000):null}
function deadlineClass(d){let n=daysUntil(d);return n===null?"":n<0?"deadlineLate":n<=14?"deadlineSoon":"deadlineOk"}



function monthsBetween(a,b){
 let s=new Date(a+"T00:00:00"),e=new Date(b+"T00:00:00");
 if(isNaN(s)||isNaN(e)||e<s)return 0;
 return (e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth())+(e.getDate()>=s.getDate()?0:-1)
}
function fixedTermFlags(){return (state.fixedTerms||[]).filter(x=>monthsBetween(x.start,x.end)>12 && !x.justified).length}
function addFixedTerm(){
 let emp=ftEmployee.value.trim();if(!emp||!ftStart.value||!ftEnd.value)return notifyUser("Enter employee/reference and both dates.");
 let rec={id:"ft_"+Date.now(),employee:emp,start:ftStart.value,end:ftEnd.value,justified:ftJustified.value==="true"};
 updateActiveCompany(c=>{c.fixedTerms=[...(c.fixedTerms||[]),rec]});logEvent("FIXED_TERM_CONTROL_ADDED",{contractId:rec.id,months:monthsBetween(rec.start,rec.end),justified:rec.justified});
 ftEmployee.value="";ftStart.value=ftEnd.value="";save();renderAll()
}
function removeFixedTerm(id){updateActiveCompany(c=>{c.fixedTerms=(c.fixedTerms||[]).filter(x=>x.id!==id)});logEvent("FIXED_TERM_CONTROL_REMOVED",{contractId:id});save();renderAll()}
function renderEmploymentControls(){
 let arr=state.fixedTerms||[],flags=fixedTermFlags(),q=id=>document.getElementById(id);if(!q("ftCount"))return;
 q("ftCount").textContent=arr.length;q("ftFlags").textContent=flags;q("empHighRisk").textContent=(state.cases||[]).filter(c=>c.status==="Open"&&c.risk==="High").length;
 q("fixedTermList").safeHTML=arr.length?arr.map(x=>{let m=monthsBetween(x.start,x.end),flag=m>12&&!x.justified;return `<div class="item ${flag?"rulewarn":""}"><div class="between row"><div><b>${escapeHtml(x.employee)}</b><div class="muted small">${x.start} → ${x.end} · approx. ${m} months</div></div><span class="badge ${flag?"warn":"good"}">${flag?"Review":"OK metadata"}</span></div><div class="source">Objective justification: ${x.justified?"documented":"not documented"}</div><button class="btn alt" style="margin-top:8px" data-bw-onclick="removeFixedTerm('${safeId(x.id)}')">Remove</button></div>`}).join(""):'<div class="muted small">No fixed-term contract metadata.</div>'
}
function runTerminationGuard(){
 let checks={evidence:termEvidence.value==="true",response:termResponse.value==="true",review:termReview.value==="true"},reason=termReason.value;
 let missing=[];if(!checks.evidence)missing.push("evidence completeness");if(!checks.response)missing.push("employee response / process record");if(!checks.review)missing.push("professional review");
 let block=missing.length>0;
 terminationGuardOutput.safeHTML=`<div class="${block?"rulebad":"verifiedsrc"}"><b>${block?"BLOCK AUTOMATED TERMINATION":"Readiness controls completed"}</b><div class="small" style="margin-top:6px">Reason: ${escapeHtml(reason)}</div>${block?`<div class="small">Missing/uncertain: ${missing.join(", ")}.</div><div class="source">The app will not generate a final dismissal instruction while these controls are unresolved.</div>`:`<div class="small">This still does not certify that termination is lawful. Final documents and calculations must match the applicable facts, contract, legislation and regulations.</div>`}</div>`;
 logEvent("TERMINATION_GUARD_RUN",{reason,blocked:block,missing})
}


function rulePublishState(r){
 if((r.id==="vat"||r.id==="paye") && sourceConflicts.some(c=>c.id.startsWith(r.id)))return "blocked";
 if(r.requiresExpert)return "review";
 return "live"
}
function renderPublishing(){
 let q=id=>document.getElementById(id);if(!q("pubLive"))return;
 let rows=rules.map(r=>({...r,publish:rulePublishState(r)}));
 q("pubLive").textContent=rows.filter(r=>r.publish==="live").length;
 q("pubReview").textContent=rows.filter(r=>r.publish==="review").length;
 q("pubBlocked").textContent=rows.filter(r=>r.publish==="blocked").length;
 q("publishingList").safeHTML=rows.map(r=>`<div class="item"><div class="between row"><div><b>${escapeHtml(r.title)}</b><div class="muted small">${escapeHtml(r.area)} · ${escapeHtml(r.authority)}</div></div><span class="publishstate ${escapeHtml(r.publish)}">${r.publish==="live"?"Executable":r.publish==="review"?"Review-gated":"Blocked"}</span></div><div class="rulemeta"><span>Effective ${escapeHtml(r.effectiveFrom)}</span><span>${escapeHtml(r.review)}</span><span>${escapeHtml(r.source)}</span></div></div>`).join("")
}

function openTaxFacts(focusId=""){
 const d=document.getElementById("taxFactDetails");if(d)d.open=true;
 if(focusId)setTimeout(()=>document.getElementById(focusId)?.focus(),40);
}
function renderTaxProfile(){
 let p=state.profile,q=id=>document.getElementById(id);if(!q("taxPayeStatus"))return;
 const conflicts=sourceConflicts.filter(c=>c.area==="Tax");
 const confirmedVatCategory=String(p.vatCategory||"").trim();
 const vatStatus=confirmedStatus(p,"vat"),payeStatus=confirmedStatus(p,"paye");
 const cycle=vatStatus==="unknown"?"Registration not confirmed":!p.vat?"Confirmed not VAT registered":(confirmedVatCategory?`Confirmed category ${confirmedVatCategory}`:"Category not confirmed");
 q("taxPayeStatus").textContent=payeStatus==="unknown"?"Not confirmed":p.paye?"Tracked":"Confirmed not registered";
 q("taxVatCycle").textContent=cycle;
 q("taxConflictCount").textContent=conflicts.length;
 const vatCategoryInput=q("taxVatCategoryInput"),suppliesInput=q("taxAnnualTaxableSuppliesInput"),payInput=q("taxHighestMonthlyPayInput");
 if(vatCategoryInput)vatCategoryInput.value=p.vatCategory||"";
 if(suppliesInput)suppliesInput.value=p.annualTaxableSupplies??"";
 if(payInput)payInput.value=p.highestMonthlyEmployeePay??"";
 if(q("taxVatFactsCard"))q("taxVatFactsCard").hidden=!p.vat;
 if(q("taxPayeFactsCard"))q("taxPayeFactsCard").hidden=!p.paye;
 let nextTitle="Tax setup recorded",nextDetail="Keep tax evidence current and review source conflicts before relying on a threshold conclusion.",nextAction=`<button class="btn alt" type="button" data-bw-onclick="openTaxFacts()">Review tax evidence</button>`;
 if(vatStatus==="unknown"||payeStatus==="unknown"){nextTitle="Confirm your tax registration facts";nextDetail="At least one VAT/PAYE registration fact is not confirmed. BW will not infer registration from turnover, employee count or disputed thresholds.";nextAction=`<button class="btn" type="button" data-bw-onclick="showView('profile')">Confirm registration status</button>`}
 else if(!p.vat&&!p.paye){nextTitle="Tax registration facts confirmed";nextDetail="VAT and PAYE are both recorded as confirmed not registered. Update Business details if the official position changes.";nextAction=`<button class="btn" type="button" data-bw-onclick="showView('profile')">Review status</button>`}
 else if(p.vat&&!confirmedVatCategory){nextTitle="Confirm your VAT category";nextDetail="VAT is marked as registered, but the filing category/code is not confirmed. Do not guess it from turnover.";nextAction=`<button class="btn" type="button" data-bw-onclick="openTaxFacts('taxVatCategoryInput')">Add confirmed category</button>`}
 else if(p.vat&&(p.annualTaxableSupplies===null||p.annualTaxableSupplies===undefined||p.annualTaxableSupplies==="")){nextTitle="Add the taxable-supplies fact if known";nextDetail="This supporting fact can help professional review, but the platform will not use it to auto-decide VAT registration while official thresholds conflict.";nextAction=`<button class="btn" type="button" data-bw-onclick="openTaxFacts('taxAnnualTaxableSuppliesInput')">Add taxable supplies</button>`}
 else if(p.paye&&(p.highestMonthlyEmployeePay===null||p.highestMonthlyEmployeePay===undefined||p.highestMonthlyEmployeePay==="")){nextTitle="Add payroll context if known";nextDetail="PAYE is marked as applicable. Record the highest monthly employee pay only as supporting context; conflicting threshold guidance remains blocked.";nextAction=`<button class="btn" type="button" data-bw-onclick="openTaxFacts('taxHighestMonthlyPayInput')">Add payroll context</button>`}
 q("taxNextTitle").textContent=nextTitle;q("taxNextDetail").textContent=nextDetail;q("taxNextActions").safeHTML=nextAction;
 let nextP=nextMonthlyDeadline(15),nextV=nextVatDeadline();
 const turnoverText=p.turnover===null||p.turnover===undefined||p.turnover===""?"Not supplied":`P${Number(p.turnover).toLocaleString()}`;
 const suppliesText=p.annualTaxableSupplies===null||p.annualTaxableSupplies===undefined||p.annualTaxableSupplies===""?"Not supplied":`P${Number(p.annualTaxableSupplies).toLocaleString()}`;
 q("taxProfileSummary").safeHTML=`<div class="matrix"><b>Annual turnover</b><span>${turnoverText} · not used as VAT taxable supplies</span><b>Annual taxable supplies</b><span>${suppliesText}</span><b>PAYE</b><span>${payeStatus==="unknown"?"Not confirmed":p.paye?"Enabled · next payment target "+fmtDate(nextP):"Confirmed not registered"}</span><b>VAT</b><span>${vatStatus==="unknown"?"Not confirmed":p.vat?"Enabled · "+cycle+" · next generic payment date "+fmtDate(nextV):"Confirmed not registered"}</span><b>Company return</b><span>Income-tax return timing depends on financial year / tax-year rules; configure when source-reviewed.</span></div>`;
 q("taxConflicts").safeHTML=conflicts.map(c=>`<div class="conflict item"><b>${c.topic}</b><div class="small" style="margin-top:6px"><b>${c.sourceA.label}:</b> ${c.sourceA.claim}</div><div class="small"><b>${c.sourceB.label}:</b> ${c.sourceB.claim}</div><div class="source">System handling: ${c.handling}</div><div class="rulemeta"><a href="${c.sourceA.url}" target="_blank" rel="noopener noreferrer">Source A</a><a href="${c.sourceB.url}" target="_blank" rel="noopener noreferrer">Source B</a></div></div>`).join("")||'<div class="notice good">No open tax source conflict.</div>';
}
function saveTaxFacts(){
 if(currentWorkspaceRole()!=="owner"){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Only the account owner can edit tax facts.";return false}
 const category=(document.getElementById("taxVatCategoryInput")?.value||"").trim(),supplies=optionalNonNegativeNumber(document.getElementById("taxAnnualTaxableSuppliesInput")),pay=optionalNonNegativeNumber(document.getElementById("taxHighestMonthlyPayInput"));
 updateActiveCompany(c=>{c.profile={...c.profile,vatCategory:category,annualTaxableSupplies:supplies,highestMonthlyEmployeePay:pay}});
 save();renderTaxProfile();const status=document.getElementById("taxSaveStatus");if(status)status.textContent="Confirmed tax facts saved. No threshold conclusion was inferred.";let sr=document.getElementById("srStatus");if(sr)sr.textContent="Tax facts saved without threshold inference.";return true;
}

const corpChanges={
 director:{title:"Director changed",checks:["Update company particulars through the applicable CIPA maintenance workflow.","Re-check beneficial-owner/control implications.","Update bank, licence, tender and internal authority records where affected.","Preserve board/shareholder resolutions and appointment/cessation evidence."]},
 shareholder:{title:"Shareholder changed",checks:["Update shareholder particulars with CIPA where required.","Reassess beneficial ownership and nature of interest.","Re-check citizen-reserved trade/manufacturing activities.","Update constitution/share records and tender ownership declarations."]},
 beneficial:{title:"Beneficial owner changed",checks:["Update beneficial-owner declaration in the applicable CIPA workflow.","Identify the natural person exercising ultimate ownership/control.","Record nature of interest/control.","Preserve supporting ownership/control evidence."]},
 office:{title:"Registered office changed",checks:["Update CIPA registered-office particulars where required.","Update licences, BURS, banks and contracts where the registered/operating address is relevant.","If operating premises changed, run the premises event workflow too."]},
 activity:{title:"Business activity changed",checks:["Update relevant corporate/business particulars.","Run licensing classification for the new activity.","Check citizen-reserved restrictions.","If manufacturing begins, run Industrial Compliance."]},
 nominee:{title:"Nominee / alternate arrangement",checks:["CIPA's upgraded OBRS requires declaration of nominee or alternate directors/shareholders where such arrangements exist.","Identify and record the nominator/underlying arrangement as required.","Escalate for professional review because AML/CFT and beneficial-ownership implications may apply."]}
};
function runCorpChange(k){
 let c=corpChanges[k];if(!c)return;
 corpChangeOutput.safeHTML=`<div class="${k==="nominee"?"rulebad":"notice"}"><b>${c.title}</b><ol>${c.checks.map(x=>`<li>${x}</li>`).join("")}</ol><div class="source">Workflow identifies re-checks; exact filing deadline/form must be validated for the company type and change.</div></div>`;
 logEvent("CORPORATE_CHANGE_REVIEWED",{change:k})
}
function renderCorporate(){
 let q=id=>document.getElementById(id);if(!q("corpConstitution"))return;
 let has=(pat)=>(state.evidence||[]).some(e=>e.verified&&pat.test(e.name));
 let constitution=has(/constitution/i),bo=has(/beneficial owner|beneficial ownership/i);
 q("corpConstitution").textContent=constitution?"Verified ✓":"Missing";q("corpConstitution").style.color=constitution?"var(--good)":"var(--bad)";
 q("corpBO").textContent=bo?"Verified ✓":"Verify";q("corpBO").style.color=bo?"var(--good)":"var(--warn)";
 q("corpRisk").textContent=(!constitution||!bo)?"ACTION":"LOWER";q("corpRisk").style.color=(!constitution||!bo)?"var(--bad)":"var(--good)";
 let req=[["Company constitution",constitution],["Beneficial-owner evidence",bo],["Latest annual return",has(/annual return/i)],["Certificate of incorporation",has(/incorporation/i)]];
 q("corpEvidence").safeHTML=req.map(x=>`<div class="checkline"><span class="dot ${x[1]?"good":"warn"}"></span><div><b>${x[0]}</b><div class="muted small">${x[1]?"Verified evidence found":"Add/verify evidence"}</div></div></div>`).join("");
 renderCipaRegistry()
}

const cipaFieldLabels={registration_number:"CIPA UIN / registration number",legal_name:"Registered legal name",entity_type:"Entity type",registration_status:"Registry status",registration_date:"Registration date",annual_return_month:"Annual-return month",registered_office:"Registered office"};
function seedCipaRegistryForm(force=false){
 const panel=document.getElementById("cipaRegistryPanel");if(!panel)return;const companyChanged=panel.dataset.companyId!==String(state.id);if(companyChanged){panel.dataset.companyId=String(state.id);panel.dataset.seeded=""}
 if(panel.dataset.seeded&&!force)return;const p=state.profile||{};
 document.getElementById("cipaObservedAt").value=browserGaboroneDate();document.getElementById("cipaRegistrationNumber").value=p.cipaUin||"";document.getElementById("cipaLegalName").value=p.name||"";
 document.getElementById("cipaEntityType").value=p.entityType||"company";document.getElementById("cipaRegistrationStatus").value=p.cipaStatus||"active";document.getElementById("cipaRegistrationDate").value=p.incorporationDate||"";
 document.getElementById("cipaAnnualReturnMonth").value=p.cipaMonth||"";document.getElementById("cipaRegisteredOffice").value=p.registeredOffice||"";panel.dataset.seeded="1";
}
async function renderCipaRegistry(){
 const panel=document.getElementById("cipaRegistryPanel"),list=document.getElementById("cipaReconciliationList");if(!panel||!list)return;seedCipaRegistryForm();
 if(STANDALONE_PREVIEW){
   cipaRegistryData={mode:"manual_evidence",liveSync:false,stateVersion:serverStateVersion,summary:{pending:0,matched:0},reconciliations:[]};
   document.getElementById("cipaRegistryMode").textContent="Preview · manual evidence";document.getElementById("cipaSnapshotStatus").textContent="Preview only";document.getElementById("cipaPendingCount").textContent="0";document.getElementById("cipaMatchedCount").textContent="0";
   const ev=(state.evidence||[]).filter(x=>x.verified),sel=document.getElementById("cipaEvidenceId");sel.safeHTML='<option value="">Choose approved evidence</option>'+ev.map(x=>`<option value="${safeId(x.id)}">${escapeHtml(x.name)}</option>`).join("");
   list.safeHTML='<div class="notice"><b>Preview mode</b><div class="small">The production workspace lists only server-approved, malware-cleared evidence and records every reconciliation in the sealed audit history.</div></div>';return;
 }
 const requestedCompany=String(state.id);
 try{
   const r=await apiJson(`/api/cipa/registry?companyId=${encodeURIComponent(requestedCompany)}`);if(String(state.id)!==requestedCompany)return;cipaRegistryData=r;
   document.getElementById("cipaRegistryMode").textContent=r.liveSync?"Live connector":"Manual evidence";document.getElementById("cipaSnapshotStatus").textContent=r.latestSnapshot?`${r.latestSnapshot.source_type.replaceAll("_"," ")} · ${r.latestSnapshot.source_observed_at}`:"Not staged";
   document.getElementById("cipaPendingCount").textContent=Number(r.summary?.pending||0);document.getElementById("cipaMatchedCount").textContent=Number(r.summary?.matched||0);
   const sel=document.getElementById("cipaEvidenceId"),selected=sel.value,eligible=r.eligibleEvidence||[];sel.safeHTML='<option value="">Choose approved evidence</option>'+eligible.map(x=>`<option value="${safeId(x.id)}">${escapeHtml(x.display_name||x.id)}</option>`).join("");if(eligible.some(x=>x.id===selected))sel.value=selected;
   const owner=currentWorkspaceRole()==="owner",items=r.reconciliations||[];
   list.safeHTML=items.length?items.map(x=>{const matched=x.status==="matched",pending=x.status==="pending",statusLabel=x.status.replaceAll("_"," ");return `<div class="item"><div class="between row"><div><b>${escapeHtml(cipaFieldLabels[x.field_key]||x.field_key)}</b><div class="muted small">Workspace: ${escapeHtml(x.internal_value||"Not set")}</div><div class="small">CIPA source: ${escapeHtml(x.registry_value||"Not set")}</div></div><span class="badge ${matched?"good":pending?"warn":""}">${escapeHtml(statusLabel)}</span></div>${pending&&owner?`<div class="row" style="margin-top:9px"><button class="btn soft" type="button" data-bw-onclick="resolveCipaReconciliation('${safeId(x.id)}','apply_registry')">Apply CIPA value</button><button class="btn alt" type="button" data-bw-onclick="resolveCipaReconciliation('${safeId(x.id)}','keep_workspace')">Keep workspace value</button></div>`:pending?'<div class="muted small" style="margin-top:7px">An owner must resolve this official-particular difference.</div>':x.resolution_note?`<div class="source">Reason: ${escapeHtml(x.resolution_note)}</div>`:""}</div>`}).join(""):'<div class="muted small">No registry snapshot staged.</div>';
   if(!eligible.length)document.getElementById("cipaRegistryStatus").textContent="Add, scan and approve a current CIPA extract or register-search record in Evidence first.";
 }catch(e){list.safeHTML=`<div class="notice bad"><b>Registry reconciliation unavailable</b><div class="small">${escapeHtml(e.message)}. Do not treat workspace particulars as CIPA-verified.</div></div>`}
}
async function stageCipaRegistrySnapshot(){
 const status=document.getElementById("cipaRegistryStatus"),payload={companyId:state.id,evidenceId:document.getElementById("cipaEvidenceId").value,sourceType:document.getElementById("cipaSourceType").value,
   sourceObservedAt:document.getElementById("cipaObservedAt").value,registrationNumber:document.getElementById("cipaRegistrationNumber").value,legalName:document.getElementById("cipaLegalName").value,
   entityType:document.getElementById("cipaEntityType").value,registrationStatus:document.getElementById("cipaRegistrationStatus").value,registrationDate:document.getElementById("cipaRegistrationDate").value,
   annualReturnMonth:document.getElementById("cipaAnnualReturnMonth").value,registeredOffice:document.getElementById("cipaRegisteredOffice").value,reviewConfirmed:document.getElementById("cipaReviewConfirmed").checked};
 if(STANDALONE_PREVIEW){status.textContent="Preview only. A signed-in production workspace is required to stage evidence.";return}
 try{status.textContent="Staging reviewed particulars…";const r=await apiJson("/api/cipa/registry-snapshots",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});document.getElementById("cipaReviewConfirmed").checked=false;status.textContent=r.duplicate?"This exact evidence/profile snapshot is already staged.":`Snapshot staged · ${r.pending} difference(s), ${r.matched} match(es).`;await renderCipaRegistry()}
 catch(e){status.textContent=e.message}
}
async function resolveCipaReconciliation(id,action){
 const apply=action==="apply_registry";let note="";
 if(apply){const confirmed=await BW.dialog.confirm({title:"Apply staged CIPA value?",message:"Apply this staged CIPA value to the workspace profile? This does not submit a filing to CIPA.",confirmLabel:"Apply value"});if(!confirmed)return}
 else{const answer=await BW.dialog.prompt({title:"Retain workspace value",message:"Record the factual reason the current workspace value should be retained.",multiline:true,required:true,minLength:10,maxLength:900,confirmLabel:"Retain value"});if(answer===null)return;note=answer.trim()}
 const status=document.getElementById("cipaRegistryStatus");
 try{status.textContent=apply?"Applying owner-approved registry value…":"Recording owner decision…";const r=await apiJson(`/api/cipa/reconciliations/${encodeURIComponent(id)}/resolve`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,note,expectedStateVersion:serverStateVersion})});
   if(apply){serverStateVersion=r.stateVersion||serverStateVersion;await refreshWorkspaceStateAfterCipa()}else await renderCipaRegistry();status.textContent=apply?"Registry value applied to the workspace profile.":"Workspace value retained with an audit reason.";
 }catch(e){status.textContent=e.message}
}
async function refreshWorkspaceStateAfterCipa(){
 const st=await apiJson("/api/state");serverStateVersion=st.version||serverStateVersion;if(st.state?.companies?.length){const next=structuredClone(st.state);next.activeRole=currentWorkspaceRole();replaceWorkspaceStore(next)}
 const panel=document.getElementById("cipaRegistryPanel");if(panel)panel.dataset.seeded="";renderAll();
}

function saveManufacturingProfile(){
 updateActiveCompany(c=>{c.profile={...c.profile,manufacturing:true,mfgActivity:mfgActivity.value,mfgFactory:mfgFactory.value==="true",mfgAnniversary:mfgAnniversary.value}});
 logEvent("MANUFACTURING_PROFILE_UPDATED",{activity:state.profile.mfgActivity,factory:state.profile.mfgFactory,turnover:state.profile.turnover});
 save();renderAll()
}
function renderManufacturing(){
 let p=state.profile,q=id=>document.getElementById(id);if(!q("mfgApplicability"))return;
 q("mfgApplicability").textContent=p.manufacturing?"YES":"NO";
 q("mfgApplicability").className="score "+(p.manufacturing?"warn":"good");
 q("mfgRoute").textContent=mfgRoute();
 let reserved=p.manufacturing&&reservedManufacturing.includes(p.mfgActivity);
 q("mfgReserved").textContent=!p.manufacturing?"—":reserved?(p.citizenOwned?"Reserved activity / citizen-owned ✓":"HIGH — ownership review"):"No listed reserved match";
 q("mfgReserved").style.color=reserved&&!p.citizenOwned?"var(--bad)":reserved?"var(--warn)":"var(--good)";
 mfgActivity.value=p.mfgActivity||"";mfgFactory.value=String(!!p.mfgFactory);mfgAnniversary.value=p.mfgAnniversary||"";
 let items=[];
 if(p.manufacturing){
   items.push(["Industrial licence / registration","Required path should be confirmed before commencement.",true]);
   items.push(["Processing office",mfgRoute(),true]);
   items.push(["Industrial annual renewal",p.mfgAnniversary?("Track anniversary "+p.mfgAnniversary):"Anniversary missing",!!p.mfgAnniversary]);
   items.push(["Environmental / health / planning package","Government guidance lists environmental, health, planning and premises evidence for new industrial-licence applications.",false]);
   items.push(["Factory registration",p.mfgFactory?"Assess before operation":"Not selected / confirm applicability",!p.mfgFactory]);
   if(reserved)items.push(["Citizen-reserved manufacturing activity",p.citizenOwned?"Ownership profile currently compatible":"Potential ownership restriction — professional review required",p.citizenOwned]);
 }
 q("mfgChecklist").safeHTML=items.length?items.map(x=>`<div class="checkline"><span class="dot ${x[2]?"good":"warn"}"></span><div><b>${x[0]}</b><div class="muted small">${x[1]}</div></div></div>`).join(""):'<div class="notice good">Manufacturing is not enabled for this company.</div>'
}
function renderSourceRegistry(){
 let el=document.getElementById("sourceRegistry");if(!el)return;
 let cards=sourceRegistry.map(s=>`<div class="sourcebox item"><strong>${s.authority}</strong><div class="small">${s.coverage}</div><div class="pillrow" style="margin-top:8px"><span class="pill">${s.domain}</span><span class="pill">${s.confidence}</span><span class="pill">Review ${s.review}</span></div></div>`).join("");
 let conflicts=sourceConflicts.map(c=>`<div class="conflict item"><strong>Source conflict: ${c.topic}</strong><div class="small">${c.handling}</div></div>`).join("");
 el.safeHTML=`<div class="rulewarn"><b>${sourceConflicts.length} source conflict(s) currently block automatic rule execution.</b><div class="small">The platform should prefer no automated conclusion over a potentially wrong legal/tax conclusion.</div></div><div style="margin-top:12px">${conflicts}${cards}</div>`
}

function renderDeadlines(){
 let rows=[];
 if(state.profile.paye){let d=nextMonthlyDeadline(15);rows.push(["PAYE",fmtDate(d),"High",d])}
 if(state.profile.vat){let d=nextVatDeadline();rows.push(["VAT",fmtDate(d),"High",d])}
 let cd=nextCipaDeadline();rows.push(["CIPA annual return",cd?fmtDate(cd):(state.profile.cipaMonth||"Due month not set"),"High",cd]);
 if(state.profile.trade){let td=nextAnniversary();rows.push(["Trade annual fee",td?fmtDate(td):"Anniversary not set","Medium",td])}
 if(state.profile.manufacturing){let md=state.profile.mfgAnniversary?new Date(state.profile.mfgAnniversary+"T00:00:00"):null;if(md){let now=new Date(),x=new Date(now.getFullYear(),md.getMonth(),md.getDate());if(x<now)x=new Date(now.getFullYear()+1,md.getMonth(),md.getDate());md=x}rows.push(["Industrial licence renewal",md?fmtDate(md):"Anniversary not set","High",md])}
 document.getElementById("deadlineTable").safeHTML=`<table><tr><th>Obligation</th><th>Next due</th><th>Risk</th></tr>${rows.map(x=>`<tr class="${deadlineClass(x[3])}"><td>${x[0]}</td><td>${x[1]}${x[3]&&daysUntil(x[3])<=30?` <span class="tag">${Math.max(0,daysUntil(x[3]))} days</span>`:""}</td><td><span class="badge ${riskClass(x[2])}">${x[2]}</span></td></tr>`).join("")}</table>`;
}
function renderObligations(){
 const {element,renderList}=BW.components;const f=document.getElementById("obligationFilter")?.value||"All",items=applicable().filter(r=>f==="All"||r.risk===f),target=document.getElementById("obligationList");
 renderList(target,items,r=>{
   const title=element("b",{text:r.title}),meta=element("div",{className:"muted small",text:`${r.area} · ${r.status()}`}),left=element("div",{},[title,meta]),badge=element("span",{className:`badge ${riskClass(r.risk)}`,text:r.risk}),head=element("div",{className:"between row"},[left,badge]);
   const why=element("p",{className:"small",text:r.why}),source=element("div",{className:"source"},["Source: "]),link=element("a",{text:r.source,attrs:{href:safeExternalUrl(r.url),target:"_blank",rel:"noopener noreferrer"}});source.appendChild(link);
   const rulemeta=element("div",{className:"rulemeta"},[element("span",{text:r.authority}),element("span",{text:`Effective ${r.effectiveFrom}`}),r.requiresExpert?element("span",{text:"Professional validation gate"}):null]);
   const button=element("button",{className:"btn soft",text:"Mark evidence verified",attrs:{type:"button"}});button.addEventListener("click",()=>markDone(r.id));const actions=element("div",{className:"actions",attrs:{style:"margin-top:9px"}},[button]);return element("div",{className:"item"},[head,why,source,rulemeta,actions]);
 },{emptyText:"No obligations match this filter."});
}
function markDone(id){updateActiveCompany(c=>{c.completed={...(c.completed||{}),[id]:true}});logEvent("CONTROL_VERIFIED",{rule:id});save();renderAll()}
function renderCalendar(){
 const {element}=BW.components;const arr=[state.profile.paye&&["PAYE","Monthly",fmtDate(nextMonthlyDeadline(15)),"BURS",nextMonthlyDeadline(15)],state.profile.vat&&["VAT","Tax period",fmtDate(nextVatDeadline()),"BURS",nextVatDeadline()],["Annual return","Annual",nextCipaDeadline()?fmtDate(nextCipaDeadline()):(state.profile.cipaMonth?state.profile.cipaMonth+" due month":"Set CIPA due month"),"CIPA",nextCipaDeadline()],state.profile.trade&&["Trade annual fee","Annual",nextAnniversary()?fmtDate(nextAnniversary()):"Set licence anniversary","Council / Trade",nextAnniversary()],state.profile.manufacturing&&["Industrial licence renewal","Annual",state.profile.mfgAnniversary||"Set first-issue anniversary","Industrial Affairs / Council",null],state.profile.employees>0&&["Employment file audit","Quarterly","Internal recurring control","Employer Shield",null],state.profile.data&&["Privacy/data review","Quarterly","Internal recurring control","Data protection",null]].filter(Boolean);
 const table=element("table"),header=element("tr");for(const text of ["Item","Frequency","Next timing","Owner"])header.appendChild(element("th",{text}));table.appendChild(header);const frag=document.createDocumentFragment();for(const row of arr){const tr=element("tr",{className:deadlineClass(row[4])});for(const value of row.slice(0,4))tr.appendChild(element("td",{text:value}));frag.appendChild(tr)}table.appendChild(frag);document.getElementById("calendarList").replaceChildren(table);
}
function canEditEvidence(role=currentWorkspaceRole()){return ["owner","manager","reviewer"].includes(String(role||""))}
function openAddEvidence(){
 if(!canEditEvidence()){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Auditor access to evidence is read-only.";return false}
 openModal("actionModal");return true;
}
function syncEvidenceRoleUi(){
 const editable=canEditEvidence(),auditor=currentWorkspaceRole()==="auditor";
 const addBtn=document.getElementById("proofAddEvidenceBtn"),reviewBtn=document.getElementById("proofReviewEvidenceBtn"),addCard=document.getElementById("vaultAddCard"),grid=document.getElementById("vaultGrid");
 if(addBtn)addBtn.hidden=!editable;if(reviewBtn)reviewBtn.hidden=!auditor;if(addCard)addCard.hidden=!editable;if(grid)grid.classList.toggle("auditor-readonly",auditor);
}
function proofNeededItems(){
 if(!state)return [];
 return applicable().filter(r=>/Action required|Evidence to verify|evidence gaps|verify|Review due|Assessment due|Professional review required/i.test(String(r.status?.()||"")));
}
function proofDateStatus(value){
 const d=licenceDateOnly(value);if(!d)return null;const end=new Date(d+"T23:59:59+02:00").getTime();if(!Number.isFinite(end))return null;const days=Math.ceil((end-Date.now())/86400000);return {days,expired:days<0,dueSoon:days>=0&&days<=30};
}
function proofEvidenceStatus(item){
 const approved=item.review_status==="approved",clean=item.scan_status==="clean",date=proofDateStatus(item.valid_until||item.review_date||item.date||"");
 if(item.scan_status==="infected")return {kind:"bad",label:"Blocked",reason:"Malware scan detected a threat"};
 if(["scan_error","legacy_unscanned"].includes(item.scan_status))return {kind:"bad",label:"Scan issue",reason:"Scan must succeed before this proof can be relied on"};
 if(!clean)return {kind:"warn",label:"Scan pending",reason:"Waiting for a clean authenticated malware scan"};
 if(!approved)return {kind:"warn",label:"Review needed",reason:"Clean file still needs evidence approval"};
 if(date?.expired)return {kind:"bad",label:"Expired",reason:"Validity/review date has passed"};
 if(date?.dueSoon)return {kind:"warn",label:"Due soon",reason:`Validity/review date is due in ${date.days} day${date.days===1?"":"s"}`};
 return {kind:"good",label:"Verified",reason:"Clean scan and approved evidence"};
}
function proofListRow(title,detail,label,kind="warn"){
 return `<div class="proof-list-row"><div><b>${escapeHtml(title||"Evidence")}</b><small>${escapeHtml(detail||"")}</small></div><span class="proof-state ${kind}">${escapeHtml(label||"")}</span></div>`;
}
let activeProofAction={source:null,id:null,obligation:null,requirements:[],candidates:[],selectedRequirementId:null,workflow:null,assignees:[],reminder:null,escalations:[]};
function canLinkProofToAction(role=currentWorkspaceRole()){return ["owner","manager"].includes(String(role||""))}
function proofReqEffectiveStatus(r){return String(r.effective_status||r.status||"missing")}
function proofReqStateLabel(r){const s=proofReqEffectiveStatus(r);if(s==="verified")return ["Verified","good"];if(s==="attention")return ["Proof no longer current","bad"];if(s==="attached")return ["Attached · verify","warn"];if(s==="not_applicable")return ["Not applicable","good"];return [r.mandatory?"Missing":"Optional","bad"]}
function selectProofRequirement(id){activeProofAction.selectedRequirementId=String(id||"");renderProofActionContext(activeProofAction)}
function selectedProofRequirement(){return activeProofAction.requirements.find(x=>String(x.id)===String(activeProofAction.selectedRequirementId))||null}
function proofCandidateUsable(x){const d=proofDateStatus(x.valid_until);return x.review_status==="approved"&&x.scan_status==="clean"&&!d?.expired}
function actionStageIndex(status){return {open:0,blocked:1,in_progress:1,review:2,completed:3,not_applicable:3}[String(status||"open")]??0}
function actionDeadlineLabel(value){if(!value)return "Not recorded — confirm the authoritative source";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString()}
function renderActionWorkflow(ctx=activeProofAction){
 const ob=ctx.obligation||{},wf=ctx.workflow||{},steps=document.getElementById("proofActionSteps"),owner=document.getElementById("proofActionOwner"),deadline=document.getElementById("proofActionDeadline"),rem=document.getElementById("proofActionReminder"),stage=document.getElementById("proofActionStage"),hint=document.getElementById("proofActionStageHint"),esc=document.getElementById("proofActionEscalation"),idx=actionStageIndex(ob.status),labels=["Open","In progress","Review","Complete"];
 if(steps)steps.safeHTML=labels.map((x,i)=>`<div class="action-step ${i<idx?"done":i===idx?"active":""}">${escapeHtml(x)}</div>`).join("");
 if(stage)stage.textContent=String(ob.status||"open").replaceAll("_"," ");
 if(hint)hint.textContent=ob.status==="open"?"Start to record ownership and work begun.":ob.status==="in_progress"?"Close mandatory proof gaps, then send to review.":ob.status==="review"?"Confirm the work and proof before completion.":ob.status==="completed"?"Completed work remains in the audit trail.":ob.status==="blocked"?"Resolve the blocker, then resume work.":"No further workflow step is available.";
 if(deadline)deadline.textContent=actionDeadlineLabel(ob.due_at);
 const reminder=ctx.reminder||wf.reminder||null;if(rem)rem.textContent=!ob.due_at?"Automatic due-date reminders are not reliable until a deadline is confirmed.":reminder?`${Number(reminder.reminder_count||0)} reminder${Number(reminder.reminder_count||0)===1?"":"s"} sent${reminder.last_reminder_at?` · last ${new Date(reminder.last_reminder_at).toLocaleDateString()}`:""}.`:`Automatic reminders follow this recorded deadline; none has been sent yet.`;
 const openEsc=(wf.summary?.openEscalation)||(ctx.escalations||wf.escalations||[]).find(x=>["open","acknowledged"].includes(x.status));if(esc)esc.safeHTML=openEsc?`<div class="action-escalation"><b>${escapeHtml(String(openEsc.escalation_level||"warning").replaceAll("_"," "))}</b> · ${escapeHtml(openEsc.reason||"This action has an unresolved escalation.")} · ${openEsc.status==="acknowledged"?`acknowledged${openEsc.acknowledged_by_name?` by ${escapeHtml(openEsc.acknowledged_by_name)}`:""}`:`acknowledgement required <button class="btn soft" type="button" style="margin-left:7px" data-bw-onclick="acknowledgeEscalation('${safeId(openEsc.id)}')">Acknowledge</button>`}</div>`:"";
 const members=ctx.assignees||wf.assignees||[],canAssign=["owner","manager"].includes(currentWorkspaceRole()),assigned=ob.assigned_user_id||"";
 if(owner){if(members.length){owner.safeHTML=`<select aria-label="Action owner" ${canAssign&&!['completed','not_applicable'].includes(ob.status)?'data-bw-onchange="assignProofAction(this.value)"':'disabled'}><option value="">Unassigned</option>${members.map(m=>`<option value="${safeId(m.user_id)}" ${String(m.user_id)===String(assigned)?"selected":""}>${escapeHtml(m.display_name||m.email||"Team member")} · ${escapeHtml(m.role)}</option>`).join("")}</select>`}else owner.safeHTML=`<b>${escapeHtml(ob.assigned_name||"Unassigned")}</b>`}
}
async function openActionProof(source,id){
 source=String(source||"");id=String(id||"");
 if(source!=="regulatory"){const meta=homeActionMeta(source);showView(meta.target);return false}
 if(!roleCanView("evidencehub")){const sr=document.getElementById("srStatus");if(sr)sr.textContent="Action details are not available for this role.";return false}
 activeProofAction={source,id,obligation:null,requirements:[],candidates:[],selectedRequirementId:null,workflow:null,assignees:[],reminder:null,escalations:[]};openModal("proofActionModal");
 const title=document.getElementById("proofActionTitle"),reqBox=document.getElementById("proofActionRequirements"),cand=document.getElementById("proofCandidateEvidence"),err=document.getElementById("proofActionError"),nextBtn=document.getElementById("proofNextAfterCompleteBtn"),att=document.getElementById("proofCompletionAttest"),note=document.getElementById("proofCompletionNote");
 if(title)title.textContent="Loading action…";if(reqBox)reqBox.safeHTML='<div class="muted small">Loading requirements…</div>';if(cand)cand.safeHTML='<div class="muted small">Checking approved evidence…</div>';if(err)err.safeHTML="";if(nextBtn)nextBtn.hidden=true;if(att)att.checked=false;if(note)note.value="";
 if(STANDALONE_PREVIEW){const user={user_id:"preview-owner",display_name:"Preview owner",email:"owner@example.com",role:"owner"};activeProofAction={source,id,obligation:{id,title:"Preview compliance action",status:"open",evidence_required:1,due_at:"2026-09-15",assigned_user_id:null},requirements:[{id:"preview-proof-1",label:"Supporting compliance record",evidence_type:"Compliance",mandatory:1,status:"missing",evidence_id:null}],candidates:(state.evidence||[]).filter(e=>e.verified).map(e=>({id:e.id,name:e.name,category:e.cat,review_status:"approved",scan_status:"clean",scanned_at:new Date().toISOString(),valid_until:e.date||null})),selectedRequirementId:"preview-proof-1",workflow:{summary:{openEscalation:null}},assignees:[user],reminder:null,escalations:[]};renderProofActionContext(activeProofAction);return true}
 try{const [ctx,wf]=await Promise.all([apiJson(`/api/obligations/${encodeURIComponent(id)}/proof-context`),apiJson(`/api/obligations/${encodeURIComponent(id)}/action-context`)]);activeProofAction={source,id,obligation:wf.obligation||ctx.obligation||null,requirements:ctx.requirements||[],candidates:ctx.candidates||[],selectedRequirementId:null,workflow:wf,assignees:wf.assignees||[],reminder:wf.reminder||null,escalations:wf.escalations||[]};const first=(activeProofAction.requirements||[]).find(x=>x.mandatory&&!['verified','not_applicable'].includes(proofReqEffectiveStatus(x)))||(activeProofAction.requirements||[]).find(x=>!['verified','not_applicable'].includes(x.status));if(first)activeProofAction.selectedRequirementId=first.id;renderProofActionContext(activeProofAction);return true}catch(e){if(err)err.safeHTML=`<div class="notice bad"><b>Action unavailable</b><div class="small">${escapeHtml(e.message||String(e))}. No requirement or workflow state has been changed.</div><button class="btn alt" style="margin-top:8px" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(id)}')">Retry</button></div>`;if(title)title.textContent="Could not load this action";return false}
}
async function assignProofAction(userId){
 const ob=activeProofAction.obligation;if(!ob||!userId)return false;if(!["owner","manager"].includes(currentWorkspaceRole()))return false;
 if(STANDALONE_PREVIEW){const m=(activeProofAction.assignees||[]).find(x=>String(x.user_id)===String(userId));ob.assigned_user_id=userId;ob.assigned_name=m?.display_name||m?.email||"Assigned";renderActionWorkflow(activeProofAction);return true}
 const status=document.getElementById("proofActionStatus");try{const r=await apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/assign`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({userId})});ob.assigned_user_id=userId;ob.assigned_name=r.assignee?.display_name||r.assignee?.email||"Assigned";renderActionWorkflow(activeProofAction);if(status){status.className="proof-action-status good";status.textContent="Action owner updated and recorded in the audit trail."}return true}catch(e){if(status){status.className="proof-action-status bad";status.textContent=e.message||String(e)}return false}
}
function renderProofActionContext(ctx=activeProofAction){
 const ob=ctx.obligation||{},reqs=ctx.requirements||[],cands=(ctx.candidates||[]).filter(proofCandidateUsable),selected=selectedProofRequirement();
 const title=document.getElementById("proofActionTitle"),intro=document.getElementById("proofActionIntro"),progress=document.getElementById("proofActionProgress"),reqBox=document.getElementById("proofActionRequirements"),cand=document.getElementById("proofCandidateEvidence"),sel=document.getElementById("proofSelectedRequirement"),upload=document.getElementById("proofUploadBox"),advance=document.getElementById("proofAdvanceBtn"),status=document.getElementById("proofActionStatus"),nextState=document.getElementById("proofActionNextState"),completion=document.getElementById("proofCompletionControls"),att=document.getElementById("proofCompletionAttest");
 if(title)title.textContent=ob.title||"Compliance action";if(intro)intro.textContent="Work the action in sequence: assign ownership, preserve authoritative dates, close required proof, review, then explicitly complete it. Uploading a file never completes the action by itself.";renderActionWorkflow(ctx);
 const mandatory=reqs.filter(x=>Number(x.mandatory)===1),verified=mandatory.filter(x=>["verified","not_applicable"].includes(proofReqEffectiveStatus(x))),open=mandatory.filter(x=>!["verified","not_applicable"].includes(proofReqEffectiveStatus(x))),proofReady=mandatory.length===0||open.length===0;if(progress)progress.safeHTML=`<span><b>${verified.length}/${mandatory.length}</b> mandatory proof verified</span><span><b>${open.length}</b> proof gap${open.length===1?"":"s"}</span><span><b>${escapeHtml(ob.status||"open")}</b> action status</span>`;
 if(reqBox)reqBox.safeHTML=reqs.length?reqs.map(r=>{const [label,kind]=proofReqStateLabel(r),selectedClass=String(r.id)===String(ctx.selectedRequirementId)?" selected":"",action=!["verified","not_applicable"].includes(proofReqEffectiveStatus(r))?`<button class="btn soft" type="button" data-bw-onclick="selectProofRequirement('${safeId(r.id)}')">${String(r.id)===String(ctx.selectedRequirementId)?"Selected":"Work on this"}</button>`:"";return `<div class="proof-requirement${selectedClass}"><div><b>${escapeHtml(r.label||"Evidence requirement")}</b><small>${escapeHtml(r.evidence_type||"Supporting evidence")}${r.evidence_name?` · linked: ${escapeHtml(r.evidence_name)}`:""}</small><span class="proof-state ${kind}" style="display:inline-block;margin-top:6px">${escapeHtml(label)}</span></div>${action}</div>`}).join(""):'<div class="notice good"><b>No mandatory proof item is configured for this action.</b><div class="small">Do not add unrelated documents. Continue the controlled workflow using the action facts and authoritative source.</div></div>';
 if(sel)sel.textContent=selected?selected.label:"No open proof requirement";
 const linkAllowed=canLinkProofToAction();if(cand)cand.safeHTML=selected?(cands.length?cands.slice(0,8).map(e=>`<div class="proof-candidate"><div class="between row"><div><b>${escapeHtml(e.name||"Evidence")}</b><div class="muted small">${escapeHtml(e.category||"Evidence")} · approved · scan clean${e.valid_until?` · valid to ${escapeHtml(e.valid_until)}`:""}</div></div>${linkAllowed?`<button class="btn soft" type="button" data-bw-onclick="useVerifiedProof('${safeId(e.id)}')">Use this proof</button>`:'<span class="proof-state">Read only</span>'}</div></div>`).join(""):'<div class="muted small">No approved, scan-clean, in-date evidence is currently reusable. Upload a new file below or complete Evidence checks first.</div>'):'<div class="notice good"><b>Mandatory proof ready</b><div class="small">No additional mandatory evidence is currently open for this action.</div></div>';
 if(upload)upload.hidden=!selected||!canEditEvidence();const upBtn=document.getElementById("proofActionUploadBtn");if(upBtn)upBtn.disabled=!selected||!canEditEvidence();
 const canAdvance=["owner","manager","reviewer"].includes(currentWorkspaceRole());if(completion)completion.hidden=true;
 let next=ob.status==="open"?"in_progress":ob.status==="blocked"?"in_progress":ob.status==="in_progress"?"review":ob.status==="review"?"review_inbox":null,enabled=!!next&&canAdvance;
 if(next==="review"&&!proofReady)enabled=false;
 if(advance){advance.hidden=!next||!canAdvance;advance.disabled=!enabled;advance.textContent=next==="review_inbox"?"Open review inbox":ob.status==="open"?"Start action":ob.status==="blocked"?"Resume action":"Send to review"}
 if(status){status.className="proof-action-status";status.textContent=ob.status==="completed"?"Action completed. Its completion record remains auditable.":ob.status==="open"?"Start the action to record ownership and work begun. You can add proof while it is in progress.":ob.status==="in_progress"&&!proofReady?`Next: close ${open.length} mandatory proof gap${open.length===1?"":"s"} before review.`:ob.status==="in_progress"?"Proof is ready. Send the action to review when the work itself is ready.":ob.status==="review"?"Review stage: the source action is locked from direct approval. Open the management review inbox for a named, attested approve/return decision.":ob.status==="blocked"?"This action is blocked. Resolve the blocker before relying on completion.":"No further workflow change is available."}
 if(nextState)nextState.textContent=ob.status==="completed"?"The system will surface the next open action separately; recurring future obligations are not closed by this completion.":!ob.due_at?"No authoritative deadline is recorded. Confirm the source rather than inventing a date.":"Reminders and escalation continue from the recorded deadline until this action is completed or resolved.";
}
async function useVerifiedProof(evidenceId){
 const req=selectedProofRequirement(),ob=activeProofAction.obligation;if(!req||!ob)return;if(!canLinkProofToAction()){notifyUser("Only an owner or manager can attach approved evidence to this obligation.");return false}
 const status=document.getElementById("proofActionStatus");if(status){status.className="proof-action-status";status.textContent="Attaching approved proof…"}
 if(STANDALONE_PREVIEW){req.evidence_id=evidenceId;req.evidence_name=(activeProofAction.candidates.find(x=>x.id===evidenceId)||{}).name||"Preview evidence";req.status="verified";renderProofActionContext(activeProofAction);return true}
 try{await apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/evidence-link`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({evidenceId,requirementId:req.id,linkType:"primary"})});await apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/evidence/${encodeURIComponent(req.id)}/verify`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const fresh=await apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/proof-context`);activeProofAction={...activeProofAction,obligation:fresh.obligation||ob,requirements:fresh.requirements||[],candidates:fresh.candidates||[]};const next=activeProofAction.requirements.find(x=>x.mandatory&&!["verified","not_applicable"].includes(proofReqEffectiveStatus(x)));activeProofAction.selectedRequirementId=next?.id||null;renderProofActionContext(activeProofAction);await Promise.allSettled([renderUnifiedNextActions(),renderDocumentsProofHub(),renderComplianceObligations()]);const s=document.getElementById("proofActionStatus");if(s){s.className="proof-action-status good";s.textContent="Verified proof linked to this requirement."}return true}catch(e){if(status){status.className="proof-action-status bad";status.textContent=e.message||String(e)}return false}
}
async function uploadProofForAction(){
 const req=selectedProofRequirement(),ob=activeProofAction.obligation,file=document.getElementById("proofActionFile")?.files?.[0],status=document.getElementById("proofActionStatus");if(!req||!ob)return false;if(!canEditEvidence()){notifyUser("This role cannot upload evidence.");return false}if(!file){if(status){status.className="proof-action-status bad";status.textContent="Choose a file first."}return false}
 if(STANDALONE_PREVIEW){if(status){status.className="proof-action-status good";status.textContent="Preview upload demonstrated. Production keeps the requirement open until scan + approval are complete."}return true}
 const btn=document.getElementById("proofActionUploadBtn");if(btn){btn.disabled=true;btn.textContent="Uploading…"}if(status){status.className="proof-action-status";status.textContent="Uploading to quarantine…"}
 try{const reviewDate=document.getElementById("proofActionDate")?.value||null,pre=await apiFetch("/api/evidence/presign",{method:"POST",body:JSON.stringify({companyId:state.id,filename:file.name,contentType:file.type||"application/octet-stream",size:file.size,displayName:req.label||file.name,category:req.evidence_type||"Compliance",reviewDate})});await productionApiClient.uploadPresigned(pre.uploadUrl,{body:file,contentType:file.type||"application/octet-stream"});const done=await apiFetch(`/api/evidence/${encodeURIComponent(pre.evidenceId)}/complete`,{method:"POST",body:JSON.stringify({size:file.size})});if(document.getElementById("proofActionFile"))document.getElementById("proofActionFile").value="";if(status){status.className="proof-action-status good";status.textContent=`Upload received. Scan status: ${done.scanStatus||"pending"}. The proof requirement remains open until the file is scan-clean, approved, then linked.`}await Promise.allSettled([renderDocumentsProofHub(),renderEvidenceIntegrity()]);return true}catch(e){if(status){status.className="proof-action-status bad";status.textContent=`Upload not accepted: ${e.message||String(e)}. The proof requirement remains open.`}return false}finally{if(btn){btn.disabled=false;btn.textContent="Upload securely"}}
}
async function showNextActionAfterCompletion(completedId){
 const btn=document.getElementById("proofNextAfterCompleteBtn"),nextState=document.getElementById("proofActionNextState");if(!btn)return;
 if(STANDALONE_PREVIEW){btn.hidden=false;btn.textContent="Back to Today";btn.onclick=()=>{closeModal("proofActionModal");showView("dashboard")};return}
 try{const r=await apiJson("/api/next-actions"),next=(r.items||[]).find(x=>String(x.id)!==String(completedId));if(!next){btn.hidden=true;if(nextState)nextState.textContent="No other open action is currently returned. This is not a legal all-clear; keep dates, source changes and recurring obligations under review.";return}btn.hidden=false;btn.textContent="Open next action";if(nextState)nextState.textContent=`Next in the server-backed queue: ${next.title||"Open work"}.`;btn.onclick=()=>{if(next.source==="regulatory")openActionProof("regulatory",next.id);else{closeModal("proofActionModal");showView(homeActionMeta(next.source).target)}}}catch{btn.hidden=true}
}
async function advanceProofAction(){
 const ob=activeProofAction.obligation;if(!ob)return false;if(ob.status==="review"){closeModal("proofActionModal");showView("workhub");setTimeout(focusManagementReviewInbox,120);return true}const mandatory=activeProofAction.requirements.filter(x=>Number(x.mandatory)===1),open=mandatory.filter(x=>!["verified","not_applicable"].includes(proofReqEffectiveStatus(x))),next=ob.status==="open"?"in_progress":ob.status==="blocked"?"in_progress":ob.status==="in_progress"?"review":null;if(!next)return false;
 if(next==="review"&&open.length){notifyUser("Mandatory proof is still incomplete. Start the action first, then close the required proof before review.");return false}
 const status=document.getElementById("proofActionStatus");try{
   if(STANDALONE_PREVIEW){ob.status=next;if(next==="in_progress"){ob.assigned_user_id=ob.assigned_user_id||"preview-owner";ob.assigned_name=ob.assigned_name||"Preview owner";ob.started_at=new Date().toISOString()}if(next==="review")ob.review_requested_at=new Date().toISOString();if(next==="completed")ob.completed_at=new Date().toISOString();renderProofActionContext(activeProofAction);if(next==="completed")await showNextActionAfterCompletion(ob.id);return true}
   await apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:next})});
   const [fresh,wf]=await Promise.all([apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/proof-context`),apiJson(`/api/obligations/${encodeURIComponent(ob.id)}/action-context`)]);activeProofAction={...activeProofAction,obligation:wf.obligation||fresh.obligation||{...ob,status:next},requirements:fresh.requirements||activeProofAction.requirements,candidates:fresh.candidates||activeProofAction.candidates,workflow:wf,assignees:wf.assignees||activeProofAction.assignees,reminder:wf.reminder||null,escalations:wf.escalations||[]};renderProofActionContext(activeProofAction);await Promise.allSettled([renderUnifiedNextActions(),renderDocumentsProofHub(),renderComplianceObligations(),renderHomeDecisionCenter?.()]);return true
 }catch(e){if(status){status.className="proof-action-status bad";status.textContent=e.message||String(e)}return false}
}
async function renderProofNextAction(){
 const card=document.getElementById("proofNextCard"),title=document.getElementById("proofNextTitle"),detail=document.getElementById("proofNextDetail"),progress=document.getElementById("proofNextProgress"),btn=document.getElementById("proofNextBtn");if(!card||!title||!detail||!btn)return;
 try{const r=await apiJson("/api/next-actions"),items=r.items||[],x=items.find(a=>a.source==="regulatory"&&Number(a.proofMissing||0)>0);if(x){card.dataset.state="open";title.textContent=x.title.replace(/^Compliance:\s*/,"");detail.textContent=`${Number(x.proofMissing)} mandatory proof requirement${Number(x.proofMissing)===1?"":"s"} still open. Work from the requirement instead of searching the whole document library.`;progress.safeHTML=`<span><b>${Number(x.proofTotal||0)-Number(x.proofMissing||0)}/${Number(x.proofTotal||0)}</b> verified</span><span><b>${Number(x.proofMissing||0)}</b> missing</span>`;btn.disabled=false;btn.textContent="Close this proof gap";btn.onclick=()=>openActionProof("regulatory",x.id)}else{card.dataset.state="clear";title.textContent="No missing mandatory proof is in the current action queue";detail.textContent="Keep validity and approval status under review. An empty proof queue is not a legal all-clear.";progress.safeHTML="";btn.disabled=false;btn.textContent="Review all proof";btn.onclick=()=>showView("vault")}}
 catch(e){card.dataset.state="error";title.textContent="Proof task status unavailable";detail.textContent="BW could not confirm the server action queue. Do not treat this as proof complete.";progress.safeHTML="";btn.disabled=false;btn.textContent="Retry";btn.onclick=renderProofNextAction}
}

async function renderDocumentsProofHub(){
 if(!roleCanView("evidencehub")||!state)return;syncEvidenceRoleUi();renderProofNextAction();
 const needed=proofNeededItems(),needCount=document.getElementById("proofNeedCount"),needCaption=document.getElementById("proofNeedCaption"),needList=document.getElementById("proofNeededList");
 if(needCount)needCount.textContent=String(needed.length);if(needCaption)needCaption.textContent=needed.length?`${needed.length} current control${needed.length===1?"":"s"} may need supporting proof.`:"No current proof gaps detected from the local rule view.";
 if(needList)needList.safeHTML=needed.length?needed.slice(0,4).map(r=>proofListRow(r.title,`${r.area} · ${r.status()}`,r.risk,r.risk==="High"?"bad":"warn")).join(""):'<div class="notice good">No local rule currently signals a proof gap.</div>';
 let items=[];
 if(STANDALONE_PREVIEW){items=(state.evidence||[]).map(e=>({name:e.name,category:e.cat,valid_until:e.date||null,review_status:e.verified?"approved":"quarantined",scan_status:e.verified?"clean":"preview_metadata",created_at:e.localReviewedAt||null}))}
 else{
   try{const r=await apiJson("/api/evidence/integrity");items=Array.isArray(r.items)?r.items:[]}catch(err){
     const haveCaption=document.getElementById("proofHaveCaption"),attentionCaption=document.getElementById("proofAttentionCaption");if(haveCaption)haveCaption.textContent="Secure evidence service is unavailable right now.";if(attentionCaption)attentionCaption.textContent="Evidence checks could not be loaded.";return;
   }
 }
 const statuses=items.map(x=>({item:x,status:proofEvidenceStatus(x)})),verified=statuses.filter(x=>x.status.kind==="good"),attention=statuses.filter(x=>x.status.kind!=="good");
 const haveCount=document.getElementById("proofHaveCount"),haveCaption=document.getElementById("proofHaveCaption"),haveList=document.getElementById("proofHaveList"),attentionCount=document.getElementById("proofAttentionCount"),attentionCaption=document.getElementById("proofAttentionCaption"),attentionList=document.getElementById("proofAttentionList");
 if(haveCount)haveCount.textContent=String(items.length);if(haveCaption)haveCaption.textContent=`${verified.length} verified and ready to rely on${items.length?` out of ${items.length}`:""}.`;
 if(attentionCount)attentionCount.textContent=String(attention.length);if(attentionCaption)attentionCaption.textContent=attention.length?`${attention.length} item${attention.length===1?"":"s"} need scan, approval or date attention.`:"All stored proof is currently scan-clean, approved and in date.";
 if(haveList)haveList.safeHTML=items.length?statuses.slice(0,4).map(({item,status})=>proofListRow(item.name,item.category||"Evidence",status.label,status.kind)).join(""):'<div class="empty"><b>No evidence yet</b><span class="muted small">Add proof as it is created instead of rebuilding packs later.</span></div>';
 if(attentionList)attentionList.safeHTML=attention.length?attention.slice(0,4).map(({item,status})=>proofListRow(item.name,status.reason,status.label,status.kind)).join(""):'<div class="notice good">No evidence currently needs scan, approval or validity attention.</div>';
}

function renderVault(){
 syncEvidenceRoleUi();
 const list=document.getElementById("vaultList");if(!list)return;const editable=canEditEvidence();
 list.safeHTML=state.evidence.length?state.evidence.map((e,i)=>{
   const reviewed=!!e.verified;const secure=e.fileUploaded&&!STANDALONE_PREVIEW;
   const status=secure?"secure upload · use Evidence Security for approval":(reviewed?"locally reviewed · not assurance":"local metadata · not assurance");
   const action=secure?`<button class="btn soft" data-bw-onclick="showView('evidenceintegrity')">Open secure review</button>`:(editable?`<button class="btn soft" data-bw-onclick="verifyEvidence(${i})">${reviewed?"Reviewed ✓":"Mark reviewed"}</button>`:`<span class="proof-state">Read only</span>`);
   const remove=editable?`<button class="btn alt" data-bw-onclick="removeEvidence(${i})">Remove</button>`:"";
   return `<div class="item"><div class="between row"><div><b>${escapeHtml(e.name)}</b><div class="muted small">${escapeHtml(e.cat)}${e.date?" · review "+escapeHtml(e.date):""} · ${escapeHtml(status)}</div></div><div class="actions">${action}${remove}</div></div></div>`
 }).join(""):`<div class="empty"><b>No evidence yet</b><span class="muted small">${editable?"Add evidence here for setup. ":"No evidence is available in this workspace. "}Production assurance only counts evidence that passes secure upload, malware scanning and approval.</span></div>`;
}
function verifyEvidence(index){
 if(!canEditEvidence()){notifyUser("Auditor access is read-only for evidence records.");return false}
 const i=Number(index),e=state.evidence?.[i];if(!e)return;
 if(e.fileUploaded&&!STANDALONE_PREVIEW){showView("evidenceintegrity");return}
 updateActiveCompany(c=>{const items=[...(c.evidence||[])],current=items[i];if(!current)return;c.evidence=items.map((item,idx)=>idx===i?{...item,verified:!current.verified,localReviewedAt:!current.verified?new Date().toISOString():null}:item)});
 save();renderAll();
}
async function removeEvidence(index){
 if(!canEditEvidence()){notifyUser("Auditor access is read-only for evidence records.");return false}
 const i=Number(index),e=state.evidence?.[i];if(!e)return;
 if(e.fileUploaded&&!STANDALONE_PREVIEW){notifyUser("Secure evidence must be deleted through the protected evidence/deletion workflow.");showView('evidenceintegrity');return}
 const confirmed=await BW.dialog.confirm({title:"Remove evidence item?",message:`Remove ${e.name||"this evidence item"}?`,confirmLabel:"Remove",danger:true});if(!confirmed)return;updateActiveCompany(c=>{c.evidence=(c.evidence||[]).filter((_,idx)=>idx!==i)});save();renderAll();
}
async function addEvidence(){
 if(!canEditEvidence()){notifyUser("Auditor access is read-only for evidence records.");return false}
 let n=document.getElementById("evName").value.trim();if(!n)return;
 let ev={id:"ev_"+Date.now(),name:n,cat:document.getElementById("evCat").value,date:document.getElementById("evDate").value,verified:false,fileUploaded:false};
 const file=document.getElementById("evFile")?.files?.[0];
 if(!STANDALONE_PREVIEW&&currentWorkspaceRole()==="reviewer"&&!file){notifyUser("Reviewer evidence must include a file so it can enter the secure scan and approval workflow.");return false}
 if(file){
   try{
     const pre=await apiFetch("/api/evidence/presign",{method:"POST",body:JSON.stringify({companyId:state.id,filename:file.name,contentType:file.type||"application/octet-stream",size:file.size,displayName:n,category:ev.cat,reviewDate:ev.date||null})});
     await productionApiClient.uploadPresigned(pre.uploadUrl,{body:file,contentType:file.type||"application/octet-stream"});
     await apiFetch(`/api/evidence/${pre.evidenceId}/complete`,{method:"POST",body:JSON.stringify({size:file.size})});
     ev.serverEvidenceId=pre.evidenceId;ev.fileUploaded=true;ev.objectKey=pre.objectKey;
   }catch(err){
     notifyUser("Evidence upload failed and was not saved. Fix the upload/scanner issue and try again: "+(err?.message||"Upload failed"));
     return false;
   }
 }
 if(!STANDALONE_PREVIEW&&currentWorkspaceRole()==="reviewer"&&ev.fileUploaded){document.getElementById("evName").value="";if(document.getElementById("evFile"))document.getElementById("evFile").value="";await renderDocumentsProofHub();await renderEvidenceIntegrity();return true}
 updateActiveCompany(c=>{c.evidence=[...(c.evidence||[]),ev]});logEvent("EVIDENCE_ADDED",{evidenceId:ev.id,name:n,category:ev.cat,fileUploaded:ev.fileUploaded});document.getElementById("evName").value="";if(document.getElementById("evFile"))document.getElementById("evFile").value="";save();renderAll();return true
};
const businessEvents={
  premises:{title:"Moved premises",actions:[
    ["Licences & premises approvals","Check whether any trade, industrial or sector licence records need an address/premises update."],
    ["Planning, zoning & lease","Confirm permitted use, landlord/lease controls and any local premises approvals."],
    ["Inspection dependencies","Re-check health, fire, environmental or other inspections that depend on the operating location."]
  ]},
  ownership:{title:"Ownership changed",actions:[
    ["CIPA particulars","Reconcile directors, shareholders and other registered particulars against the latest approved company records."],
    ["Beneficial ownership","Review beneficial-owner information and any internal evidence that must be refreshed."],
    ["Linked licences & counterparties","Check whether banks, insurers, payment providers, licences or material contracts require updated ownership/control information."]
  ]},
  activity:{title:"New business activity",actions:[
    ["Activity classification","Record the exact new activity before deciding which rule or licence applies."],
    ["Licensing & reserved activities","Check current official requirements and any ownership/reserved-activity restrictions before operating."],
    ["Tax & operating controls","Reassess tax configuration, invoicing, evidence, insurance and sector-specific controls affected by the activity."]
  ]},
  hire:{title:"Hiring employees",actions:[
    ["Employment records","Prepare factual employee records, role terms, start date and required signed documentation."],
    ["Payroll & tax setup","Review payroll/PAYE and related employer registrations or deductions using current verified requirements."],
    ["Workplace controls","Assign assets, access, privacy, safety and manager reporting controls appropriate to the role."]
  ]},
  tax:{title:"Tax status changed",actions:[
    ["Tax profile","Reconcile the change against current BURS registration/account information before changing automated rules."],
    ["VAT / PAYE / SAT","Review affected tax types and effective dates; keep disputed or conflicting thresholds fail-closed for professional verification."],
    ["Billing & evidence","Update invoices, payment records, reconciliations and evidence schedules only after the effective tax treatment is confirmed."]
  ]},
  manufacture:{title:"Start manufacturing",actions:[
    ["Industrial / sector licensing","Check the exact activity, product and premises against current industrial or sector requirements."],
    ["Premises, safety & environment","Review factory/premises approvals, worker safety, environmental controls and inspection dependencies."],
    ["Supply-chain evidence","Record suppliers, product/quality evidence and any controlled or reserved inputs before production scales."]
  ]},
  data:{title:"New customer-data use",actions:[
    ["Purpose & minimisation","Document why the data is needed, what is collected and whether the same outcome can use less information."],
    ["Notice, access & retention","Review privacy notice, user access, retention/deletion and incident-response controls."],
    ["Vendors & transfers","Review processor/vendor access and any cross-border processing before exposing customer data to a new service."]
  ]}
};

function runEvent(k){
 let ev=businessEvents[k];if(!ev)return;
 document.getElementById("eventOutput").safeHTML=`<div class="notice"><b>${ev.title}</b><div class="small" style="margin-top:7px">Re-check these areas:</div><ol>${ev.actions.map(a=>`<li><b>${a[0]}:</b> ${a[1]}</li>`).join("")}</ol><div class="source">This event workflow identifies review areas. It does not assume a filing is legally required without validating the exact business activity and facts.</div></div>`;
 logEvent("BUSINESS_EVENT_REVIEWED",{event:k});
}

async function renderPeopleOperationsHub(){
  if(!roleCanView("peopleops")||!["owner","manager"].includes(currentWorkspaceRole()))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  const date=browserGaboroneDate();
  const results=await Promise.allSettled([apiJson("/api/employees"),reportingAnalyticsJson(`/api/daily-reporting/dashboard?date=${encodeURIComponent(date)}`),apiJson("/api/hr/cases"),apiJson("/api/employer-risk")]);
  const employees=results[0].status==="fulfilled"?(results[0].value.items||[]):[];
  const dash=results[1].status==="fulfilled"?results[1].value:null;
  const cases=results[2].status==="fulfilled"?(results[2].value.items||[]):[];
  const risk=results[3].status==="fulfilled"?results[3].value:null;
  const activeEmployees=employees.filter(x=>String(x.status||"active").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(x.id))).length;
  const openCases=cases.filter(x=>String(x.status||"")!=="closed").length;
  const coverage=dash&&Number.isFinite(Number(dash.coverage))?Math.max(0,Math.min(100,Math.round(Number(dash.coverage)))):null;
  const missing=Array.isArray(dash?.missing)?dash.missing.length:0;
  const attention=Number(dash?.totals?.attention||0);
  const band=String(risk?.riskBand||"");
  set("peopleActiveEmployees",activeEmployees||0);set("peopleOpenCases",openCases);set("peopleReportingCoverage",coverage==null?"—":coverage+"%");set("peopleProtectionBand",band?band[0].toUpperCase()+band.slice(1):"Review");
  set("peopleReportingDetail",coverage==null?"Open daily reports to check today’s reporting status.":`${coverage}% reporting coverage today${missing?` · ${missing} report${missing===1?"":"s"} not received`:" · all expected reports received"}.`);
  const contractCoverage=Number(risk?.dimensions?.contractCoverage);
  set("peopleEmployeeDetail",Number.isFinite(contractCoverage)?`${activeEmployees} active employee${activeEmployees===1?"":"s"} · ${Math.round(contractCoverage)}% contract coverage.`:`${activeEmployees} active employee${activeEmployees===1?"":"s"}. Keep staff and contract records current.`);
  const findings=Array.isArray(risk?.findings)?risk.findings:[];const high=findings.filter(x=>["high","critical"].includes(String(x.severity||""))).length;
  set("peopleFollowupDetail",`${high||0} high-priority control gap${high===1?"":"s"}${openCases?` · ${openCases} open employment case${openCases===1?"":"s"}`:""}${attention?` · ${attention} report flag${attention===1?"":"s"}`:""}.`);
}

async function renderBusinessHub(){
  if(!roleCanView("businesshub")||!["owner","manager"].includes(currentWorkspaceRole()))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  const p=state?.profile||{};
  const cipa=cipaSurvivalState();
  const readiness=state?.bwReadiness||{},readinessKeys=["taxRecords","einvoice","labour","cipa","egp","taxAgent","mobile"],readinessDone=readinessKeys.filter(k=>!!readiness[k]).length;
  set("businessCipaWatch",cipa.label||"Review");
  set("businessStandingDetail",`${cipa.detail||"Review the annual-return record."} ${readinessDone}/${readinessKeys.length} Botswana readiness checks are marked complete.`);
  if(roleCanView("profile")){
    const core=[String(p.name||"").trim(),String(p.entityType||"").trim(),String(p.industry||"").trim(),String(p.town||"").trim()],done=core.filter(Boolean).length,pct=Math.round(done/core.length*100);
    set("businessProfileWatch",pct+"% complete");
  }
  if(roleCanView("taxprofile")){
    const conflicts=sourceConflicts.filter(c=>c.area==="Tax").length,tracked=[p.vat?"VAT":null,p.paye?"PAYE":null].filter(Boolean);
    set("businessTaxWatch",conflicts?`${conflicts} source conflict${conflicts===1?"":"s"}`:(tracked.length?tracked.join(" + "):"Not selected"));
    set("businessTaxDetail",conflicts?`${conflicts} tax source conflict${conflicts===1?" is":"s are"} blocked from automated threshold conclusions. Review confirmed taxpayer facts.`:(tracked.length?`${tracked.join(" and ")} are selected in Business details. Confirm category, period and source-backed facts before relying on deadlines.`:"VAT and PAYE are not selected in Business details. Review only if the taxpayer position changes."));
  }
  if(roleCanView("licenceos")){
    try{
      const r=await apiJson("/api/licences"),items=r.items||[],states=items.map(x=>({x,s:licenceDateState(x.renewal_due_at)}));
      const risk=states.filter(({x,s})=>x.status!=="active"||(s.days!==null&&s.days<0)).length,due=states.filter(({s})=>s.days!==null&&s.days>=0&&s.days<=30).length,missing=states.filter(({s})=>s.days===null).length;
      set("businessLicenceWatch",risk?`${risk} at risk`:due?`${due} due soon`:missing?`${missing} date${missing===1?"":"s"} needed`:items.length?"Up to date":"None recorded");
      set("businessLicenceDetail",risk?`${risk} recorded licence or registration item${risk===1?" needs":"s need"} immediate authority-status follow-up.`:due?`${due} renewal or annual-fee date${due===1?" is":"s are"} within 30 days.`:missing?`${missing} recorded item${missing===1?" needs":"s need"} an authority-confirmed next date.`:items.length?`${items.length} recorded licence or registration item${items.length===1?" is":"s are"} not currently flagged as late or due within 30 days.`:"No licence or registration is recorded. Confirm applicability before adding one.");
    }catch(_){set("businessLicenceWatch","Status unavailable");set("businessLicenceDetail","Licence status could not be confirmed. Open the register and retry before treating the business as clear.")}
  }
}

async function addEmployeeRecord(){
  const name=document.getElementById("eName")?.value.trim()||"";if(!name)return notifyUser("Enter an employee name or work reference.");
  if(STANDALONE_PREVIEW){
    const rec={id:"emp_"+Date.now(),name,role:document.getElementById("eRole")?.value.trim()||"",start:document.getElementById("eStart")?.value||"",contract:document.getElementById("eContract")?.value==="true",asset:document.getElementById("eAsset")?.value==="true"};
    updateActiveCompany(company=>{const employees=[...(company.employees||[]),rec];company.employees=employees;company.profile={...company.profile,employees:Math.max(Number(company.profile?.employees||0),employees.length)}});
    logEvent("EMPLOYEE_RECORD_ADDED",{employeeId:rec.id,role:rec.role,contract:rec.contract,asset:rec.asset});
    document.getElementById("eName").value="";document.getElementById("eRole").value="";document.getElementById("eStart").value="";save();renderAll();return;
  }
  const roleTitle=document.getElementById("eRole")?.value.trim()||"",startDate=document.getElementById("eStart")?.value||null;
  const contractSigned=document.getElementById("eContract")?.value==="true",assetAcknowledgement=document.getElementById("eAsset")?.value==="true";
  try{
    const created=await apiJson("/api/employees",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fullName:name,roleTitle,employmentType:"unknown",startDate})});
    if(created?.id){
      try{
        await apiJson(`/api/employees/${encodeURIComponent(created.id)}/risk-controls`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({contractSigned,contractType:"unknown",assetAcknowledgement})});
      }catch(controlError){notifyUser("Employee saved, but contract/asset controls need review: "+controlError.message)}
    }
    document.getElementById("eName").value="";document.getElementById("eRole").value="";document.getElementById("eStart").value="";
    await renderEmployeeRegister();
    if(document.getElementById("peopleops")?.classList.contains("active")){await renderPeopleOperationsHub();await renderPeopleReportingSetup()}
    if(document.getElementById("dailyreports")?.classList.contains("active"))await renderDailyOperations();
    notifyUser("Employee saved. It is now available for reporting access.",{type:"success"});
  }catch(e){notifyUser(e.message)}
}
async function removeEmployeeRecord(id){
 if(STANDALONE_PREVIEW){
   let rec=(state.employees||[]).find(e=>e.id===id);updateActiveCompany(c=>{c.employees=(c.employees||[]).filter(e=>e.id!==id);c.profile={...c.profile,employees:c.employees.length}});
   logEvent("EMPLOYEE_RECORD_REMOVED",{employeeId:id,employeeRef:rec?.name});save();renderAll();return;
 }
 const confirmed=await BW.dialog.confirm({title:"Remove employee?",message:"Remove this employee from active staff? Their historical employment and reporting records will be retained, and any active reporting links will be revoked.",confirmLabel:"Remove employee",danger:true});
 if(!confirmed)return;
 try{
   await apiJson(`/api/employees/${encodeURIComponent(id)}`,{method:"DELETE"});
   recentlyRemovedEmployeeIds.add(String(id));
   document.querySelector(`#employeeRegister [data-employee-id="${CSS.escape(String(id))}"]`)?.remove();
   if(globalThis.__activeEmployeesById)delete globalThis.__activeEmployeesById[String(id)];
   if(globalThis.__employeeReporterLinks)delete globalThis.__employeeReporterLinks[String(id)];
   await renderEmployeeRegister();
   if(document.getElementById("peopleops")?.classList.contains("active")){await renderPeopleOperationsHub();await renderPeopleReportingSetup()}
   if(document.getElementById("dailyreports")?.classList.contains("active"))await renderDailyOperations();
   notifyUser("Employee removed from active staff. Historical records were retained and reporting access was revoked.",{type:"success"});
 }catch(e){notifyUser(e.message)}
}
async function openEmployeeReportingAccess(id){
 const box=document.getElementById(`employeeReportingAccess_${id}`);if(!box)return;
 if(box.dataset.open==="1"){box.hidden=true;box.dataset.open="0";return}
 box.hidden=false;box.dataset.open="1";box.safeHTML='<div class="muted small">Loading reporting access…</div>';
 try{
   const [accessData,locationData]=await Promise.all([apiJson("/api/daily-reporting/access"),apiJson("/api/daily-reporting/locations")]);
   const activeAccess=(accessData.items||[]).filter(x=>String(x.employee_id)===String(id)&&x.status==="active");
   const locations=(locationData.items||[]).filter(x=>Number(x.active)===1);
   const cachedLink=globalThis.__employeeReporterLinks?.[String(id)]||"";const accessHtml=activeAccess.length?activeAccess.map(x=>`<div class="item" style="margin-top:7px"><div class="between row"><div><b>${escapeHtml(x.location_name||"Location")}</b><div class="muted small">Active until ${new Date(x.expires_at).toLocaleDateString()}${x.last_used_at?` · last used ${new Date(x.last_used_at).toLocaleDateString()}`:" · not used yet"}</div></div><button class="btn soft" type="button" data-bw-onclick="showFreshEmployeeReportingLink('${safeId(id)}','${safeId(x.location_id)}')">Show fresh link</button></div></div>`).join(""):'<div class="muted small">No active reporting access yet.</div>';
   const options=locations.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join("");
   box.safeHTML=`<div class="notice info"><b>Employee reporting access</b><div class="small">Previously issued bearer URLs are stored only as hashes. When one active reporting access exists, opening the employee issues and shows one fresh replacement link for this session.</div></div>${accessHtml}${cachedLink?`<div class="notice good" style="margin-top:9px"><b>Private reporting link</b><div class="ops-access-link"><input id="employeeReporterLink_${safeId(id)}" readonly value="${escapeHtml(cachedLink)}"><button class="btn alt" type="button" data-bw-onclick="copyEmployeeReportingLink('${safeId(id)}')">Copy link</button></div></div>`:""}${locations.length?`<div class="formgrid" style="margin-top:9px"><div><label for="employeeReportingLocation_${safeId(id)}">Location</label><select id="employeeReportingLocation_${safeId(id)}">${options}</select></div></div><button class="btn soft" type="button" style="margin-top:8px" data-bw-onclick="createEmployeeReportingLinkFromCard('${safeId(id)}')">${activeAccess.length?"Rotate and show fresh link":"Create and show reporting link"}</button><div id="employeeReportingLinkResult_${safeId(id)}"></div>`:'<div class="muted small" style="margin-top:8px">Add an active location before issuing reporting access.</div>'}`;

   if(!cachedLink&&activeAccess.length===1&&locations.some(x=>String(x.id)===String(activeAccess[0].location_id))){
     const select=document.getElementById(`employeeReportingLocation_${id}`);if(select)select.value=String(activeAccess[0].location_id);
     await createEmployeeReportingLinkFromCard(id);
   } }catch(e){box.safeHTML=`<div class="notice bad">Reporting access could not load. ${escapeHtml(e.message)}</div>`}
}
async function showFreshEmployeeReportingLink(id,locationId){const select=document.getElementById(`employeeReportingLocation_${id}`);if(select&&[...select.options].some(o=>o.value===String(locationId)))select.value=String(locationId);return createEmployeeReportingLinkFromCard(id)}
async function createEmployeeReportingLinkFromCard(id){
 const select=document.getElementById(`employeeReportingLocation_${id}`),locationId=select?.value||"",result=document.getElementById(`employeeReportingLinkResult_${id}`);if(!locationId||!result)return notifyUser("Choose a location.");
 try{
   const r=await apiJson("/api/daily-reporting/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({employeeId:id,locationId,expiresInDays:180})});
   globalThis.__employeeReporterLinks=globalThis.__employeeReporterLinks||{};globalThis.__employeeReporterLinks[String(id)]=String(r.link||"");
   result.safeHTML=`<div class="notice good" style="margin-top:9px"><b>Private reporting link</b><div class="small">This fresh link replaced any previous link for the same employee and location.</div><div class="ops-access-link"><input id="employeeReporterLink_${safeId(id)}" readonly value="${escapeHtml(r.link||"")}"><button class="btn alt" type="button" data-bw-onclick="copyEmployeeReportingLink('${safeId(id)}')">Copy link</button></div></div>`;
   await renderPeopleReportingSetup();
 }catch(e){result.safeHTML=`<div class="notice bad" style="margin-top:9px">${escapeHtml(e.message)}</div>`}
}
async function copyEmployeeReportingLink(id){const el=document.getElementById(`employeeReporterLink_${id}`);if(!el)return;try{await navigator.clipboard.writeText(el.value)}catch{el.select();document.execCommand("copy")}}
function toggleEmployeeControl(id,field){
 const rec=(state.employees||[]).find(e=>e.id===id);if(!rec)return;const value=!rec[field];
 updateActiveCompany(c=>{c.employees=(c.employees||[]).map(item=>item.id===id?{...item,[field]:value}:item)});
 logEvent("EMPLOYEE_CONTROL_UPDATED",{employeeId:id,control:field,value});save();renderAll()
}
async function renderEmployeeRegister(){
  const by=id=>document.getElementById(id),el=by("employeeRegister");if(!el)return;
  if(STANDALONE_PREVIEW){
    const arr=state.employees||[],total=arr.length,contracts=arr.filter(e=>e.contract).length,assets=arr.filter(e=>e.asset).length;
    if(by("empRecordsCount"))by("empRecordsCount").textContent=total;if(by("contractCoverage"))by("contractCoverage").textContent=(total?Math.round(contracts/total*100):0)+"%";if(by("assetCoverage"))by("assetCoverage").textContent=(total?Math.round(assets/total*100):0)+"%";
    el.safeHTML=arr.length?arr.map(e=>`<div class="item"><div class="between row"><div><b>${escapeHtml(e.name)}</b><div class="muted small">${escapeHtml(e.role||"Role not set")} · ${e.start||"Start date not set"}</div></div><button class="btn alt" data-bw-onclick="removeEmployeeRecord('${safeId(e.id)}')">Remove</button></div><div class="rulemeta"><button class="btn ${e.contract?"soft":"alt"}" data-bw-onclick="toggleEmployeeControl('${safeId(e.id)}','contract')">Contract ${e.contract?"✓":"missing"}</button><button class="btn ${e.asset?"soft":"alt"}" data-bw-onclick="toggleEmployeeControl('${safeId(e.id)}','asset')">Asset form ${e.asset?"✓":"missing"}</button></div></div>`).join(""):`<div class="muted small">No employee records yet.</div>`;return;
  }
  try{
    const response=await apiJson("/api/employees"),arr=response.items||[],active=arr.filter(e=>String(e.status||"").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(e.id))),contracts=active.filter(e=>Number(e.contract_signed||0)===1).length,assets=active.filter(e=>Number(e.asset_acknowledgement||0)===1).length,total=active.length;
    globalThis.__activeEmployeesById=Object.fromEntries(active.map(e=>[String(e.id),e]));
    if(by("empRecordsCount"))by("empRecordsCount").textContent=total;if(by("contractCoverage"))by("contractCoverage").textContent=(total?Math.round(contracts/total*100):0)+"%";if(by("assetCoverage"))by("assetCoverage").textContent=(total?Math.round(assets/total*100):0)+"%";
    el.safeHTML=active.length?active.map(e=>`<div class="item" data-employee-id="${escapeHtml(e.id)}"><div class="between row"><button type="button" style="all:unset;cursor:pointer;display:block;flex:1;min-width:0" data-bw-onclick="openEmployeeReportingAccess('${safeId(e.id)}')" aria-label="Open reporting access for ${escapeHtml(e.full_name)}"><b>${escapeHtml(e.full_name)}</b><div class="muted small">${escapeHtml(e.role_title||"Role not set")} · ${e.start_date||"Start date not set"} · click employee to view reporting link</div></button><div class="actions"><span class="badge good">Active</span><button class="btn soft" type="button" data-bw-onclick="openEmployeeReportingAccess('${safeId(e.id)}')">Reporting link</button><button class="btn alt" type="button" data-bw-onclick="removeEmployeeRecord('${safeId(e.id)}')">Remove</button></div></div><div class="rulemeta"><span class="pill">Contract ${Number(e.contract_signed||0)===1?"✓":"missing"}</span><span class="pill">Asset form ${Number(e.asset_acknowledgement||0)===1?"✓":"missing"}</span></div><div id="employeeReportingAccess_${safeId(e.id)}" hidden style="margin-top:10px"></div></div>`).join(""):`<div class="muted small">No active employee records yet. Add one here and it will also become available under Employee reporting access.</div>`;
  }catch(e){el.safeHTML=`<div class="notice bad">Employee records could not load. ${escapeHtml(e.message)}</div>`}
}

const tenderRequirements=[
 {id:"t_cipa",name:"Current CIPA annual-return evidence",patterns:["annual return","cipa"],area:"Corporate"},
 {id:"t_constitution",name:"Company constitution",patterns:["constitution"],area:"Corporate"},
 {id:"t_tax",name:"Tax clearance / BURS evidence",patterns:["tax clearance","burs"],area:"Tax"},
 {id:"t_trade",name:"Current trade licence / registration",patterns:["trade licence","trade license","registration certificate"],area:"Licensing"},
 {id:"t_financials",name:"Recent financial statements",patterns:["financial statement","financials"],area:"Finance"},
 {id:"t_edd",name:"EDD certificate / application evidence (where relevant)",patterns:["edd certificate","economic diversification"],area:"Tender"},
 {id:"t_profile",name:"Company capability/profile document",patterns:["company profile","capability"],area:"Tender"},
 {id:"t_ids",name:"Director/shareholder identification pack",patterns:["director id","shareholder id","omang","passport"],area:"Corporate"}
];
function evidenceMatches(req){
 return (state.evidence||[]).some(e=>e.verified && req.patterns.some(p=>e.name.toLowerCase().includes(p)));
}
function renderTender(){
 let total=tenderRequirements.length, verified=tenderRequirements.filter(evidenceMatches).length, missing=total-verified, score=Math.round(verified/total*100);
 let q=id=>document.getElementById(id);
 if(q("tenderScore"))q("tenderScore").textContent=score+"%";if(q("tenderBar"))q("tenderBar").style.width=score+"%";
 if(q("tenderVerified"))q("tenderVerified").textContent=verified;if(q("tenderMissing"))q("tenderMissing").textContent=missing;
 if(q("tenderChecklist"))q("tenderChecklist").safeHTML=tenderRequirements.map(r=>`<div class="checkline"><span class="dot ${evidenceMatches(r)?"good":"warn"}"></span><div><b>${r.name}</b><div class="muted small">${r.area} · ${evidenceMatches(r)?"Verified evidence found":"Evidence missing/unverified"}</div></div></div>`).join("");
 if(q("tenderPackPreview"))q("tenderPackPreview").safeHTML=`<b>${escapeHtml(state.profile.name)}</b><div class="muted small">Tender readiness ${score}%</div><hr style="border:0;border-top:1px solid var(--line);margin:10px 0">${tenderRequirements.map(r=>`<div class="small">${evidenceMatches(r)?"✓":"○"} ${r.name}</div>`).join("")}`;
}
function exportTenderPack(){
 let payload={generatedAt:new Date().toISOString(),company:state.profile.name,readiness:tenderRequirements.map(r=>({requirement:r.name,area:r.area,verified:evidenceMatches(r)})),disclaimer:"Internal readiness pack. Verify tender-specific requirements before submission."};
 downloadJson(payload,slug(state.profile.name)+"-tender-readiness.json");
 logEvent("TENDER_PACK_EXPORTED",{});
}

const privacyControls=[
 ["inventory","Data inventory exists","Know what personal data the business holds and where it is stored."],
 ["notice","Privacy notice / transparency information exists","Explain relevant processing to data subjects in an appropriate form."],
 ["access","Access to personal data is limited","Restrict employee/system access according to role and need."],
 ["retention","Retention/deletion rules exist","Avoid keeping personal data indefinitely without an operational/legal reason."],
 ["incident","Data-incident response process exists","Know how to identify, contain, document and escalate a data incident."],
 ["processor","Third-party processor/vendor register exists","Record providers that receive or handle business personal data."]
];
function togglePrivacyControl(k){
 updateActiveCompany(c=>{const privacy=c.privacy||{controls:{},activities:[]};c.privacy={...privacy,controls:{...(privacy.controls||{}),[k]:!privacy.controls?.[k]}}});
 logEvent("PRIVACY_CONTROL_UPDATED",{control:k,value:state.privacy.controls[k]});save();renderAll()
}
function addDataActivity(){
 let a=dpActivity.value.trim();if(!a)return;
 let rec={id:"dp_"+Date.now(),activity:a,category:dpCategory.value.trim(),purpose:dpPurpose.value.trim(),access:dpAccess.value.trim()};
 updateActiveCompany(c=>{const privacy=c.privacy||{controls:{},activities:[]};c.privacy={...privacy,activities:[...(privacy.activities||[]),rec]}});logEvent("DATA_ACTIVITY_ADDED",{activityId:rec.id,activity:rec.activity});
 dpActivity.value=dpCategory.value=dpPurpose.value=dpAccess.value="";save();renderAll()
}
function removeDataActivity(id){updateActiveCompany(c=>{const p=c.privacy||{controls:{},activities:[]};c.privacy={...p,activities:(p.activities||[]).filter(a=>a.id!==id)}});logEvent("DATA_ACTIVITY_REMOVED",{activityId:id});save();renderAll()}
function renderPrivacy(){
 let c=state.privacy?.controls||{},done=privacyControls.filter(x=>c[x[0]]).length,score=Math.round(done/privacyControls.length*100),gaps=privacyControls.length-done;
 let q=id=>document.getElementById(id);if(q("privacyScore")){q("privacyScore").textContent=score;q("privacyScore").className="score "+(score>=80?"good":score>=55?"warn":"bad")}
 if(q("dataActivityCount"))q("dataActivityCount").textContent=(state.privacy.activities||[]).length;if(q("privacyGaps"))q("privacyGaps").textContent=gaps;
 if(q("privacyChecklist"))q("privacyChecklist").safeHTML=privacyControls.map(x=>`<div class="checkline"><input type="checkbox" ${c[x[0]]?"checked":""} data-bw-onchange="togglePrivacyControl('${x[0]}')"><div><b>${x[1]}</b><div class="muted small">${x[2]}</div></div></div>`).join("");
 if(q("dataActivityList"))q("dataActivityList").safeHTML=(state.privacy.activities||[]).map(a=>`<div class="item"><div class="between row"><div><b>${escapeHtml(a.activity)}</b><div class="muted small">${escapeHtml(a.category)} · ${escapeHtml(a.purpose)}</div><div class="source">Access: ${escapeHtml(a.access||"Not specified")}</div></div><button class="btn alt" data-bw-onclick="removeDataActivity('${safeId(a.id)}')">Remove</button></div></div>`).join("")||'<div class="muted small">No processing activities recorded.</div>';
}

function renderEmployees(){
 const {element,renderList}=BW.components;document.getElementById("employeeCount").textContent=state.profile.employees;
 const gaps=Math.min(6,Math.max(0,Math.ceil(state.profile.employees*.35)));document.getElementById("employeeGaps").textContent=gaps;
 const arr=[["Employment contracts","Verified",true],["Job descriptions","Needs review",false],["Leave records","Verified",true],["Asset acknowledgements","Missing for some staff",false],["Disciplinary/performance evidence","Needs review",false]];
 renderList(document.getElementById("employeeFiles"),arr,x=>element("div",{className:"item"},[element("span",{className:`dot ${x[2]?"good":"warn"}`}),element("b",{text:x[0]}),element("div",{className:"muted small",text:x[1],attrs:{style:"margin-left:17px"}})]));
}
function startWorkflow(name){
 let steps={
 "Absence / AWOL":["Record exact absence dates","Attempt and log contact","Preserve messages/call evidence","Issue appropriate notice using the validated rule set","Allow and record employee response","Escalate before dismissal if legal risk remains"],
 "Poor performance":["Define expected standard","Record objective evidence of the performance gap","Meet employee and record response","Set measurable improvement plan where appropriate","Review outcome","Escalate termination decision for legal review"],
 "Misconduct":["Secure evidence","Record allegation accurately","Avoid predetermined outcome","Follow the validated disciplinary procedure","Record employee response","Document decision and reason"],
 "Asset damage/loss":["Identify asset and custody record","Preserve evidence","Obtain employee account","Separate investigation from any payroll deduction","Check lawful deduction basis","Escalate disputed/high-value recovery"],
 "Salary advance/deduction":["Record amount and purpose","Generate written agreement/authorization","Validate legal deduction conditions and limits","Set repayment schedule","Keep payroll evidence","Escalate unusual deductions"],
 "Termination review":["Identify proposed reason","Check evidence completeness","Check procedural steps","Calculate potential contractual/statutory amounts","Flag missing evidence","Require expert review for high-risk termination"]
 }[name];
 document.getElementById("workflowOutput").safeHTML=`<div class="notice"><b>${name}</b><ol>${steps.map(s=>`<li>${s}</li>`).join("")}</ol><div class="small"><b>Control:</b> This is a risk-management workflow, not an automatic legal decision. High-risk employment actions must be checked against the effective law and facts.</div><div class="actions" style="margin-top:10px"><button class="btn" data-bw-onclick="openCase('${name.replaceAll("'","")}')">Open protected case</button></div></div>`;
}
function renderDocs(){
 let docs=["Beneficial ownership declaration pack","Corporate change evidence pack","Employment contract","Job description","Warning notice","Disciplinary meeting record","Performance improvement plan","Leave form","Salary advance agreement","Asset issue acknowledgement","Privacy notice","Board resolution","Company constitution checklist","CIPA annual-return preparation pack","Trade-licence annual-fee pack","Tender compliance pack","Compliance evidence report","Tender readiness pack","Data-processing register"];
 document.getElementById("docGrid").safeHTML=docs.map(d=>`<div class="card" style="box-shadow:none"><h3>${d}</h3><div class="muted small">Profile-aware controlled template</div><button class="btn soft" style="margin-top:10px" data-bw-onclick="generateDoc('${d}')">Generate draft</button></div>`).join("");
}
function generateDoc(name){
 let high=/Warning|Disciplinary|Salary advance/.test(name);
 logEvent("DOCUMENT_DRAFT_REQUESTED",{name,professionalReview:high});
 notifyUser(`${name} draft workflow started.\n\n${high?"Professional review flag: ON":"Professional review flag: as required"}\n\nProduction version must generate from a versioned Botswana legal template library and retain the ruleset/effective date used.`);
}
function renderChanges(){document.getElementById("lawChanges").safeHTML=lawChanges.map(c=>`<div class="item"><div class="between row"><div><b>${escapeHtml(c.title)}</b><div class="muted small">${escapeHtml(c.date)}</div></div><span class="badge ${riskClass(c.impact)}">${escapeHtml(c.impact)}</span></div><p class="small">${escapeHtml(c.text)}</p><div class="source">Source: <a href="${safeExternalUrl(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.source)}</a></div></div>`).join("")}
function profileInputValue(id,fallback=""){const el=document.getElementById(id);return el?el.value:fallback}
function syncProfileProgressiveFields(){
 const get=id=>profileInputValue(id,"");
 const entity=get("pEntityType"),vat=get("pVat")==="true",paye=get("pPaye")==="true",trade=get("pTrade")==="true",data=get("pData")==="true",tender=get("pTender")==="true",manufacturing=get("pManufacturing")==="true";
 const name=get("pName").trim(),industry=get("pIndustry"),town=get("pTown").trim();
 const readiness=document.getElementById("profileReadiness");
 if(readiness){const missing=[];if(!name)missing.push("business name");if(!entity)missing.push("legal entity");if(!industry)missing.push("industry");if(!town)missing.push("town / district");readiness.safeHTML=missing.length?`<span class="profile-ready-note warn">Complete ${missing.length} core ${missing.length===1?"detail":"details"}</span><span class="profile-ready-note">Detailed records open only when relevant</span>`:`<span class="profile-ready-note good">Core business details ready</span><span class="profile-ready-note">Detailed records open only when relevant</span>`}
 const tools=[];
 const add=(view,title,desc)=>tools.push({view,title,desc});
 if(["company","business_name","partnership"].includes(entity))add("corporate","Company records","CIPA particulars, annual-return timing and registry evidence.");
 if(vat||paye)add("taxprofile","Tax details","VAT/PAYE periods, supporting facts and BURS-related setup.");
 if(trade)add("licenceos","Licences","Licence records, annual fees and renewal dates.");
 if(manufacturing)add("manufacturing","Manufacturing requirements","Industrial-licence route, activity and renewal information.");
 if(data)add("privacy","Data protection","Customer-data controls and evidence.");
 if(tender)add("tenderhub","Tenders","Tender readiness and supporting documents.");
 const box=document.getElementById("profileRelevantTools");
 if(box)box.safeHTML=tools.length?tools.slice(0,6).map(x=>`<button class="profile-tool" type="button" data-bw-onclick="showView('${x.view}')"><span><b>${x.title}</b><small>${x.desc}</small></span><span class="profile-tool-arrow">→</span></button>`).join(""):`<div class="profile-empty">No additional setup is suggested from the answers above. You can update these answers whenever the business changes.</div>`;
}
function fillProfile(){
 let p=state.profile,q=id=>document.getElementById(id),set=(id,val)=>{let el=q(id);if(el)el.value=val??""};
 set("pName",p.name||"");set("pIncorporationDate",p.incorporationDate||"");set("pEntityType",p.entityType||"");set("pIndustry",p.industry||"Retail");set("pEmployees",p.employees??0);set("pTown",p.town||"");
 set("pVat",confirmedStatus(p,"vat"));set("pPaye",confirmedStatus(p,"paye"));set("pTrade",confirmedStatus(p,"trade"));["Data","Tender","Premises"].forEach(k=>set("p"+k,String(!!p[k.toLowerCase()])));
 set("pTradeAnniversary",p.tradeAnniversary||"");set("pCipaMonth",p.cipaMonth||"");set("pCipaUin",p.cipaUin||"");set("pCipaStatus",p.cipaStatus||"");set("pRegisteredOffice",p.registeredOffice||"");
 set("pCitizenOwned",String(p.citizenOwned!==false));set("pTurnover",p.turnover??"");set("pAnnualTaxableSupplies",p.annualTaxableSupplies??"");set("pHighestMonthlyEmployeePay",p.highestMonthlyEmployeePay??"");set("pManufacturing",String(!!p.manufacturing));
 syncProfileProgressiveFields();
}
function saveProfile(){
 if(currentWorkspaceRole()!=="owner"){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Only the account owner can edit Business details.";return false}
 const prior=state.profile||{},turnover=optionalNonNegativeNumber(pTurnover);
 const profile={...prior,name:pName.value.trim()||"Unnamed Business",incorporationDate:pIncorporationDate.value||"",entityType:pEntityType.value||"",industry:pIndustry.value,employees:+pEmployees.value||0,town:pTown.value.trim(),vat:pVat.value==="true",vatStatus:pVat.value||"unknown",paye:pPaye.value==="true",payeStatus:pPaye.value||"unknown",trade:pTrade.value==="true",tradeStatus:pTrade.value||"unknown",data:pData.value==="true",tender:pTender.value==="true",premises:pPremises.value==="true",citizenOwned:pCitizenOwned.value==="true",turnover,manufacturing:pManufacturing.value==="true",mfgActivity:prior.mfgActivity||"",mfgFactory:!!prior.mfgFactory,mfgAnniversary:prior.mfgAnniversary||""};
 updateActiveCompany(c=>{c.profile=profile});
 logEvent("PROFILE_UPDATED",{name:state.profile.name,industry:state.profile.industry,employees:state.profile.employees});
 save();renderAll();showView("profile",{silent:true,skipDataRefresh:true});const status=document.getElementById("profileSaveStatus");if(status)status.textContent="Changes applied. Workspace recalculated.";let sr=document.getElementById("srStatus");if(sr)sr.textContent="Business details saved and workspace recalculated.";
}
async function resetDemo(){if(!STANDALONE_PREVIEW)return false;const confirmed=await BW.dialog.confirm({title:"Reset demo workspace?",message:"Reset this workspace to the original demo data? Your preview changes will be discarded.",confirmLabel:"Reset demo",danger:true});if(!confirmed)return false;const next=structuredClone(DEFAULT_STATE);next.activeRole="owner";replaceWorkspaceStore(next);renderAll();logEvent("DEMO_RESET",{});return true}
function stageWorkspaceState(){return store}
async function persistWorkspaceState(){
 stageWorkspaceState();clearTimeout(saveTimer);saveTimer=null;let persisted={...store,audit:[]};let result=await apiFetch("/api/state",{method:"PUT",body:JSON.stringify({state:persisted,version:serverStateVersion})});serverStateVersion=result.version||serverStateVersion;return result
}
function save(){
 stageWorkspaceState();clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistWorkspaceState().catch(err=>{console.error("Save failed",err);showSyncError(err.message)}),180)
}
function logEvent(type,data={}){
 /* UI activity is not authoritative audit history. Server mutation endpoints write the sealed ledger. */
}
const WORKSPACE_ROLES=new Set(["owner","manager","reviewer","auditor"]);
const MANAGER_BLOCKED=new Set(["security","payments","entitlements","billing","integrations","profile","taxprofile","datadeletion","accountdata"]);
const REVIEW_ALLOWED=new Set(["workhub","obligations","calendar","statutorycalendar","changes","evidencehub","vault","evidenceintegrity","documents","expert","audit","auditintegrity","inspectionreadiness","assurancefreshness","controllineage","regulatoryintel","regulatoryobligations","compliancepassport","accounthub","accountsocial","accountsecurity"]);
const AUDIT_ALLOWED=new Set(["workhub","obligations","calendar","statutorycalendar","evidencehub","vault","evidenceintegrity","documents","audit","auditintegrity","inspectionreadiness","assurancefreshness","controllineage","compliancepassport","accounthub","accountsocial","accountsecurity"]);
function currentWorkspaceRole(){return currentUser?.role||""}
function isWorkspaceRole(role=currentWorkspaceRole()){return WORKSPACE_ROLES.has(String(role||""))}
function allowedViewsForRole(role=currentWorkspaceRole()){
 const r=String(role||"");
 const allCustomer=[...document.querySelectorAll('.nav button[data-view]:not(.platformRegulatoryOnly)')].map(b=>b.dataset.view);
 const platformAdminViews=platformRegulatoryAccess?[...document.querySelectorAll('.nav button.platformRegulatoryOnly[data-view]')].map(b=>b.dataset.view):[];
 if(r==="owner")return new Set([...allCustomer,...platformAdminViews]);
 if(r==="manager")return new Set(allCustomer.filter(x=>!MANAGER_BLOCKED.has(x)));
 if(r==="reviewer")return new Set(REVIEW_ALLOWED);
 if(r==="auditor")return new Set(AUDIT_ALLOWED);
 return new Set();
}
function roleCanView(view,role=currentWorkspaceRole()){return allowedViewsForRole(role).has(String(view||""))}
function roleLandingView(role=currentWorkspaceRole()){
 if(role==="owner"||role==="manager")return "dashboard";
 if(role==="reviewer"||role==="auditor")return "workhub";
 return null;
}
function syncMobileRoleNav(role=currentWorkspaceRole()){
 const bar=document.getElementById("mobileBar");if(!bar)return;
 const workspace=isWorkspaceRole(role);bar.style.display=workspace?"":"none";
 bar.querySelectorAll("button[data-mobile-view]").forEach(btn=>{
   const target=btn.dataset.mobileView;
   if(!workspace){btn.style.display="none";return}
   if(target==="more"){btn.style.display="";return}
   btn.style.display=roleCanView(target,role)?"":"none";
 });
}
function showRestrictedRolePortal(role=currentWorkspaceRole()){
 marketingGate.classList.add("hidden");authGate.classList.add("hidden");concealWorkspaceShell();syncMobileRoleNav(role);
 const portal=document.getElementById("roleAccessPortal");if(portal)portal.style.display="block";
 const reporter=document.getElementById("reporterPortal");if(reporter)reporter.style.display="none";
 console.warn("Workspace access denied for role",role);
}
function applyRoleUi(){
 let role=currentWorkspaceRole();if(store&&store.activeRole!==role)updateWorkspaceMeta({activeRole:role});let label=document.getElementById("roleLabel");if(label)label.textContent=role?role.charAt(0).toUpperCase()+role.slice(1):"—";
 const allowed=allowedViewsForRole(role);
 document.querySelectorAll(".nav button[data-view]").forEach(b=>{if(b.classList.contains("platformRegulatoryOnly"))return;b.style.display=allowed.has(b.dataset.view)?"":"none"});
 const more=document.querySelector(".nav-more-tools");if(more)more.style.display=allowed.size?"":"none";syncMobileRoleNav(role);
 let add=document.getElementById("addCompanyBtn");if(add)add.style.display=role==="owner"?"":"none";
 document.querySelectorAll(".primaryTop,.workspace-quick-actions,.workspace-pulse,#billingBanner").forEach(el=>{if(el)el.hidden=!(role==="owner"||role==="manager")});document.querySelectorAll(".executive-only").forEach(el=>{if(el)el.hidden=!(role==="owner"||role==="manager")});
 window.refreshSimplifiedHubAccess?.();syncEvidenceRoleUi?.();
 const active=document.querySelector(".view.active")?.id;if(active&&!allowed.has(active)){const landing=roleLandingView(role);if(landing&&allowed.has(landing))showView(landing,{roleRedirect:true})}
}

function renderCompanies(){
 let sel=document.getElementById("companySelect");if(!sel)return;sel.replaceChildren();
 (store.companies||[]).forEach(c=>{let o=document.createElement("option");o.value=safeId(c.id);o.textContent=String(c.profile?.name||"Unnamed Business");o.selected=c.id===state.id;sel.appendChild(o)});
}
function switchCompany(id){
 const next=(store.companies||[]).find(c=>c.id===id);if(!next)return;
 updateWorkspaceMeta({activeCompanyId:id});save();logEvent("COMPANY_SWITCHED",{companyId:id});renderAll()
}
async function addCompany(){
 if(currentWorkspaceRole()!=="owner"){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Only the account owner can add a company.";return false}
 const name=await BW.dialog.prompt({title:"Add company",message:"Enter the company name for the new workspace company.",required:true,maxLength:160,confirmLabel:"Add company"});if(name===null)return false;const c=blankCompany(name.trim());
 updateWorkspaceStore(root=>({...root,activeCompanyId:c.id,companies:[...(root.companies||[]),c]}));logEvent("COMPANY_CREATED",{companyId:c.id,name});save();renderAll();showView("profile",{skipDataRefresh:true});return true
}
function renderAudit(){
 let el=document.getElementById("auditList");if(!el)return;
 let rows=store.audit.filter(x=>!x.companyId||x.companyId===state.id).slice(0,100);
 el.safeHTML=rows.length?rows.map(x=>`<div class="item audit"><b>${escapeHtml(x.type)}</b> · ${new Date(x.at).toLocaleString()}<div class="muted">${escapeHtml(JSON.stringify(x.data))}</div></div>`).join(""):`<div class="muted">No audit events yet.</div>`
}

function slug(s){return String(s||"company").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function downloadJson(payload,name){
 let blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)
}

function buildComplianceReportHtml(){
 let s=scoreData(),controls=applicable(),today=new Date().toLocaleString();
 let rows=controls.map(r=>`<tr><td>${escapeHtml(r.area)}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.status())}</td><td>${escapeHtml(r.risk)}</td><td>${escapeHtml(r.authority)}</td></tr>`).join("");
 let ev=(state.evidence||[]).map(e=>`<tr><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.cat)}</td><td>${e.verified?"Verified":"Unverified"}</td><td>${escapeHtml(e.date||"—")}</td></tr>`).join("");
 return `<!doctype html><html><head><meta charset="utf-8"><title>Compliance Report</title><style>body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:13px}h1{font-size:24px}h2{margin-top:26px;font-size:17px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.scores{display:flex;gap:30px;margin:18px 0}.scorebox{border:1px solid #ccc;padding:12px;min-width:140px}.noprint{margin-bottom:20px}@media print{.noprint{display:none}}
/* v14 UI/UX refresh — calmer Linear/Vanta-inspired operational shell */
:root{--bg:#f7f8f9;--card:#ffffff;--ink:#111514;--muted:#66706c;--line:#e7eae9;--accent:#176b4f;--soft:#eef6f2;--sidebar:#121715;--sidebar2:#191f1c;--shadow:0 1px 2px rgba(16,24,20,.04),0 8px 24px rgba(16,24,20,.035)}
body{font-size:14px;letter-spacing:-.005em;background:var(--bg)}
.shell{grid-template-columns:232px minmax(0,1fr)}
aside{background:var(--sidebar);padding:18px 12px 14px;border-right:1px solid #222824;display:flex;flex-direction:column;overflow:auto}
.brand{margin:2px 8px 16px;font-size:17px;letter-spacing:-.02em;display:flex;align-items:center;gap:9px}.brand:before{content:'BW';display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#f2f7f4;color:#153f31;font-size:10px;font-weight:900;letter-spacing:.04em}.brand small{font-size:9px;margin-top:2px;color:#7f8d86;letter-spacing:.11em}
.navgroup{margin:13px 8px 5px;color:#66736c;font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.nav{min-height:0}.nav button{position:relative;align-items:center;gap:8px;color:#9ba69f;padding:8px 9px;border-radius:7px;margin:1px 0;font-size:12.5px;font-weight:550;transition:background .15s ease,color .15s ease,transform .15s ease}.nav button:before{content:'';width:6px;height:6px;border-radius:2px;background:#4d5852;flex:0 0 6px}.nav button:hover{background:#1b211e;color:#e7ede9}.nav button.active{background:#232b27;color:#fff}.nav button.active:before{background:#76d4ae;box-shadow:0 0 0 3px rgba(118,212,174,.08)}
.sidebarfoot{margin-top:auto;padding:14px 8px 4px;border-top:1px solid #242b27;color:#849189;font-size:10px}.sidebarfoot b{color:#b8c2bc;display:block;margin-bottom:3px}
main{padding:24px 30px 44px;max-width:1480px}
.top{position:sticky;top:0;z-index:8;margin:-24px -30px 22px;padding:14px 30px;background:rgba(247,248,249,.93);backdrop-filter:blur(12px);border-bottom:1px solid rgba(225,229,227,.9);align-items:center}.top h1{font-size:21px;font-weight:720;letter-spacing:-.025em}.top>.actions{align-items:center;justify-content:flex-end;gap:7px}.top .companyswitch{background:#fff;border-color:#e1e5e3;border-radius:8px;padding:5px 7px;box-shadow:0 1px 2px rgba(0,0,0,.02)}.top .companyswitch select{min-width:150px;font-size:12px;padding:3px}.rolechip{border:0;background:#f1f4f2;padding:5px 8px;color:#47504c}
.global-search{display:flex;align-items:center;gap:7px;min-width:210px;background:#fff;border:1px solid #e1e5e3;border-radius:8px;padding:6px 9px;color:var(--muted)}.global-search input{border:0;padding:0;background:transparent;outline:0;font-size:12px}.searchhint{font-size:9px;border:1px solid var(--line);padding:2px 4px;border-radius:4px;background:#fafbfb;color:#8b9490;white-space:nowrap}
.btn{border-radius:8px;padding:8px 11px;font-size:12px;font-weight:680;box-shadow:none}.btn.alt{border-color:#dfe4e1}.btn.soft{background:#edf6f1}.btn:hover{transform:translateY(-1px)}
.card{border-color:#e5e8e7;border-radius:12px;padding:16px;box-shadow:var(--shadow)}
h2{font-size:16px;letter-spacing:-.015em} h3{font-size:13px}.kpi{font-size:10px;letter-spacing:.08em;font-weight:760}.score{font-size:31px;letter-spacing:-.04em}.readiness{font-size:29px}
.hero{background:#111714;border:1px solid #202923;border-radius:14px;padding:20px 22px;box-shadow:0 14px 30px rgba(12,19,15,.11);position:relative;overflow:hidden}.hero:after{content:'';position:absolute;right:-45px;top:-70px;width:210px;height:210px;border-radius:50%;border:1px solid rgba(146,213,184,.12);box-shadow:0 0 0 32px rgba(146,213,184,.025),0 0 0 64px rgba(146,213,184,.018)}.hero h2{font-size:23px;position:relative;z-index:1}.hero .muted{max-width:780px;line-height:1.55;position:relative;z-index:1}
.dashboard-intro{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.health-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border-radius:999px;background:rgba(118,212,174,.1);color:#a7e3c8;font-size:10px;font-weight:750;position:relative;z-index:1}.health-chip:before{content:'';width:6px;height:6px;background:#76d4ae;border-radius:50%}
.grid{gap:12px}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.item{padding:11px 0}.item b{font-weight:650}.small{font-size:11.5px;line-height:1.5}.muted{color:#6d7672}
table{font-variant-numeric:tabular-nums}th,td{padding:10px 8px;font-size:12px}th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#7d8782}.badge{font-size:9.5px;padding:4px 7px}.progress,.gauge{height:6px}
.notice,.conflict,.verifiedsrc,.rulewarn,.rulebad,.callout{border-radius:9px;font-size:12px}.conflict{background:#fff8f6;border-color:#f0d8d2;color:#66312b}.source{font-size:10px}.rulemeta span,.pill{font-size:9px}
.priority-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.section-eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#87918c;font-weight:800}.attention-count{font-size:10px;padding:4px 7px;background:#fff3dc;color:#8a5900;border-radius:999px;font-weight:800}
.eventcard{border-radius:10px;text-align:left;min-height:78px;padding:13px;transition:.15s ease}.eventcard:hover{border-color:#b9c3be;box-shadow:0 5px 16px rgba(16,24,20,.05);transform:translateY(-1px)}
input,select,textarea{border-color:#dfe4e1;border-radius:8px;padding:9px 10px;font-size:12.5px;transition:border-color .15s,box-shadow .15s}input:focus,select:focus,textarea:focus{outline:0;border-color:#8bb5a4;box-shadow:0 0 0 3px rgba(23,107,79,.08)}label{font-size:10.5px;color:#59635e;margin-bottom:4px}.modal{backdrop-filter:blur(5px)}.modalbox{border-radius:14px;padding:20px;box-shadow:0 30px 70px rgba(0,0,0,.18)}
.authgate{background:#f4f6f5}.authcard{border-radius:15px;box-shadow:0 24px 70px rgba(15,24,19,.1);max-width:420px}.authbrand{font-size:22px;letter-spacing:-.03em}.prodchip{background:#eaf5ef;color:#22694f}
@media(max-width:1100px){.top{position:relative;margin:-18px -18px 18px;padding:12px 18px}.global-search{display:none}}
@media(max-width:1000px){.shell{grid-template-columns:1fr}aside{height:auto;position:relative;padding:11px 10px}.navgroup,.sidebarfoot{display:none}.nav{display:flex;overflow:auto;gap:3px}.nav button{white-space:nowrap;width:auto;padding:8px 10px}.nav button:before{display:none}.brand{margin:0 4px 9px}.top{margin:-18px -18px 18px}.g4,.g3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){main{padding:14px 12px 32px}.top{margin:-14px -12px 14px;padding:10px 12px}.top>.actions{width:100%;justify-content:flex-start}.top .companyswitch{max-width:100%}.top .companyswitch select{min-width:115px}.prodchip{display:none}.hero{padding:18px}.dashboard-intro{display:block}.g4,.g3,.g2,.formgrid{grid-template-columns:1fr}.card{padding:14px}.score{font-size:29px}}


/* v18 motion system */
:root{
  --ease-out:cubic-bezier(.22,1,.36,1);
  --ease-inout:cubic-bezier(.65,0,.35,1);
  --motion-fast:160ms;
  --motion-med:260ms;
  --motion-slow:420ms;
}
@keyframes fadeUp{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes fadeIn{
  from{opacity:0}
  to{opacity:1}
}
@keyframes popIn{
  from{opacity:0;transform:scale(.97)}
  to{opacity:1;transform:scale(1)}
}
@keyframes softPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(15,95,70,0)}
  50%{box-shadow:0 0 0 5px rgba(15,95,70,.08)}
}

body{animation:fadeIn var(--motion-med) var(--ease-out)}
.view.active{
  animation:fadeUp var(--motion-med) var(--ease-out) both;
}
.card{
  transition:transform var(--motion-fast) var(--ease-out),
             box-shadow var(--motion-fast) var(--ease-out),
             border-color var(--motion-fast) var(--ease-out);
}
.card:hover{
  transform:translateY(-2px);
  box-shadow:0 10px 26px rgba(12,18,16,.06);
}
.nav button{
  transition:background var(--motion-fast) ease,
             color var(--motion-fast) ease,
             transform var(--motion-fast) var(--ease-out);
}
.nav button:hover{transform:translateX(2px)}
.nav button.active{animation:softPulse .5s ease-out}

.btn{
  transition:transform var(--motion-fast) var(--ease-out),
             box-shadow var(--motion-fast) var(--ease-out),
             background var(--motion-fast) ease;
}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0) scale(.985)}

.badge,.publishstate,.pill,.tag{
  transition:transform var(--motion-fast) var(--ease-out),
             background var(--motion-fast) ease;
}
.badge:hover,.publishstate:hover,.pill:hover,.tag:hover{transform:translateY(-1px)}

.progress span,.gauge span{
  transition:width .65s var(--ease-out);
}
.score,.readiness{
  transition:color var(--motion-fast) ease,
             transform var(--motion-fast) var(--ease-out);
}
.score:hover,.readiness:hover{transform:translateY(-1px)}

.modal{
  animation:fadeIn var(--motion-fast) ease both;
}
.modal.open .modalbox{
  animation:popIn var(--motion-med) var(--ease-out) both;
}
.modalbox{
  transform-origin:center;
}
.item{
  transition:background var(--motion-fast) ease,
             transform var(--motion-fast) var(--ease-out);
}
.item:hover{
  transform:translateX(2px);
}
.eventcard{
  transition:transform var(--motion-fast) var(--ease-out),
             box-shadow var(--motion-fast) var(--ease-out),
             border-color var(--motion-fast) ease;
}
.eventcard:hover{
  transform:translateY(-3px);
  box-shadow:0 10px 24px rgba(12,18,16,.06);
}
input,select,textarea{
  transition:border-color var(--motion-fast) ease,
             box-shadow var(--motion-fast) ease,
             background var(--motion-fast) ease;
}
input:focus,select:focus,textarea:focus{
  box-shadow:0 0 0 3px rgba(15,95,70,.08);
}
.hero{
  animation:fadeUp var(--motion-slow) var(--ease-out) both;
}
.g4>.card,.g3>.card,.g2>.card{
  animation:fadeUp var(--motion-med) var(--ease-out) both;
}
.g4>.card:nth-child(2),.g3>.card:nth-child(2),.g2>.card:nth-child(2){animation-delay:40ms}
.g4>.card:nth-child(3),.g3>.card:nth-child(3){animation-delay:80ms}
.g4>.card:nth-child(4){animation-delay:120ms}

#commandPalette,
.command-palette,
[role="dialog"]{
  transition:opacity var(--motion-fast) ease,transform var(--motion-med) var(--ease-out);
}

@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.001ms!important;
    animation-iteration-count:1!important;
    transition-duration:.001ms!important;
    scroll-behavior:auto!important;
  }
}


/* v19 social authentication */
.social-auth-stack{display:grid;gap:10px;margin:14px 0 12px}
.social-auth-btn{
  width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
  min-height:46px;border:1px solid var(--line);border-radius:12px;background:#fff;
  color:#161918;font-weight:750;letter-spacing:-.01em;cursor:pointer;
  transition:transform var(--motion-fast,var(--motion-fast,160ms)) var(--ease-out,cubic-bezier(.22,1,.36,1)),
             box-shadow 160ms ease,border-color 160ms ease,background 160ms ease;
}
.social-auth-btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(12,18,16,.06);border-color:#cfd5d2}
.social-auth-btn:active{transform:scale(.99)}
.social-auth-btn.facebook{background:#1877f2;color:#fff;border-color:#1877f2}
.social-auth-btn.facebook:hover{background:#166fe5}
.social-mark{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;font-weight:900;font-size:14px}
.social-auth-btn.google .social-mark{border:1px solid #d8ddda;background:#fff;color:#4285f4}
.social-auth-btn.facebook .social-mark{background:rgba(255,255,255,.16);color:#fff;font-family:Arial,sans-serif;font-size:18px}
.auth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:11px;margin:10px 0 14px}
.auth-divider:before,.auth-divider:after{content:"";height:1px;background:var(--line);flex:1}
.auth-divider span{white-space:nowrap}

</style>
<style id="v17-behance-polish">
/* v17 — Behance-inspired premium compliance SaaS system */
:root{
 --bg:#f4f6f4;--card:#ffffff;--ink:#15201b;--muted:#718078;--line:#e2e7e3;
 --good:#1f7a55;--warn:#9a650d;--bad:#b23a31;--accent:#256a50;--soft:#edf5f1;
 --panel:#101713;--panel2:#17211c;--radius:16px;--radius-sm:11px;
}
body{background:var(--bg);letter-spacing:-.006em}
.shell{grid-template-columns:238px 1fr}
aside{background:#101713;padding:20px 14px;border-right:1px solid #1c2721}
.brand{font-size:16px!important;margin:0 8px 22px!important;gap:10px!important}
.brand:before{width:34px!important;height:34px!important;border-radius:11px!important;background:#e8f4ed!important;color:#1d5f45!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.brand small{color:#7f9087!important;font-size:8px!important;letter-spacing:.13em!important}
.navgroup{font-size:9px!important;color:#68786f!important;padding:16px 11px 6px!important;letter-spacing:.14em!important}
.nav button{border-radius:9px!important;padding:8px 10px!important;font-size:12px!important;color:#96a39c!important;transition:background .15s ease,color .15s ease,transform .15s ease}
.nav button:hover{background:#17221c!important;color:#e9f0ec!important;transform:translateX(1px)}
.nav button.active{background:#202d26!important;color:#f7fbf9!important;box-shadow:inset 2px 0 0 #7fba9d}
.sidebarfoot{border-top:1px solid #202c26!important;color:#66776e!important;line-height:1.55}
.sidebarfoot b{color:#aab6b0!important}
main{max-width:none!important;padding:26px 30px 54px!important}
.top{margin:-26px -30px 24px!important;padding:13px 30px!important;background:rgba(249,250,249,.96)!important;border-bottom:1px solid #e1e6e2!important;backdrop-filter:blur(14px);position:sticky!important;top:0!important;z-index:20!important;box-shadow:none!important}
.top h1{font-size:19px!important;letter-spacing:-.035em!important}
.top .muted.small{font-size:10px!important;color:#88938d!important}
.global-search{height:34px!important;border-radius:9px!important;background:#fff!important;border-color:#dce2de!important;min-width:205px!important}
.companyswitch{height:34px!important;border-radius:9px!important;border-color:#dde3df!important;background:white!important;padding:4px 7px!important}
.companyswitch select{font-size:11px!important}
.btn{border-radius:9px!important;padding:9px 12px!important;font-size:11px!important;box-shadow:none!important;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
.btn:hover{transform:translateY(-1px);box-shadow:0 5px 14px rgba(20,38,29,.08)}
.btn.primaryTop,.btn:not(.alt):not(.soft):not(.danger){background:#183d2f!important}
.btn.alt{border-color:#dce2de!important;background:#fff!important}
.btn.soft{background:#eef5f1!important;color:#245f49!important}
.card{border:1px solid #e1e6e2!important;border-radius:var(--radius)!important;box-shadow:0 1px 2px rgba(18,31,24,.018)!important;padding:18px!important}
.card:hover{border-color:#d9dfdb!important}
h2{font-size:17px!important;letter-spacing:-.025em!important} h3{letter-spacing:-.018em!important}
.kpi,.section-eyebrow{font-size:9px!important;letter-spacing:.12em!important;text-transform:uppercase;color:#829088!important;font-weight:800!important}
.score{font-size:34px!important;letter-spacing:-.055em!important}
.progress{height:5px!important;background:#edf0ee!important}
.progress span,.gauge span{background:#397d60!important}
.badge,.tag,.pill,.publishstate{font-size:9px!important;letter-spacing:.02em}
.item{padding:12px 0!important}
table th{font-size:9px!important;text-transform:uppercase;letter-spacing:.08em;color:#87938d!important;background:#fafbfa}
table td{font-size:12px!important}
th,td{padding:11px 9px!important}
input,select,textarea{border-color:#dce2de!important;border-radius:9px!important;background:#fff!important;font-size:12px!important;min-height:38px}
input:focus,select:focus,textarea:focus{outline:none!important;border-color:#86aa98!important;box-shadow:0 0 0 3px rgba(64,119,91,.09)!important}
label{font-size:10px!important;letter-spacing:.015em!important}
.notice,.callout,.conflict,.verifiedsrc,.rulewarn,.rulebad{border-radius:11px!important;font-size:12px!important}

/* Dashboard composition */
.hero{background:#14201a!important;border:1px solid #1e2d25!important;border-radius:18px!important;padding:26px 28px!important;box-shadow:0 16px 42px rgba(13,25,19,.08)!important;min-height:168px;display:flex;align-items:flex-end}
.hero:after{display:none!important}
.dashboard-intro{width:100%!important;align-items:flex-end!important}
.dashboard-intro h2{font-size:29px!important;letter-spacing:-.045em!important;margin:5px 0 7px!important;color:#f7faf8}
.dashboard-intro .muted{font-size:12px!important;color:#98aaa0!important;max-width:650px!important}
.health-chip{background:#1e2e26!important;color:#9fc9b4!important;border:1px solid #2b4236!important;border-radius:999px!important;padding:7px 10px!important;font-size:9px!important;text-transform:uppercase;letter-spacing:.09em;font-weight:800}
.actionstrip{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(280px,.7fr)!important;gap:12px!important;margin:12px 0!important}
.nextaction,.setupmeter{border-radius:14px!important;border:1px solid #dde4df!important;background:#fff!important;padding:15px 17px!important}
.nextaction{box-shadow:none!important}
.nextaction h3{font-size:15px!important;margin:3px 0 4px!important}
.nextaction .btn{min-width:92px}
.setupmeter{background:#f8faf9!important}
.g4{gap:12px!important}
#dashboard>.g4 .card{min-height:128px;position:relative;overflow:hidden}
#dashboard>.g4 .card:after{content:'';position:absolute;left:18px;right:18px;bottom:0;height:2px;background:#edf1ee}
#dashboard>.g4 .card:first-child:after{background:#4e8e70}
#dashboard>.g4 .card:nth-child(2):after{background:#ae8b42}
#dashboard>.g4 .card:nth-child(3):after{background:#789187}
#dashboard>.g4 .card:nth-child(4):after{background:#6b8b7b}
.priority-header{margin-bottom:3px!important}
.attention-count{background:#f7ece9!important;color:#9b4439!important;border:1px solid #efd6d0!important;border-radius:999px!important;font-size:9px!important;padding:5px 8px!important}
.riskbar{grid-template-columns:1fr 48px!important}

/* Module surfaces */
.view>.grid.g3:first-child .card,.view>.grid.g4:first-child .card{background:#fbfcfb}
.view>.card:first-child>h2,.view>.card:first-child>.between h2{font-size:19px!important}
.sourcebox{border-radius:13px!important;background:#fbfcfb!important}
.eventcard{border-radius:13px!important;background:#fff!important;transition:border .15s ease,transform .15s ease,box-shadow .15s ease}
.eventcard:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(25,45,35,.06);border-color:#b9cbc1!important}
.archbox{border-style:solid!important;border-color:#e0e5e2!important;background:#fbfcfb!important;border-radius:13px!important}
.timeline{border-left-color:#dce5e0!important}

/* Marketing / conversion */
.marketinggate{background:#f6f8f6!important}
.marketingnav{height:72px!important}
.marketinglogo{font-size:17px!important}
.marketinghero{padding-top:92px!important;padding-bottom:76px!important;gap:72px!important}
.marketinghero h1{font-size:clamp(48px,6vw,78px)!important;max-width:760px!important;letter-spacing:-.065em!important}
.marketinghero p{font-size:17px!important;color:#68756e!important}
.heroeyebrow{background:#e8f2ed!important;color:#246148!important;border:1px solid #d8e7df!important}
.productmock{background:#121c17!important;border-radius:24px!important;padding:12px!important;box-shadow:0 30px 80px rgba(21,43,32,.14)!important}
.mockinner{border-radius:15px!important;background:#f7f9f8!important;padding:20px!important}
.mockmetric,.mockaction{border-radius:12px!important;border-color:#e0e5e2!important}
.marketingsection{padding-top:78px!important;padding-bottom:78px!important}
.sectiontitle h2{font-size:40px!important;letter-spacing:-.045em!important}
.featuregrid{gap:14px!important}
.featuretile{border-radius:16px!important;padding:23px!important;min-height:190px;box-shadow:0 1px 2px rgba(20,32,26,.02)}
.featureicon{border-radius:11px!important;width:38px!important;height:38px!important}
.pricingwrap{background:#edf2ef!important}
.pricecard{border-radius:18px!important;padding:25px!important}
.pricecard.featured{border-color:#6d9f87!important;box-shadow:0 18px 50px rgba(27,74,53,.07)!important}

/* Auth */
.authgate{background:#f4f6f4!important}
.authcard{border-radius:18px!important;padding:28px!important;border-color:#dde4df!important;box-shadow:0 24px 70px rgba(18,33,25,.09)!important}
.authbrand{font-size:24px!important}

/* Responsive */
@media(max-width:1000px){main{padding:18px!important}.top{margin:-18px -18px 18px!important;padding:11px 18px!important}.actionstrip{grid-template-columns:1fr!important}.shell{grid-template-columns:1fr!important}}
@media(max-width:650px){main{padding:12px 12px 84px!important}.top{margin:-12px -12px 14px!important;padding:10px 12px!important}.hero{min-height:145px;padding:20px!important}.dashboard-intro h2{font-size:23px!important}.health-chip{display:none}.actionstrip{gap:9px!important}.nextaction,.setupmeter{padding:13px!important}#dashboard>.g4 .card{min-height:auto}.marketinghero{padding-top:54px!important;padding-bottom:50px!important}.marketinghero h1{font-size:46px!important}.marketingsection{padding-top:54px!important;padding-bottom:54px!important}}

/* v18 motion system */
:root{
  --ease-out:cubic-bezier(.22,1,.36,1);
  --ease-inout:cubic-bezier(.65,0,.35,1);
  --motion-fast:160ms;
  --motion-med:260ms;
  --motion-slow:420ms;
}
@keyframes fadeUp{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes fadeIn{
  from{opacity:0}
  to{opacity:1}
}
@keyframes popIn{
  from{opacity:0;transform:scale(.97)}
  to{opacity:1;transform:scale(1)}
}
@keyframes softPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(15,95,70,0)}
  50%{box-shadow:0 0 0 5px rgba(15,95,70,.08)}
}

body{animation:fadeIn var(--motion-med) var(--ease-out)}
.view.active{
  animation:fadeUp var(--motion-med) var(--ease-out) both;
}
.card{
  transition:transform var(--motion-fast) var(--ease-out),
             box-shadow var(--motion-fast) var(--ease-out),
             border-color var(--motion-fast) var(--ease-out);
}
.card:hover{
  transform:translateY(-2px);
  box-shadow:0 10px 26px rgba(12,18,16,.06);
}
.nav button{
  transition:background var(--motion-fast) ease,
             color var(--motion-fast) ease,
             transform var(--motion-fast) var(--ease-out);
}
.nav button:hover{transform:translateX(2px)}
.nav button.active{animation:softPulse .5s ease-out}

.btn{
  transition:transform var(--motion-fast) var(--ease-out),
             box-shadow var(--motion-fast) var(--ease-out),
             background var(--motion-fast) ease;
}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0) scale(.985)}

.badge,.publishstate,.pill,.tag{
  transition:transform var(--motion-fast) var(--ease-out),
             background var(--motion-fast) ease;
}
.badge:hover,.publishstate:hover,.pill:hover,.tag:hover{transform:translateY(-1px)}

.progress span,.gauge span{
  transition:width .65s var(--ease-out);
}
.score,.readiness{
  transition:color var(--motion-fast) ease,
             transform var(--motion-fast) var(--ease-out);
}
.score:hover,.readiness:hover{transform:translateY(-1px)}

.modal{
  animation:fadeIn var(--motion-fast) ease both;
}
.modal.open .modalbox{
  animation:popIn var(--motion-med) var(--ease-out) both;
}
.modalbox{
  transform-origin:center;
}
.item{
  transition:background var(--motion-fast) ease,
             transform var(--motion-fast) var(--ease-out);
}
.item:hover{
  transform:translateX(2px);
}
.eventcard{
  transition:transform var(--motion-fast) var(--ease-out),
             box-shadow var(--motion-fast) var(--ease-out),
             border-color var(--motion-fast) ease;
}
.eventcard:hover{
  transform:translateY(-3px);
  box-shadow:0 10px 24px rgba(12,18,16,.06);
}
input,select,textarea{
  transition:border-color var(--motion-fast) ease,
             box-shadow var(--motion-fast) ease,
             background var(--motion-fast) ease;
}
input:focus,select:focus,textarea:focus{
  box-shadow:0 0 0 3px rgba(15,95,70,.08);
}
.hero{
  animation:fadeUp var(--motion-slow) var(--ease-out) both;
}
.g4>.card,.g3>.card,.g2>.card{
  animation:fadeUp var(--motion-med) var(--ease-out) both;
}
.g4>.card:nth-child(2),.g3>.card:nth-child(2),.g2>.card:nth-child(2){animation-delay:40ms}
.g4>.card:nth-child(3),.g3>.card:nth-child(3){animation-delay:80ms}
.g4>.card:nth-child(4){animation-delay:120ms}

#commandPalette,
.command-palette,
[role="dialog"]{
  transition:opacity var(--motion-fast) ease,transform var(--motion-med) var(--ease-out);
}

@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.001ms!important;
    animation-iteration-count:1!important;
    transition-duration:.001ms!important;
    scroll-behavior:auto!important;
  }
}


/* v19 social authentication */
.social-auth-stack{display:grid;gap:10px;margin:14px 0 12px}
.social-auth-btn{
  width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
  min-height:46px;border:1px solid var(--line);border-radius:12px;background:#fff;
  color:#161918;font-weight:750;letter-spacing:-.01em;cursor:pointer;
  transition:transform var(--motion-fast,var(--motion-fast,160ms)) var(--ease-out,cubic-bezier(.22,1,.36,1)),
             box-shadow 160ms ease,border-color 160ms ease,background 160ms ease;
}
.social-auth-btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(12,18,16,.06);border-color:#cfd5d2}
.social-auth-btn:active{transform:scale(.99)}
.social-auth-btn.facebook{background:#1877f2;color:#fff;border-color:#1877f2}
.social-auth-btn.facebook:hover{background:#166fe5}
.social-mark{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;font-weight:900;font-size:14px}
.social-auth-btn.google .social-mark{border:1px solid #d8ddda;background:#fff;color:#4285f4}
.social-auth-btn.facebook .social-mark{background:rgba(255,255,255,.16);color:#fff;font-family:Arial,sans-serif;font-size:18px}
.auth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:11px;margin:10px 0 14px}
.auth-divider:before,.auth-divider:after{content:"";height:1px;background:var(--line);flex:1}
.auth-divider span{white-space:nowrap}


/* v35.1 standalone repair */
.previewmode{display:none;position:fixed;right:14px;bottom:14px;z-index:120;background:#14201a;color:#dff1e8;border:1px solid #284336;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:800}.standalone-preview .previewmode{display:block}@media(max-width:650px){.previewmode{bottom:78px}}
</style>




<style id="v78-12127-proof-to-action">
/* v78 1.21.27 — proof-to-action: close the first evidence gap from the action itself. */
.proof-next-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;margin:0 0 14px;padding:18px;border:1px solid #d7e4dd;border-radius:18px;background:#f5faf7}.proof-next-card h3{font-size:19px;margin:3px 0 5px}.proof-next-card p{margin:0;max-width:820px}.proof-next-card .actions{justify-content:flex-end}.proof-next-card[data-state="clear"]{background:#f8faf9;border-color:#e1e7e3}.proof-next-card[data-state="error"]{background:#fff7f4;border-color:#ecd5cd}
.proof-action-progress{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 2px}.proof-action-progress span{font-size:12px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 8px}.proof-action-progress b{margin-right:3px}
.proof-action-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:12px;margin-top:14px}.proof-action-panel{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fbfcfb;min-width:0}.proof-action-panel h3{font-size:15px;margin:2px 0 10px}.proof-requirement-list,.proof-candidate-list{display:grid;gap:8px}.proof-requirement{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e2e7e4;border-radius:12px;background:#fff;padding:11px;text-align:left}.proof-requirement.selected{border-color:#8ab49f;box-shadow:0 0 0 2px rgba(30,112,78,.08)}.proof-requirement b{display:block;font-size:13.5px}.proof-requirement small{display:block;color:var(--muted);margin-top:3px;line-height:1.35}.proof-requirement .btn{min-height:36px;padding:7px 10px}.proof-candidate{border:1px solid #e2e7e4;border-radius:12px;background:#fff;padding:11px}.proof-candidate .between{gap:10px}.proof-upload-box{margin-top:10px;border-top:1px solid #e6ebe8;padding-top:12px}.proof-upload-box input{margin-top:6px}.proof-flow-note{font-size:12px;line-height:1.45;color:var(--muted);margin-top:8px}.proof-action-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.proof-action-footer .actions{justify-content:flex-end}.proof-action-status{min-height:20px;font-size:12.5px;color:var(--muted)}.proof-action-status.good{color:var(--good)}.proof-action-status.bad{color:var(--bad)}
.home-action-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.home-proof-flag{font-size:11px;font-weight:750;color:#8a5a00;background:#fff8e8;border:1px solid #f0dfb8;border-radius:999px;padding:3px 6px}.first-value-item .proof-direct{margin-left:6px}
@media(max-width:800px){.proof-next-card{grid-template-columns:1fr}.proof-next-card .actions{justify-content:flex-start}.proof-action-grid{grid-template-columns:1fr}.proof-action-footer{align-items:flex-start;flex-direction:column}.proof-action-footer .actions{width:100%}.proof-action-footer .btn{flex:1}}
@media(max-width:650px){.proof-next-card{padding:14px}.proof-requirement{grid-template-columns:1fr}.proof-requirement .btn{width:100%}.home-action-actions{justify-content:stretch}.home-action-actions .btn{width:100%}}
</style>
</head><body><div class="noprint"><button data-bw-onclick="window.print()">Print / Save as PDF</button></div><h1>${escapeHtml(state.profile.name)} — Compliance Report</h1><div>Generated ${today}</div><div>Ruleset BW-2026.08.30-launch</div><div class="scores"><div class="scorebox"><b>Compliance</b><div>${s.comp}/100</div></div><div class="scorebox"><b>Protection</b><div>${s.prot}/100</div></div></div><h2>Applicable Controls</h2><table><tr><th>Area</th><th>Control</th><th>Status</th><th>Risk</th><th>Authority</th></tr>${rows}</table><h2>Evidence Register</h2><table><tr><th>Evidence</th><th>Category</th><th>Status</th><th>Review date</th></tr>${ev||'<tr><td colspan="4">No evidence metadata recorded</td></tr>'}</table><h2>Important</h2><p>This report is a compliance-management output, not a legal opinion. Underlying evidence, business facts, statutory text and effective dates should be validated before relying on it for a regulatory, tax, employment or litigation decision.</p>
<div class="modal" id="passwordResetModal" role="dialog" aria-modal="true" aria-label="Password reset" aria-hidden="true"><div class="modalbox">
  <div class="between row"><h2>Set a new password</h2><button class="btn alt" data-bw-onclick="closeModal('passwordResetModal')">Close</button></div>
  <div class="stack">
    <div><label>New password</label><input id="newResetPassword" type="password" minlength="12" autocomplete="new-password" aria-label="New reset password"></div>
    <button class="btn" data-bw-onclick="completePasswordReset()">Update password</button>
    <div class="muted small">Updating your password signs out all existing sessions.</div>
  </div>
</div></div>





</body></html>`
}
function exportPrintableReport(){
 let blob=new Blob([buildComplianceReportHtml()],{type:"text/html"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=slug(state.profile.name)+"-compliance-report.html";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);logEvent("PRINTABLE_COMPLIANCE_REPORT_EXPORTED",{})
}

function buildEvidencePack(){
 let s=scoreData();
 return {generatedAt:new Date().toISOString(),ruleset:"BW-2026.08.30-launch",company:state.profile,scores:{compliance:s.comp,protection:s.prot},evidence:(state.evidence||[]).map(e=>({name:e.name,category:e.cat,reviewDate:e.date,verified:!!e.verified})),openCases:(state.cases||[]).map(c=>({employeeRef:c.employee,type:c.type,risk:c.risk,status:c.status,professionalReview:c.expertReview})),applicableControls:applicable().map(r=>({id:r.id,title:r.title,area:r.area,risk:r.risk,status:r.status(),authority:r.authority,effectiveFrom:r.effectiveFrom,source:r.url})),disclaimer:"Compliance management evidence pack. It is not a legal opinion and does not prove substantive compliance without validating the underlying evidence and facts."}
}
function exportEvidencePack(){downloadJson(buildEvidencePack(),slug(state.profile.name)+"-compliance-evidence-pack.json");logEvent("COMPLIANCE_EVIDENCE_PACK_EXPORTED",{})}

function exportAudit(){
 let blob=new Blob([JSON.stringify(store.audit,null,2)],{type:"application/json"});let a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bw-compliance-audit.json";a.click();URL.revokeObjectURL(a.href)
}

function seedAutoReviews(){
 updateActiveCompany(c=>{const reviews=[...(c.reviews||[])],existingKeys=new Set(reviews.filter(r=>r.autoKey).map(r=>r.autoKey));
  applicable().filter(r=>r.requiresExpert&&/Action required|review|Professional review required/i.test(r.status())).forEach(rule=>{const key="rule:"+rule.id;if(existingKeys.has(key))return;existingKeys.add(key);reviews.push({id:"rv_"+Date.now()+"_"+rule.id,autoKey:key,type:rule.area,issue:rule.title,risk:rule.risk,status:"Open",note:"Automatically queued from applicable control requiring professional validation.",createdAt:new Date().toISOString()})});
  (c.cases||[]).filter(item=>item.expertReview&&item.status==="Open").forEach(item=>{const key="case:"+item.id;if(existingKeys.has(key))return;existingKeys.add(key);reviews.push({id:"rv_"+Date.now()+"_"+item.id,autoKey:key,type:"Employment",issue:item.type+" — "+item.employee,risk:item.risk,status:"Open",note:"Automatically queued from Employer Shield case.",createdAt:new Date().toISOString()})});c.reviews=reviews
 });
}
function addReviewRequest(){
 let issue=rvIssue.value.trim();if(!issue)return;let r={id:"rv_"+Date.now(),type:rvType.value,issue,risk:rvRisk.value,status:"Open",note:rvNote.value.trim(),createdAt:new Date().toISOString()};
 updateActiveCompany(c=>{c.reviews=[r,...(c.reviews||[])]});logEvent("EXPERT_REVIEW_REQUESTED",{reviewId:r.id,type:r.type,risk:r.risk});rvIssue.value=rvNote.value="";save();renderAll()
}
function setReviewStatus(id,status){
 const found=(state.reviews||[]).find(x=>x.id===id);if(!found)return;const updatedAt=new Date().toISOString();
 updateActiveCompany(c=>{c.reviews=(c.reviews||[]).map(r=>r.id===id?{...r,status,updatedAt}:r)});logEvent("EXPERT_REVIEW_STATUS",{reviewId:id,status});save();renderAll()
}
function renderExpert(){
 seedAutoReviews();
 let arr=state.reviews||[],open=arr.filter(r=>r.status==="Open"),high=open.filter(r=>r.risk==="High");
 let q=id=>document.getElementById(id);
 if(q("reviewCount"))q("reviewCount").textContent=open.length;if(q("highReviewCount"))q("highReviewCount").textContent=high.length;
 if(q("ruleValidationCount"))q("ruleValidationCount").textContent=rules.filter(r=>r.requiresExpert).length;
 if(q("reviewQueue"))q("reviewQueue").safeHTML=open.length?open.map(r=>`<div class="item"><div class="between row"><div><b>${escapeHtml(r.issue)}</b><div class="muted small">${escapeHtml(r.type)} · ${new Date(r.createdAt).toLocaleDateString()}</div></div><span class="badge ${riskClass(r.risk)}">${r.risk}</span></div><div class="small" style="margin-top:7px">${escapeHtml(r.note||"")}</div><div class="actions" style="margin-top:9px"><button class="btn soft" data-bw-onclick="setReviewStatus('${safeId(r.id)}','Resolved')">Mark reviewed</button></div></div>`).join(""):'<div class="notice good">No open professional-review items.</div>';
}

function renderRuleLibrary(){
 let el=document.getElementById("ruleLibrary");if(!el)return;
 el.safeHTML=rules.map(r=>`<div class="item"><div class="between row"><div><b>${escapeHtml(r.title)}</b><div class="muted small">${escapeHtml(r.area)} · ${escapeHtml(r.authority)}</div></div><span class="badge ${riskClass(r.risk)}">${escapeHtml(r.risk)}</span></div><div class="rulemeta"><span>Effective: ${escapeHtml(r.effectiveFrom)}</span><span>Review: ${escapeHtml(r.review)}</span><span>Source linked</span>${r.requiresExpert?'<span>Expert validation required</span>':''}</div><p class="small">${escapeHtml(r.why)}</p><div class="source"><a href="${safeExternalUrl(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.source)}</a></div></div>`).join("")
}
function openCase(type){caseType.value=type;caseEmployee.value="";caseFacts.value="";caseRisk.value=/Termination|Misconduct|deduction/i.test(type)?"High":"Medium";openModal("caseModal")}
function saveCase(){
 let employee=caseEmployee.value.trim();if(!employee)return notifyUser("Enter an employee or staff reference.");
 let c={id:"case_"+Date.now(),employee,type:caseType.value,facts:caseFacts.value.trim(),risk:caseRisk.value,status:"Open",openedAt:new Date().toISOString(),expertReview:/High/.test(caseRisk.value)||/Termination|Misconduct|deduction/i.test(caseType.value)};
 updateActiveCompany(company=>{company.cases=[c,...(company.cases||[])]});logEvent("HR_CASE_OPENED",{caseId:c.id,type:c.type,risk:c.risk,expertReview:c.expertReview});save();renderCases();closeModal("caseModal")
}
function renderCases(){
 let el=document.getElementById("caseList");if(!el)return;let arr=state.cases||[];
 el.safeHTML=arr.length?arr.map(c=>`<div class="item"><div class="between row"><div><b>${escapeHtml(c.employee)}</b><div class="muted small">${escapeHtml(c.type)} · ${escapeHtml(c.status)}</div></div><span class="badge ${riskClass(c.risk)}">${c.risk}</span></div>${c.expertReview?'<div class="source">Professional review gate: ON</div>':''}</div>`).join(""):`<div class="muted small">No active cases.</div>`
}
function escapeHtml(s){return BW.dom.escapeHtml(s)}
function safeId(s){return BW.dom.safeId(s)}
function safeExternalUrl(value){return BW.dom.safeExternalUrl(value)}



function prefersReducedMotion(){return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}
function animateViewItems(){
  if(prefersReducedMotion())return;
  const view=document.querySelector(".view.active");
  if(!view)return;
  const els=[...view.querySelectorAll(":scope > .hero,:scope > .grid > .card,:scope > .card,:scope > .copilot-shell > .card,.eventcard,.sourcebox,.notice,.callout")].slice(0,24);
  els.forEach((el,i)=>{
    el.getAnimations?.().forEach(animation=>animation.cancel());
    el.style.setProperty("--motion-order",String(i));
    el.animate(
      [{opacity:.001,transform:"translateY(9px) scale(.995)"},{opacity:1,transform:"translateY(0) scale(1)"}],
      {duration:300,delay:Math.min(i*28,252),easing:"cubic-bezier(.2,.8,.2,1)",fill:"both"}
    );
  });
}
function animateNumber(el,to,suffix=""){
  if(!el)return;
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){el.textContent=to+suffix;return}
  let start=0,t0=performance.now(),dur=420;
  function step(t){
    let p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=Math.round(start+(to-start)*e)+suffix;
    if(p<1)requestAnimationFrame(step)
  }
  requestAnimationFrame(step);
}


function startOAuth(provider){if(!["google","facebook"].includes(provider))return;if(STANDALONE_PREVIEW||location.protocol==="file:"){notifyUser("Social sign-in requires the deployed OAuth backend. Use email sign-in or Preview workspace in the standalone HTML.");return}const next=encodeURIComponent(window.location.pathname+window.location.search);window.location.assign(`/api/auth/oauth/${provider}/start?next=${next}`)}


const RUNTIME_MODE=(document.querySelector('meta[name="bw-runtime-mode"]')?.content||"production").toLowerCase();
const STANDALONE_PREVIEW=RUNTIME_MODE==="preview";
function notifyUser(message,options={}){return BW.notifications.notify(message,options)}
function reportClientError(error,context="runtime"){
 const message=String(error?.message||error||"Unexpected application error");console.error("client_error",{context,message,error});
 if(!/AbortError|cancelled|canceled/i.test(message))BW.notifications.notify("Something went wrong. Your work is still on screen; retry the action or refresh if the problem continues.",{type:"error",duration:6500});
}
window.addEventListener("error",event=>reportClientError(event.error||event.message,"window.error"));
window.addEventListener("unhandledrejection",event=>reportClientError(event.reason,"unhandledrejection"));
const productionApiClient=BW.api.createClient({getCsrfToken:()=>csrfToken,onUnauthorized:()=>{try{showAuth()}catch{}},onError:(err)=>{try{BW.notifications.notify(err.message,{type:"error"})}catch{}}});
const publicApiClient=BW.api.createClient({getCsrfToken:()=>"",onUnauthorized:()=>{},onError:(err,ctx)=>console.error("BW public API request failed",{code:err.code,status:err.status,...ctx})});
const reportingAnalyticsApiClient=BW.api.createClient({getCsrfToken:()=>csrfToken,onUnauthorized:()=>{try{showAuth()}catch{}},onError:(err)=>console.warn("BW reporting analytics request failed",{code:err.code,status:err.status}),timeoutMs:90000,retries:2,candidateTimeoutMs:30000});
const reportingAnalyticsMemory=new Map();
const recentlyRemovedEmployeeIds=new Set();
const runtimeApiClient=STANDALONE_PREVIEW?Object.freeze({request:(url,opts={})=>BW.preview.request(url,opts)}):productionApiClient;
async function apiJson(url,opts={}){return runtimeApiClient.request(url,opts)}
async function reportingAnalyticsJson(url,opts={}){if(STANDALONE_PREVIEW)return runtimeApiClient.request(url,opts);try{const value=await reportingAnalyticsApiClient.request(url,opts);if(String(opts?.method||"GET").toUpperCase()==="GET")reportingAnalyticsMemory.set(String(url),{value,at:Date.now()});return value}catch(error){const cached=reportingAnalyticsMemory.get(String(url)),isTimeout=/timed out|timeout/i.test(String(error?.message||error||""));if(isTimeout&&cached&&Date.now()-cached.at<15*60*1000)return cached.value;throw error}}
function enterStandalonePreview(){if(!STANDALONE_PREVIEW)return false;document.body.classList.add("standalone-preview");const next=structuredClone(DEFAULT_STATE);next.activeRole="owner";replaceWorkspaceStore(next);currentUser={id:"preview-user",email:"preview@local",role:"owner"};marketingGate.classList.add("hidden");authGate.classList.add("hidden");revealWorkspaceShell();syncMobileRoleNav("owner");renderAll();applyRoleUi();showView("dashboard");const chip=document.querySelector(".prodchip");if(chip)chip.textContent="PREVIEW MODE";return true}


// v73 — daily operations reporting UI.
let dailyReporterToken="";
function browserGaboroneDate(){try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}}
function setText(id,value){return BW.dom.setText(id,value)}
function moneyBwp(v){return `P${Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2})}`}
function trendLabel(v,prefix=""){const n=Number(v||0);return `${n>0?"+":""}${prefix}${Number.isInteger(n)?n:n.toFixed(2)} vs prev.`}
function opsLatestSummary(items,locationId){return (items||[]).find(x=>String(x.location_id||"")===String(locationId||""))||(items||[])[0]||null}
let currentOpsSummaryId="";
function renderOpsNarrative(s){
  const box=document.getElementById("opsAiSummary"),mode=document.getElementById("opsSummaryMode"),feedback=document.getElementById("opsSummaryFeedback");if(!box||!mode)return;
  currentOpsSummaryId=s?.id||"";if(feedback)feedback.style.display=currentOpsSummaryId?"flex":"none";
  if(!s){mode.textContent="Not generated";box.safeHTML='<div class="muted">No management summary has been generated for this date.</div>';return}
  const n=s.narrative||{},metrics=s.metrics||{};mode.textContent=s.generationMode==="workers_ai"||s.generation_mode==="workers_ai"?"Workers AI · learned context":"Structured summary";
  const list=(title,arr)=>Array.isArray(arr)&&arr.length?`<div style="margin-top:12px"><b>${escapeHtml(title)}</b><ul class="ops-summary-list">${arr.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`:"";
  box.safeHTML=`<div><b>${escapeHtml(n.executiveSummary||"Summary available")}</b></div>${list("Performance readout",n.performance)}${list("Highlights",n.highlights)}${list("Risks / exceptions",n.risks)}${list("Suggested management follow-up",n.actions)}<div class="muted small" style="margin-top:12px">${escapeHtml(n.disclaimer||"")} ${metrics.aiError?`· AI fallback: ${escapeHtml(metrics.aiError)}`:""}</div>`;
}
function opsSeverityClass(severity){return severity==="critical"?"bad":severity==="warning"?"warn":severity==="positive"?"good":"info"}
function opsLearningNumber(v,digits=0){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):"0"}
function fillOpsPerformanceSettings(s={}){const set=(id,v)=>{const e=document.getElementById(id);if(e)e.checked=Number(v)!==0},num=(id,v,f)=>{const e=document.getElementById(id);if(e)e.value=Number(v??f)};set("opsPerfEnabled",s.enabled??1);set("opsPerfDeterioration",s.notify_deterioration??s.notifyDeterioration??1);set("opsPerfImprovement",s.notify_improvement??s.notifyImprovement??1);set("opsPerfCoverage",s.notify_reporting_gap??s.notifyReportingGap??1);set("opsPerfIncidents",s.notify_incidents??s.notifyIncidents??1);set("opsPerfInApp",s.notify_in_app??s.notifyInApp??1);set("opsPerfEmail",s.notify_email??s.notifyEmail??0);set("opsPerfWhatsapp",s.notify_whatsapp??s.notifyWhatsapp??0);num("opsPerfCoverageDrop",s.coverage_drop_points??s.coverageDrop,20);num("opsPerfMetricDrop",s.metric_drop_percent??s.metricDrop,30);num("opsPerfImprovementPct",s.improvement_percent??s.improvement,25);num("opsPerfMinDays",s.min_baseline_days??s.minDays,3)}
function renderOpsPerformance(data){
  const selected=data?.selected||null,profile=selected?.profile||{},b7=profile.baseline7||{},b30=profile.baseline30||{},status=document.getElementById("opsLearningStatus"),metrics=document.getElementById("opsLearningMetrics"),themes=document.getElementById("opsLearningThemes"),alertsBox=document.getElementById("opsPerformanceAlerts");
  if(status){status.textContent=profile.learningStatus==="active"?"Active memory":profile.learningStatus==="limited"?"Waiting for history":"Learning";status.className=`badge ${profile.learningStatus==="active"?"good":""}`}
  if(metrics)metrics.safeHTML=`<div class="ops-memory-stat"><span>History</span><b>${Number(profile.sampleDays||0)} days</b></div><div class="ops-memory-stat"><span>30-day coverage</span><b>${opsLearningNumber(b30.coverage,1)}%</b></div><div class="ops-memory-stat"><span>30-day tasks/day</span><b>${opsLearningNumber(b30.tasks,1)}</b></div><div class="ops-memory-stat"><span>30-day revenue/day</span><b>${moneyBwp(b30.revenue||0)}</b></div><div class="ops-memory-stat"><span>7-day revenue/day</span><b>${moneyBwp(b7.revenue||0)}</b></div><div class="ops-memory-stat"><span>Prior summaries</span><b>${Number(profile.summaryMemory?.length||0)} remembered</b></div><div class="ops-memory-stat"><span>Manager feedback</span><b>${Number(profile.feedbackContext?.useful||0)} useful · ${Number(profile.feedbackContext?.notUseful||0)} rejected</b></div>`;
  const recurring=(profile.recurringThemes||[]).filter(x=>Number(x.days||0)>=2);if(themes)themes.safeHTML=recurring.length?`<div class="section-eyebrow">Recurring themes</div><div class="ops-theme-list">${recurring.slice(0,5).map(x=>`<span class="ops-theme-chip">${escapeHtml(x.type)} · ${escapeHtml(x.text)} · ${Number(x.days)} days</span>`).join("")}</div>`:'<div class="muted small">No repeated blocker/incident theme has enough history yet.</div>';
  const candidates=[...(data?.savedInsights||[]),...(data?.alerts||[])],seen=new Set(),alerts=candidates.filter(x=>{const k=x.id||`${x.signal_type||x.signalType}:${x.location_id||x.locationId||"all"}`;if(seen.has(k))return false;seen.add(k);return (x.status||"open")!=="resolved"&&(x.status||"open")!=="dismissed"}).slice(0,12);setText("opsAlertCount",`${alerts.length} open`);
  if(alertsBox)alertsBox.safeHTML=alerts.length?alerts.map(x=>{const id=x.id||"",severity=x.severity||"info",location=x.location_name||x.locationName||"All locations",title=x.title||x.signal_type||x.signalType||"Performance signal",explanation=x.explanation||"";return `<div class="ops-alert-card ${opsSeverityClass(severity)}"><div class="between row"><div><span class="badge ${opsSeverityClass(severity)}">${escapeHtml(severity)}</span> <b>${escapeHtml(title)}</b><div class="muted small">${escapeHtml(location)}</div></div>${id&&!String(id).startsWith("preview-")?`<div class="row ops-alert-actions"><button class="btn soft" type="button" data-bw-onclick="updateOpsInsightStatus('${safeId(id)}','acknowledged')">Acknowledge</button><button class="btn soft" type="button" data-bw-onclick="updateOpsInsightStatus('${safeId(id)}','resolved')">Resolve</button></div>`:""}</div><div class="small" style="margin-top:7px">${escapeHtml(explanation)}</div></div>`}).join(""):'<div class="notice good"><b>No open performance threshold alert.</b><div class="small">The learning engine will continue comparing new reports with operating history.</div></div>';
  fillOpsPerformanceSettings(data?.settings||selected?.settings||{});setText("opsLearningUpdated",profile.sampleDays?`Using ${profile.sampleDays} historical reporting day(s).`:"Baseline starts as reports accumulate.");
}
async function refreshOpsPerformanceLearning(){const date=document.getElementById("opsReportDate")?.value||browserGaboroneDate(),locationId=document.getElementById("opsLocationFilter")?.value||null,status=document.getElementById("opsLearningUpdated");if(status)status.textContent="Refreshing…";try{if(!STANDALONE_PREVIEW)await apiJson("/api/daily-reporting/performance/refresh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date,locationId})});await loadOpsPerformanceLearning();if(status)status.textContent="Learning memory refreshed."}catch(e){if(status)status.textContent=e.message}}
async function saveOpsPerformanceSettings(){const status=document.getElementById("opsPerformanceSettingsStatus"),payload={enabled:document.getElementById("opsPerfEnabled").checked,notifyDeterioration:document.getElementById("opsPerfDeterioration").checked,notifyImprovement:document.getElementById("opsPerfImprovement").checked,notifyReportingGap:document.getElementById("opsPerfCoverage").checked,notifyIncidents:document.getElementById("opsPerfIncidents").checked,notifyInApp:document.getElementById("opsPerfInApp").checked,notifyEmail:document.getElementById("opsPerfEmail").checked,notifyWhatsapp:document.getElementById("opsPerfWhatsapp").checked,coverageDropPoints:Number(document.getElementById("opsPerfCoverageDrop").value),metricDropPercent:Number(document.getElementById("opsPerfMetricDrop").value),improvementPercent:Number(document.getElementById("opsPerfImprovementPct").value),minBaselineDays:Number(document.getElementById("opsPerfMinDays").value)};try{if(!STANDALONE_PREVIEW)await apiJson("/api/daily-reporting/performance-settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});if(status)status.textContent="Saved. Future alerts use these thresholds."}catch(e){if(status)status.textContent=e.message}}
async function sendOpsSummaryFeedback(rating){if(!currentOpsSummaryId)return;let note="",outcome="watch";if(rating==="not_useful"){const answer=await BW.dialog.prompt({title:"Improve the AI summary",message:"What should the AI improve next time? Avoid sensitive employee information.",multiline:true,maxLength:900,confirmLabel:"Save feedback"});if(answer===null)return;note=answer.trim();outcome="false_positive"}else{const answer=await BW.dialog.prompt({title:"Management feedback",message:"Optional: what was useful or what action did management take?",multiline:true,maxLength:900,confirmLabel:"Save feedback"});if(answer===null)return;note=answer.trim();outcome=note?"actioned":"watch"}const status=document.getElementById("opsFeedbackStatus");try{if(!STANDALONE_PREVIEW)await apiJson("/api/daily-reporting/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({summaryId:currentOpsSummaryId,rating,outcome,note})});if(status)status.textContent="Feedback saved into future AI context."}catch(e){if(status)status.textContent=e.message}}
async function updateOpsInsightStatus(id,status){try{if(!STANDALONE_PREVIEW)await apiJson(`/api/daily-reporting/performance-insights/${encodeURIComponent(id)}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderDailyOperations()}catch(e){notifyUser(e.message)}}

function renderOpsBranches(branches){const box=document.getElementById("opsBranchPerformance");if(!box)return;if(!branches?.length){box.safeHTML='<div class="muted small">No active locations yet.</div>';return}box.safeHTML=`<div class="ops-branch ops-header"><span>Location</span><span>Coverage</span><span>Tasks</span><span>Customers/jobs</span><span>Revenue</span><span>Incidents</span><span>Attention</span></div>`+branches.map(b=>`<div class="ops-branch"><div class="ops-branch-name"><div class="mini-ring" style="--p:${Math.max(0,Math.min(100,Number(b.coverage||0)))}"><b>${Number(b.coverage||0)}%</b></div><div><b>${escapeHtml(b.name)}</b><span class="ops-trend">${Number(b.submittedExpected??b.submitted??0)}/${Number(b.expected||0)} expected${Number(b.submitted||0)>Number(b.submittedExpected??b.submitted??0)?` · ${Number(b.submitted)-Number(b.submittedExpected??b.submitted??0)} optional report`:""}${Number(b.excused||0)?` · ${Number(b.excused||0)} not expected`:""}</span></div></div><span>${Number(b.coverage||0)}%</span><span>${Number(b.tasks||0)}<small class="ops-trend">${escapeHtml(trendLabel(b.trend?.tasks||0))}</small></span><span>${Number(b.customers||0)}<small class="ops-trend">${escapeHtml(trendLabel(b.trend?.customers||0))}</small></span><span>${moneyBwp(b.revenue)}<small class="ops-trend">${escapeHtml(trendLabel(b.trend?.revenue||0,"P"))}</small></span><span>${Number(b.incidents||0)}</span><span>${Number(b.attention||0)}</span></div>`).join("")}
function renderOpsMissing(items){const box=document.getElementById("opsMissingReports");if(!box)return;setText("opsMissingCount",items?.length||0);box.safeHTML=items?.length?items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.fullName)}</b><div class="muted small">${escapeHtml(x.roleTitle||"Employee")} · ${escapeHtml(x.locationName)}</div></div><button class="btn soft" type="button" data-bw-onclick="markOpsReportingException('${safeId(x.employeeId)}','${safeId(x.locationId)}')">Not expected today</button></div></div>`).join(""):'<div class="notice good"><b>All expected reporting links have a report.</b><div class="small">Coverage excludes manager-approved reporting exceptions for this date.</div></div>'}
function renderOpsExceptions(items){const wrap=document.getElementById("opsReportingExceptionsWrap"),box=document.getElementById("opsReportingExceptions");if(!wrap||!box)return;wrap.style.display=items?.length?"block":"none";const labels={leave:"Leave",rest_day:"Rest day",field_assignment:"Field assignment",training:"Training",connectivity:"Connectivity",other:"Other approved exception"};box.safeHTML=(items||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.full_name)}</b><div class="muted small">${escapeHtml(x.location_name)} · ${escapeHtml(labels[x.reason_code]||x.reason_code)}${x.note?` · ${escapeHtml(x.note)}`:""}</div></div><button class="btn alt" type="button" data-bw-onclick="removeOpsReportingException('${safeId(x.id)}')">Restore expectation</button></div></div>`).join("")}

function renderOpsReports(items){const box=document.getElementById("opsReportsList");if(!box)return;box.safeHTML=items?.length?items.map(r=>{const k=typeof r.kpi_json==="string"?(()=>{try{return JSON.parse(r.kpi_json)}catch{return {}}})():r.kpi_json||{};return `<div class="ops-report-card ${r.needs_attention?"ops-attention":""}"><div class="between row"><div><b>${escapeHtml(r.full_name)}</b><div class="muted small">${escapeHtml(r.location_name)} · submitted ${new Date(r.submitted_at).toLocaleString()}</div></div>${r.needs_attention?'<span class="badge warn">Needs attention</span>':''}</div><div class="small" style="margin-top:8px"><b>Work:</b> ${escapeHtml(r.work_summary||"—")}</div><div class="ops-report-grid"><div class="ops-report-field"><b>Wins</b>${escapeHtml(r.wins||"—")}</div><div class="ops-report-field"><b>Blockers</b>${escapeHtml(r.blockers||"—")}</div><div class="ops-report-field"><b>Incidents / issues</b>${escapeHtml(r.incidents||"—")}</div></div><div class="muted small" style="margin-top:9px">Tasks ${Number(k.tasksCompleted||0)} · Customers/jobs ${Number(k.customersHandled||0)} · Revenue ${moneyBwp(k.revenueBwp)} · Incidents ${Number(k.incidentsCount||0)}</div></div>`}).join(""):'<div class="muted small">No reports submitted for this filter.</div>'}
function renderOpsLocations(items){const box=document.getElementById("opsLocationsList");if(!box)return;const rows=items||[];globalThis.__opsLocationsById=Object.fromEntries(rows.map(x=>[String(x.id),x]));const signature=JSON.stringify(rows.map(x=>[String(x.id||""),String(x.name||""),String(x.code||""),String(x.town||""),Number(x.active)===1]));if(box.dataset.opsLocationsSignature===signature)return;box.dataset.opsLocationsSignature=signature;box.safeHTML=rows.map(x=>{const active=Number(x.active)===1;return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.code||"No code")}${x.town?` · ${escapeHtml(x.town)}`:""} · ${active?"Active":"Removed"}</div></div><div class="actions"><button class="btn alt" data-bw-onclick="editOpsLocation('${escapeHtml(x.id)}')">Edit</button><button class="btn alt" data-bw-onclick="${active?`removeOpsLocation('${escapeHtml(x.id)}')`:`reactivateOpsLocation('${escapeHtml(x.id)}')`}">${active?"Remove":"Reactivate"}</button></div></div></div>`}).join("")||'<div class="muted small">No locations configured.</div>'}
function renderOpsAccess(items){const box=document.getElementById("opsReporterAccessList");if(!box)return;const active=(items||[]).filter(x=>x.status==="active");box.safeHTML=active.length?active.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.full_name)}</b><div class="muted small">${escapeHtml(x.location_name)} · expires ${new Date(x.expires_at).toLocaleDateString()}${x.last_used_at?` · last used ${new Date(x.last_used_at).toLocaleDateString()}`:" · not used yet"}</div></div><button class="btn alt" data-bw-onclick="revokeOpsReporterAccess('${escapeHtml(x.id)}')">Revoke</button></div></div>`).join(""):'<div class="muted small">No active employee reporting links yet.</div>'}
function fillSelectPreserve(select,items,labelFn,emptyLabel){if(!select)return;const old=select.value;select.safeHTML=(emptyLabel?`<option value="">${escapeHtml(emptyLabel)}</option>`:"")+(items||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(labelFn(x))}</option>`).join("");if([...select.options].some(o=>o.value===old))select.value=old}
let opsReportingSetupEpoch=0;
async function renderPeopleReportingSetup(){
  if(!document.getElementById("peopleops")?.classList.contains("active"))return;
  const reportingSetupDetails=document.getElementById("opsReportingSetupDetails");
  if(reportingSetupDetails&&!reportingSetupDetails.open)reportingSetupDetails.open=true;
  if(!["owner","manager"].includes(currentWorkspaceRole()))return;
  const setupEpoch=++opsReportingSetupEpoch;
  const [locationsR,employeesR,accessR]=await Promise.allSettled([
    apiJson("/api/daily-reporting/locations"),
    apiJson("/api/employees"),
    apiJson("/api/daily-reporting/access")
  ]);
  if(setupEpoch!==opsReportingSetupEpoch)return;
  const value=(result,fallback)=>result.status==="fulfilled"?result.value:fallback;
  const reason=result=>result.status==="rejected"?result.reason:null;
  const locations=value(locationsR,{items:[]}),employees=value(employeesR,{items:[]}),access=value(accessR,{items:[]});
  const allLocs=locations.items||[],locs=allLocs.filter(x=>Number(x.active)===1),emps=(employees.items||[]).filter(x=>String(x.status||"").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(x.id)));
  fillSelectPreserve(document.getElementById("opsReporterLocation"),locs,x=>x.name,"Select location");
  fillSelectPreserve(document.getElementById("opsReporterEmployee"),emps,x=>`${x.full_name}${x.role_title?` · ${x.role_title}`:""}`,"Select employee");
  if(locationsR.status==="fulfilled")renderOpsLocations(allLocs);
  else{const box=document.getElementById("opsLocationsList");if(box)box.safeHTML=`<div class="notice bad">Locations could not load. ${escapeHtml(reason(locationsR)?.message||"Retry this section.")}</div>`}
  const accessButton=document.querySelector('#peopleops [data-bw-onclick="createOpsReporterLink()"]');
  const accessBlocked=accessR.status==="rejected";
  if(accessButton)accessButton.disabled=accessBlocked||!locs.length||!emps.length;
  if(accessR.status==="fulfilled"){
    if(!emps.length){const box=document.getElementById("opsReporterAccessList");if(box)box.safeHTML='<div class="notice info">Add an active employee first, then issue a reporting link.</div>'}
    else if(!locs.length){const box=document.getElementById("opsReporterAccessList");if(box)box.safeHTML='<div class="notice info">Add a location first, then issue a reporting link.</div>'}
    else renderOpsAccess(access.items||[]);
  }else{
    const err=reason(accessR),box=document.getElementById("opsReporterAccessList"),planBlocked=Number(err?.status||0)===402||String(err?.code||"")==="feature_not_in_plan";
    if(box)box.safeHTML=planBlocked?'<div class="notice info"><b>Employee reporting is not available on the current plan.</b><div class="small">Locations still work independently. Upgrade the workspace plan to issue restricted employee reporting links.</div></div>':`<div class="notice bad">Employee reporting access could not load. ${escapeHtml(err?.message||"Retry this section.")}</div>`;
  }
}
async function renderDailyOperations(){
  const root=document.getElementById("dailyreports");if(!root)return;const role=currentWorkspaceRole();if(!["owner","manager"].includes(role))return;
  const setupEpoch=++opsReportingSetupEpoch;
  const dateEl=document.getElementById("opsReportDate");if(dateEl&&!dateEl.value)dateEl.value=browserGaboroneDate();
  const date=dateEl?.value||browserGaboroneDate(),locationId=document.getElementById("opsLocationFilter")?.value||"";
  const requests=[
    apiJson("/api/daily-reporting/locations"),
    apiJson("/api/employees"),
    apiJson("/api/daily-reporting/access"),
    reportingAnalyticsJson(`/api/daily-reporting/dashboard?date=${encodeURIComponent(date)}${locationId?`&locationId=${encodeURIComponent(locationId)}`:""}`)
  ];
  const [locationsR,employeesR,accessR,dashboardR]=await Promise.allSettled(requests);
  if(setupEpoch!==opsReportingSetupEpoch)return;
  const value=(result,fallback)=>result.status==="fulfilled"?result.value:fallback;
  const reason=result=>result.status==="rejected"?result.reason:null;
  const locations=value(locationsR,{items:[]}),employees=value(employeesR,{items:[]}),access=value(accessR,{items:[]}),dashboard=value(dashboardR,{});
  const allLocs=locations.items||[],locs=allLocs.filter(x=>Number(x.active)===1),emps=(employees.items||[]).filter(x=>String(x.status||"").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(x.id)));
  fillSelectPreserve(document.getElementById("opsLocationFilter"),locs,x=>x.name,"All locations");
  fillSelectPreserve(document.getElementById("opsReporterLocation"),locs,x=>x.name,"Select location");
  fillSelectPreserve(document.getElementById("opsReporterEmployee"),emps,x=>`${x.full_name}${x.role_title?` · ${x.role_title}`:""}`,"Select employee");
  if(locationId&&document.getElementById("opsLocationFilter"))document.getElementById("opsLocationFilter").value=locationId;

  if(locationsR.status==="fulfilled")renderOpsLocations(allLocs);
  else{const box=document.getElementById("opsLocationsList");if(box)box.safeHTML=`<div class="notice bad">Locations could not load. ${escapeHtml(reason(locationsR)?.message||"Retry this section.")}</div>`}

  const accessButton=document.querySelector('#dailyreports [data-bw-onclick="createOpsReporterLink()"]');
  const accessBlocked=accessR.status==="rejected";
  if(accessButton)accessButton.disabled=accessBlocked||!locs.length||!emps.length;
  if(accessR.status==="fulfilled"){
    if(!emps.length){const box=document.getElementById("opsReporterAccessList");if(box)box.safeHTML='<div class="notice info">Add an active employee first, then issue a reporting link.</div>'}
    else if(!locs.length){const box=document.getElementById("opsReporterAccessList");if(box)box.safeHTML='<div class="notice info">Add a location first, then issue a reporting link.</div>'}
    else renderOpsAccess(access.items||[]);
  }else{
    const err=reason(accessR),box=document.getElementById("opsReporterAccessList"),planBlocked=Number(err?.status||0)===402||String(err?.code||"")==="feature_not_in_plan";
    if(box)box.safeHTML=planBlocked?'<div class="notice info"><b>Employee reporting is not available on the current plan.</b><div class="small">Locations still work independently. Upgrade the workspace plan to issue restricted employee reporting links.</div></div>':`<div class="notice bad">Employee reporting access could not load. ${escapeHtml(err?.message||"Retry this section.")}</div>`;
  }

  setText("opsCoverage",`${Number(dashboard.coverage||0)}%`);setText("opsReportsReceived",dashboard.reports?.length||0);setText("opsReportOrb",dashboard.reports?.length||0);
  setText("opsExpectedReports",dashboard.reportingPopulation?.expected??dashboard.accesses?.length??0);setText("opsLocationsReporting",dashboard.locationsReporting||0);setText("opsLocationOrb",dashboard.locationsReporting||0);
  setText("opsAttention",dashboard.totals?.attention||0);setText("opsAttentionOrb",dashboard.totals?.attention||0);
  renderOpsBranches(dashboard.branches||[]);renderOpsMissing(dashboard.missing||[]);renderOpsExceptions(dashboard.exceptions||[]);renderOpsReports(dashboard.reports||[]);
  const [settingsR,summariesR]=await Promise.allSettled([
    apiJson("/api/daily-reporting/settings"),
    reportingAnalyticsJson(`/api/daily-reporting/summaries?date=${encodeURIComponent(date)}`)
  ]);
  const settings=value(settingsR,{}),summaries=value(summariesR,{items:[]});
  const autoSummary=document.getElementById("opsAutoSummary");if(autoSummary){autoSummary.checked=Number(settings.auto_summary_enabled||0)===1||settings.autoSummaryEnabled===true;autoSummary.disabled=settingsR.status==="rejected"}
  renderOpsNarrative(summariesR.status==="fulfilled"?opsLatestSummary(summaries.items||[],locationId):null);
  const reportingFailures=[dashboardR].filter(x=>x.status==="rejected");
  if(reportingFailures.length){
    const first=reason(reportingFailures[0]),box=document.getElementById("opsAiSummary"),planBlocked=reportingFailures.some(x=>Number(reason(x)?.status||0)===402||String(reason(x)?.code||"")==="feature_not_in_plan");
    if(box)box.safeHTML=planBlocked?'<div class="notice info"><b>Daily reporting analytics are not available on the current plan.</b><div class="small">Location setup remains available.</div></div>':`<div class="notice bad"><b>Reporting analytics are temporarily unavailable.</b><div class="small">${escapeHtml(first?.message||"Retry this section.")}</div><button class="btn alt" type="button" style="margin-top:8px" data-bw-onclick="renderDailyOperations()">Retry analytics</button></div>`;
  }
  setTimeout(()=>document.querySelectorAll('#dailyreports .metric-ring[data-ring-target]').forEach(syncMetricRing),10);
}
async function loadOpsPerformanceLearning(){const date=document.getElementById("opsReportDate")?.value||browserGaboroneDate(),locationId=document.getElementById("opsLocationFilter")?.value||"",status=document.getElementById("opsLearningUpdated");if(status)status.textContent="Loading performance learning…";try{const performance=await reportingAnalyticsJson(`/api/daily-reporting/performance?date=${encodeURIComponent(date)}${locationId?`&locationId=${encodeURIComponent(locationId)}`:""}`);renderOpsPerformance(performance);if(status&&!String(status.textContent||"").includes("historical"))status.textContent="Performance learning loaded."}catch(e){if(status)status.textContent="Performance learning could not load. "+e.message}}
async function addOpsLocation(){const name=document.getElementById("opsLocationName").value.trim();if(!name)return notifyUser("Enter a location name.");try{const saved=await apiJson("/api/daily-reporting/locations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,code:document.getElementById("opsLocationCode").value,town:document.getElementById("opsLocationTown").value})});document.getElementById("opsLocationName").value="";document.getElementById("opsLocationCode").value="";document.getElementById("opsLocationTown").value="";if(document.getElementById("peopleops")?.classList.contains("active"))await renderPeopleReportingSetup();if(document.getElementById("dailyreports")?.classList.contains("active"))await renderDailyOperations();notifyUser(saved?.reusedDefault?"Location saved. The initial Head Office placeholder was replaced.":"Location added.",{type:"success"})}catch(e){notifyUser(e.message)}}
async function editOpsLocation(id){const current=globalThis.__opsLocationsById?.[String(id)];if(!current)return notifyUser("Location details are unavailable. Reload this section.");const name=await BW.dialog.prompt({title:"Edit location name",message:"Update the office, branch, shop, site or team name.",defaultValue:String(current.name||""),required:true,minLength:2,maxLength:90,confirmLabel:"Next"});if(name===null)return;const code=await BW.dialog.prompt({title:"Edit location code",message:"Optional short code used in reporting filters.",defaultValue:String(current.code||""),maxLength:16,confirmLabel:"Next"});if(code===null)return;const town=await BW.dialog.prompt({title:"Edit location town / area",message:"Optional town or area.",defaultValue:String(current.town||""),maxLength:80,confirmLabel:"Save location"});if(town===null)return;try{await apiJson(`/api/daily-reporting/locations/${encodeURIComponent(id)}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({name,code,town})});await renderDailyOperations();await renderPeopleReportingSetup();notifyUser("Location updated.",{type:"success"})}catch(e){notifyUser(e.message)}}
async function removeOpsLocation(id){const current=globalThis.__opsLocationsById?.[String(id)],confirmed=await BW.dialog.confirm({title:"Remove location?",message:`Remove ${current?.name||"this location"} from active use? Historical reports stay intact and active employee reporting links for this location will be revoked. You can restore the location later.`,confirmLabel:"Remove location",danger:true});if(!confirmed)return;try{await apiJson(`/api/daily-reporting/locations/${encodeURIComponent(id)}/deactivate`,{method:"POST",body:"{}"});await renderDailyOperations();await renderPeopleReportingSetup();notifyUser("Location removed from active use. Historical reports were retained and reporting links for it were revoked.",{type:"success"})}catch(e){notifyUser(e.message)}}
async function deactivateOpsLocation(id){return removeOpsLocation(id)}
async function reactivateOpsLocation(id){try{await apiJson(`/api/daily-reporting/locations/${encodeURIComponent(id)}/reactivate`,{method:"POST",body:"{}"});await renderDailyOperations();await renderPeopleReportingSetup();notifyUser("Location reactivated.",{type:"success"})}catch(e){notifyUser(e.message)}}
async function createOpsReporterLink(){const employeeId=document.getElementById("opsReporterEmployee").value,locationId=document.getElementById("opsReporterLocation").value;if(!employeeId||!locationId)return notifyUser("Choose an employee and location.");try{let r;if(STANDALONE_PREVIEW)r={link:"https://your-domain.example/#report=secure-employee-link",employeeName:"Demo Employee",locationName:"Head Office",expiresInDays:Number(document.getElementById("opsReporterExpiry").value)};else r=await apiJson("/api/daily-reporting/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({employeeId,locationId,expiresInDays:Number(document.getElementById("opsReporterExpiry").value)})});const box=document.getElementById("opsReporterLinkResult");box.safeHTML=`<div class="notice good" style="margin-top:12px"><b>Reporting link created</b><div class="small">Share this only with ${escapeHtml(r.employeeName||"the employee")}. Creating another link for the same location revokes the previous one.</div><div class="ops-access-link"><input id="opsNewReporterLink" readonly value="${escapeHtml(r.link||"")}"><button class="btn alt" data-bw-onclick="copyOpsReporterLink()">Copy link</button><button class="btn alt" data-bw-onclick="shareOpsReporterLink()">Share</button></div><div class="muted small" style="margin-top:8px">Share uses the phone/browser share sheet when available (including WhatsApp on supported devices). The reporting link is a private bearer link—send it only to the named employee.</div></div>`;if(!STANDALONE_PREVIEW)await renderDailyOperations()}catch(e){notifyUser(e.message)}}
async function copyOpsReporterLink(){const el=document.getElementById("opsNewReporterLink");if(!el)return;try{await navigator.clipboard.writeText(el.value)}catch{el.select();document.execCommand("copy")}}
async function shareOpsReporterLink(){const e=document.getElementById("opsNewReporterLink");if(!e||!e.value)return;const text=`BW Daily Operations reporting link. This private link is for the assigned employee only: ${e.value}`;try{if(navigator.share){await navigator.share({title:"Daily operations report",text});return}const u=`https://wa.me/?text=${encodeURIComponent(text)}`;window.open(u,"_blank","noopener,noreferrer")}catch(err){if(err?.name!=="AbortError")notifyUser("Unable to open the share sheet. Use Copy link instead.")}}
async function revokeOpsReporterAccess(id){const confirmed=await BW.dialog.confirm({title:"Revoke reporting link?",message:"Revoke this employee reporting link? The existing private link will stop working.",confirmLabel:"Revoke link",danger:true});if(!confirmed)return;try{await apiJson(`/api/daily-reporting/access/${encodeURIComponent(id)}/revoke`,{method:"POST",body:"{}"});await renderDailyOperations()}catch(e){notifyUser(e.message)}}
async function markOpsReportingException(employeeId,locationId){
  const date=document.getElementById("opsReportDate")?.value||browserGaboroneDate();
  const choice=await BW.dialog.prompt({title:"Reporting exception",message:"Why is this employee not expected to report today?",defaultValue:"leave",options:[{value:"leave",label:"Leave"},{value:"rest_day",label:"Rest day"},{value:"field_assignment",label:"Field assignment"},{value:"training",label:"Training"},{value:"connectivity",label:"Connectivity"},{value:"other",label:"Other"}],confirmLabel:"Continue"});if(choice===null)return;
  const reasonCode=choice;
  let note=choice;if(reasonCode==="other"){const answer=await BW.dialog.prompt({title:"Reporting exception note",message:"Optional short note. Do not enter sensitive medical details.",multiline:true,maxLength:500,confirmLabel:"Save exception"});if(answer===null)return;note=answer.trim()}
  try{if(!STANDALONE_PREVIEW)await apiJson("/api/daily-reporting/exceptions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({employeeId,locationId,date,reasonCode,note})});await renderDailyOperations()}catch(e){notifyUser(e.message)}
}
async function removeOpsReportingException(id){const confirmed=await BW.dialog.confirm({title:"Remove reporting exception?",message:"Restore this employee as expected to report for the selected date?",confirmLabel:"Restore reporting"});if(!confirmed)return;try{if(!STANDALONE_PREVIEW)await apiJson(`/api/daily-reporting/exceptions/${encodeURIComponent(id)}`,{method:"DELETE"});await renderDailyOperations()}catch(e){notifyUser(e.message)}}
async function generateOpsSummary(){const date=document.getElementById("opsReportDate").value||browserGaboroneDate(),locationId=document.getElementById("opsLocationFilter").value||null;const box=document.getElementById("opsAiSummary");if(box)box.safeHTML='<div class="muted">Generating grounded management summary…</div>';try{let r;if(STANDALONE_PREVIEW)r=(await BW.preview.request("/api/daily-reporting/summaries",{method:"GET"})).items[0];else r=await apiJson("/api/daily-reporting/ai-summary",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date,locationId})});renderOpsNarrative(r);if(!STANDALONE_PREVIEW)await renderDailyOperations()}catch(e){if(box)box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}}
async function saveOpsReportingSettings(){const enabled=document.getElementById("opsAutoSummary").checked,status=document.getElementById("opsAutomationStatus");try{if(!STANDALONE_PREVIEW)await apiJson("/api/daily-reporting/settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({autoSummaryEnabled:enabled})});status.textContent=enabled?"Automatic daily digest enabled for 18:15 Botswana time.":"Automatic daily digest disabled. Manual summaries remain available."}catch(e){status.textContent=e.message}}

function updateReporterNetworkStatus(){const st=document.getElementById("reporterDraftStatus");if(!st)return;st.textContent=navigator.onLine?"Entries stay on this page until sent. Sensitive report text is not persisted in browser storage.":"Offline — keep this page open. Your entries remain here; retry when connectivity returns."}
window.addEventListener("online",updateReporterNetworkStatus);window.addEventListener("offline",updateReporterNetworkStatus);
async function handleDailyReporterPortal(){const hash=location.hash||"";if(!hash.startsWith("#report="))return false;const reportPath=location.pathname.replace(/\/+$/,"")||"/";if(reportPath!=="/report"){location.replace("/report/?entry=legacy-runtime&v=20260923e"+hash);return true;}dailyReporterToken=decodeURIComponent(hash.slice(8));marketingGate.classList.add("hidden");authGate.classList.add("hidden");concealWorkspaceShell();syncMobileRoleNav("");const rolePortal=document.getElementById("roleAccessPortal");if(rolePortal)rolePortal.style.display="none";const portal=document.getElementById("reporterPortal");portal.style.display="block";try{let data;if(STANDALONE_PREVIEW)data={employee:{name:"Demo Employee",roleTitle:"Operations Assistant"},location:{name:"Head Office",town:"Gaborone"},companyName:"Demo Company",reportDate:browserGaboroneDate()};else{data=await publicApiClient.request("/public/daily-reporting/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:dailyReporterToken})})};setText("reporterEmployeeName",`${data.employee.name}${data.employee.roleTitle?` · ${data.employee.roleTitle}`:""}`);setText("reporterLocationName",`${data.location.name}${data.location.town?` · ${data.location.town}`:""}`);setText("reporterCompanyName",data.companyName);document.getElementById("reporterDate").value=data.reportDate||browserGaboroneDate();updateReporterNetworkStatus()}catch(e){const er=document.getElementById("reporterPortalError");er.textContent=e.message;er.style.display="block";document.getElementById("reporterDailyForm").style.display="none"}return true}
async function submitDailyReporterForm(){const btn=document.getElementById("reporterSubmitBtn"),success=document.getElementById("reporterPortalSuccess"),error=document.getElementById("reporterPortalError");success.style.display="none";error.style.display="none";const payload={token:dailyReporterToken,reportDate:document.getElementById("reporterDate").value,workSummary:document.getElementById("reporterWorkSummary").value,wins:document.getElementById("reporterWins").value,blockers:document.getElementById("reporterBlockers").value,incidents:document.getElementById("reporterIncidents").value,nextPlan:document.getElementById("reporterNextPlan").value,needsAttention:document.getElementById("reporterNeedsAttention").checked,kpis:{tasksCompleted:document.getElementById("reporterTasks").value,customersHandled:document.getElementById("reporterCustomers").value,revenueBwp:document.getElementById("reporterRevenue").value,incidentsCount:document.getElementById("reporterIncidentCount").value,customLabel:document.getElementById("reporterCustomLabel").value,customValue:document.getElementById("reporterCustomValue").value}};if(!payload.workSummary.trim()&&!payload.wins.trim()&&!payload.blockers.trim()&&!payload.incidents.trim()&&!payload.nextPlan.trim()){error.textContent="Add at least one report note before sending.";error.style.display="block";return}btn.disabled=true;btn.textContent="Sending…";try{let data;if(STANDALONE_PREVIEW)data={message:"Preview report accepted."};else{data=await publicApiClient.request("/public/daily-reporting/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)})};success.textContent=`${data.message||"Daily report submitted."} You can update the same reporting date if you need to correct something.`;success.style.display="block";updateReporterNetworkStatus();window.scrollTo({top:0,behavior:"smooth"})}catch(e){error.textContent=e.message;error.style.display="block"}finally{btn.disabled=false;btn.textContent="Send daily report"}}

async function renderSocialAccounts(){
  const list=document.getElementById("socialAccountList");if(!list)return;
  try{
    const s=await apiJson("/api/account/social");
    const providers=[["google","Google",s.google],["facebook","Facebook",s.facebook]];
    document.getElementById("googleLinkStatus").textContent=s.google.linked?"Linked ✓":"Not linked";
    document.getElementById("facebookLinkStatus").textContent=s.facebook.linked?"Linked ✓":"Not linked";
    list.safeHTML=providers.map(([key,label,val])=>`<div class="item"><div class="between row"><div><b>${label}</b><div class="muted small">${val.linked?`Linked${val.email?` · ${escapeHtml(val.email)}`:""}`:"Use this account to sign in faster."}</div></div>${val.linked?`<button class="btn alt" data-bw-onclick="unlinkSocial('${key}')">Disconnect</button>`:`<button class="btn soft" data-bw-onclick="linkSocial('${key}')">Connect</button>`}</div></div>`).join("");
  }catch(e){
    list.safeHTML=`<div class="notice bad"><b>Could not load linked accounts.</b><div class="small">${escapeHtml(e.message)}</div></div>`;
  }
}
async function linkSocial(provider){
  if(!["google","facebook"].includes(provider))return;
  try{
    const r=await apiJson(`/api/account/social/${provider}/link`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    const u=new URL(String(r.authorizeUrl||""),window.location.origin);
    if(u.protocol!=="https:"||!["accounts.google.com","www.facebook.com"].includes(u.hostname))throw new Error("OAuth authorization URL was rejected.");
    window.location.assign(u.toString());
  }catch(e){notifyUser(e.message||"Unable to start account linking.")}
}
async function unlinkSocial(provider){
  const confirmed=await BW.dialog.confirm({title:"Disconnect sign-in provider?",message:`Disconnect ${provider}?`,confirmLabel:"Disconnect",danger:true});if(!confirmed)return;
  try{
    await apiJson(`/api/account/social/${provider}`,{method:"DELETE",headers:{"content-type":"application/json"}});
    renderSocialAccounts();
  }catch(e){notifyUser(e.message)}
}
function handleOAuthResult(){
  const q=new URLSearchParams(location.search);
  if(q.get("oauth_error")){
    const msg=q.get("oauth_error");
    setTimeout(()=>notifyUser(`Social sign-in was not completed: ${msg}`),50);
    history.replaceState({},document.title,location.pathname);
  }
  if(q.get("social_linked")==="1"){
    setTimeout(()=>{showView("accountsocial");renderSocialAccounts()},50);
    history.replaceState({},document.title,location.pathname);
  }
}


let pendingResetToken=null;
async function renderAccountSecurity(){
  const sl=document.getElementById("sessionList");if(!sl)return;
  try{
    const social=await apiJson("/api/account/social");
    const methods=(social.google.linked?1:0)+(social.facebook.linked?1:0);
    document.getElementById("securityMethods").textContent=methods+(methods===1?" linked":" linked");
    const data=await apiJson("/api/account/sessions");
    document.getElementById("activeSessionCount").textContent=data.items.length;
    sl.safeHTML=data.items.length?data.items.map((x,i)=>`<div class="item"><div class="between row"><b>Session ${i+1}${x.isCurrent?' · Current device':''}</b>${x.isCurrent?'<span class="badge ok">Current</span>':''}</div><div class="muted small">Created ${new Date(x.created_at).toLocaleString()} · last active ${x.last_seen_at?new Date(x.last_seen_at).toLocaleString():'not recorded'} · expires ${new Date(x.expires_at).toLocaleString()}</div><div class="actions" style="margin-top:8px"><button class="btn alt small" type="button" data-session-revoke="${escapeHtml(String(x.id||''))}">${x.isCurrent?'Sign out this device':'Sign out this session'}</button></div></div>`).join(""):'<div class="muted small">No active sessions found.</div>';
    sl.querySelectorAll('[data-session-revoke]').forEach(btn=>btn.addEventListener('click',()=>revokeAccountSession(btn.dataset.sessionRevoke)));
  }catch(e){sl.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function revokeAccountSession(sessionId){
  if(!/^[a-f0-9-]{32,36}$/i.test(String(sessionId||"")))return notifyUser("That session identifier is invalid.");
  const confirmed=await BW.dialog.confirm({title:"Sign out this session?",message:"This device will need to sign in again. Other active sessions will stay signed in.",confirmLabel:"Sign out session",danger:true});if(!confirmed)return;
  try{const r=await apiJson(`/api/account/sessions/${encodeURIComponent(sessionId)}`,{method:"DELETE"});if(r.current)return location.reload();await renderAccountSecurity();await renderSettingsHub();notifyUser("Session signed out.")}catch(e){notifyUser(e.message)}
}
async function signOutEverywhere(){
  const confirmed=await BW.dialog.confirm({title:"Sign out all devices?",message:"Sign out all sessions on all devices? You will need to sign in again.",confirmLabel:"Sign out all",danger:true});if(!confirmed)return;
  try{await apiJson("/api/account/sessions",{method:"DELETE"});location.reload()}catch(e){notifyUser(e.message)}
}
async function requestPasswordReset(){
  const email=(document.getElementById("recoveryEmail")?.value||"").trim();
  if(!email)return;
  try{
    const r=await apiJson("/api/auth/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
    notifyUser(r.message||"If the account exists, reset instructions have been sent.")
  }catch(e){notifyUser(e.message)}
}
async function completePasswordReset(){
  const password=document.getElementById("newResetPassword").value;
  if(!pendingResetToken||password.length<12){notifyUser("Use a password of at least 12 characters.");return}
  try{
    const r=await apiJson("/api/auth/password-reset/complete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:pendingResetToken,password})});
    notifyUser(r.message||"Password updated.");
    pendingResetToken=null;closeModal("passwordResetModal");
  }catch(e){notifyUser(e.message)}
}
function handleResetLink(){
  const raw=String(location.hash||"");
  if(!raw.startsWith("#reset_token="))return;
  const token=decodeURIComponent(raw.slice("#reset_token=".length));
  if(token){
    pendingResetToken=token;
    history.replaceState({},document.title,location.pathname+location.search);
    setTimeout(()=>openModal("passwordResetModal"),30);
  }
}


async function renderOnboardingBanner(){
  const el=document.getElementById("welcomeSetupBanner");if(!el)return;
  try{
    const r=await apiJson("/api/account/onboarding");
    const pendingFirst=r.complete&&currentWorkspaceRole()==="owner"&&state?.profile?.firstProtectionCheckStatus==="pending";
    if(!r.complete){el.style.display="block";el.safeHTML='<div class="between row"><div><b>Finish your 2-minute setup</b><div class="small">Add three business basics, then BW will generate your first protection check.</div></div><button class="btn soft" type="button" data-bw-onclick="openOnboarding()">Finish setup</button></div>'}
    else if(pendingFirst){el.style.display="block";el.safeHTML='<div class="between row"><div><b>Your business facts are saved</b><div class="small">The first protection check still needs to complete. No compliance conclusion has been assumed.</div></div><button class="btn soft" type="button" data-bw-onclick="runFirstProtectionCheck()">Run first check</button></div>'}
    else el.style.display="none";
  }catch{el.style.display="none"}
}
async function exportMyAccount(){
  try{
    const data=await apiJson("/api/account/export");
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bw-compliance-account-export.json";a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
    if(data?.exportMeta?.evidence?.truncated||data?.exportMeta?.audit?.truncated){
      notifyUser("Export downloaded. Very large evidence or audit history was capped; the JSON includes totals and limits for follow-up export.",{kind:"warning",timeout:7000});
    }
  }catch(e){notifyUser(e.message)}
}
async function requestAccountDeletion(){
  const confirmation=(document.getElementById("deleteAccountConfirmation")?.value||"").trim();
  if(confirmation!=="DELETE MY ACCOUNT"){notifyUser("Type DELETE MY ACCOUNT exactly.");return}
  const confirmed=await BW.dialog.confirm({title:"Submit account deletion request?",message:"Submit an account deletion request? This starts the protected deletion workflow.",confirmLabel:"Submit request",danger:true});if(!confirmed)return;
  try{
    const r=await apiJson("/api/account/deletion-request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmation,reason:"Customer requested account deletion"})});
    const input=document.getElementById("deleteAccountConfirmation");if(input)input.value="";
    await renderDeletionStatus();
    notifyUser(r.message||"Deletion request recorded.");
  }catch(e){notifyUser(e.message)}
}


async function renderDeletionStatus(){
  const box=document.getElementById("deletionStatusBox");if(!box)return;
  try{
    const r=await apiJson("/api/account/deletion-status");
    const latest=r.latest;
    box.safeHTML=`<div class="checkline"><span class="dot ${r.legalHold?"bad":"good"}"></span><div><b>${r.legalHold?"Legal hold active":"No active legal hold"}</b><div class="muted small">${r.legalHold?"Deletion cannot be approved or completed until the hold is released.":"Deletion requests move through requested → approved → completed states."}</div></div></div>`+
      (latest?`<div class="item"><b>Latest deletion request</b><div class="muted small">Status: ${escapeHtml(latest.status)} · ${new Date(latest.requested_at).toLocaleString()}</div>${latest.reason?`<div class="small">${escapeHtml(latest.reason)}</div>`:""}</div>`:"");
  }catch(e){box.textContent="Could not load deletion status."}
}


async function createAiCreditOrder(sku){
  if(currentWorkspaceRole()!=="owner"){notifyUser("Only the account owner can buy AI credit packs.");return}
  try{
    const r=await apiJson("/api/payments/ai-credit-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sku}),idempotencyKey:true});
    if(r.pack) console.info(`AI credit checkout: ${r.pack.credits} credits for P${r.pack.price_bwp}`);
    await renderPayments();
    await openHostedCheckout(r.paymentOrder.id);
  }catch(e){notifyUser(e.message)}
}
async function renderAiCredits(){
  const box=document.getElementById("aiCreditWalletBox");if(!box)return;
  try{
    const r=await apiJson("/api/ai/credits");
    const w=r.wallet||{},p=r.plan||{};
    document.getElementById("aiCreditBalance").textContent=Number(w.balance||0);
    document.getElementById("aiMonthlyAllowance").textContent=Number(w.monthly_allowance||0);
    document.getElementById("aiLifetimeUsed").textContent=Number(w.lifetime_used||0);
    document.getElementById("aiLowBalance").textContent=Number(w.balance||0)<25?"Yes":"No";
    box.safeHTML=`<div class="item"><b>${Number(w.balance||0)} credits available</b><div class="muted small">${escapeHtml(p.plan||"starter")} plan · ${Number(w.monthly_allowance||0)} monthly credits · ${Number(w.lifetime_purchased||0)} purchased lifetime</div></div>`;
    const packs=document.getElementById("aiCreditPacks"),canBuy=currentWorkspaceRole()==="owner";
    if(packs)packs.safeHTML=(r.packs||[]).map(x=>canBuy?`<button class="eventcard" data-bw-onclick="createAiCreditOrder('${escapeHtml(x.sku)}')"><b>${x.credits} credits</b><div class="muted small">P${x.price_bwp}</div></button>`:`<div class="eventcard"><b>${x.credits} credits</b><div class="muted small">P${x.price_bwp} · owner purchase only</div></div>`).join("");
    const hist=document.getElementById("aiCreditHistory");
    if(hist)hist.safeHTML=(r.ledger||[]).slice(0,12).map(x=>`<div class="item"><b>${escapeHtml(x.entry_type)}</b><div class="muted small">${x.credits>0?"+":""}${x.credits} credits${x.feature?` · ${escapeHtml(x.feature)}`:""} · ${new Date(x.occurred_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No activity yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

function setAiAdvisorPrompt(mode,question){
  const m=document.getElementById("aiAdvisorMode"),q=document.getElementById("aiAdvisorQuestion");if(m)m.value=mode;if(q){q.value=question;q.focus()}
}
function copilotNode(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=String(text);return el}
function copilotReferenceNode(ref){
  let el=copilotNode("span","copilot-ref",`${ref.ref} · ${ref.label||ref.type||"Workspace record"}`);
  if(ref.url){try{const u=new URL(ref.url);if(u.protocol==="https:"){el=copilotNode("a","copilot-ref",`${ref.ref} · ${ref.label||"Official source"}`);el.href=u.href;el.target="_blank";el.rel="noopener noreferrer"}}catch{}}
  return el;
}
function renderAiAdvisorResult(result){
  const output=document.getElementById("aiAdvisorOutput");if(!output)return;output.className="copilot-result";output.replaceChildren();
  const head=copilotNode("div","copilot-result-head"),title=copilotNode("div","",null),eyebrow=copilotNode("div","section-eyebrow",result.generationMode==="workers_ai"?"Workers AI · grounded workspace response":"Structured grounded fallback");
  title.append(eyebrow,copilotNode("h2","","Copilot response"));const confidence=copilotNode("span",`badge ${result.confidence==="high"?"good":result.confidence==="medium"?"info":"warn"}`,`${result.confidence||"low"} confidence`);head.append(title,confidence);output.append(head,copilotNode("div","copilot-answer",result.answer||"No grounded answer was returned."));
  const actions=Array.isArray(result.actions)?result.actions:[];if(actions.length){output.append(copilotNode("h3","","Suggested follow-up"));for(const action of actions){const box=copilotNode("div",`copilot-action ${action.priority||"medium"}`);box.append(copilotNode("b","",action.title),copilotNode("div","muted small",action.reason));if(action.sourceRefs?.length)box.append(copilotNode("div","source",`References: ${action.sourceRefs.join(", ")}`));output.append(box)}}
  const references=Array.isArray(result.references)?result.references:[];if(references.length){output.append(copilotNode("h3","","References"));const refs=copilotNode("div","copilot-ref-list");for(const ref of references)refs.append(copilotReferenceNode(ref));output.append(refs)}
  const caveats=Array.isArray(result.caveats)?result.caveats:[];if(caveats.length){const note=copilotNode("div","notice",null);note.append(copilotNode("b","","Boundaries"));const list=copilotNode("ul","small");for(const caveat of caveats)list.append(copilotNode("li","",caveat));note.append(list);output.append(note)}
}
function renderAiAdvisorStatus(message,isError=false){const output=document.getElementById("aiAdvisorOutput");if(!output)return;output.className=isError?"notice bad":"copilot-empty";output.replaceChildren(copilotNode("div","",message))}
async function askAiAdvisor(){
  if(currentWorkspaceRole()==="auditor"){renderAiAdvisorStatus("Auditor access is read-only and does not run AI workspace analysis.",true);return false}
  const question=String(document.getElementById("aiAdvisorQuestion")?.value||"").trim(),mode=document.getElementById("aiAdvisorMode")?.value||"ask",button=document.getElementById("aiAdvisorButton"),region=document.getElementById("aiAdvisorRegion"),output=document.getElementById("aiAdvisorOutput");
  if(question.length<3){renderAiAdvisorStatus("Enter a question of at least three characters.",true);return}
  if(button){button.disabled=true;button.textContent="Reviewing workspace…"}if(region)region.setAttribute("aria-busy","true");
  if(output){output.className="copilot-empty";output.replaceChildren();const thinking=copilotNode("div","copilot-thinking");thinking.setAttribute("role","status");thinking.append(copilotNode("span","","Building a grounded answer"),copilotNode("i"),copilotNode("i"),copilotNode("i"));output.append(thinking)}
  try{const result=await apiJson("/api/ai/advisor",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode,question})});renderAiAdvisorResult(result);await renderAiCredits()}
  catch(e){renderAiAdvisorStatus(e.status===402?"AI credits or the configured cost cap do not allow this run.":e.message||"The grounded answer could not be generated.",true)}
  finally{if(button){button.disabled=false;button.textContent="Ask Copilot"}if(region)region.setAttribute("aria-busy","false")}
}


async function renderAiCostControls(){
  const el=document.getElementById("aiMonthCredits");if(!el)return;
  try{
    const r=await apiJson("/api/ai/cost-control");
    const c=r.control||{},u=r.usage||{};
    document.getElementById("aiMonthCredits").textContent=Number(u.creditsUsed||0);
    document.getElementById("aiMonthCost").textContent=`P${Number(u.providerCostBwp||0).toFixed(2)}`;
    document.getElementById("aiCreditCap").textContent=c.monthly_credit_cap==null?"None":c.monthly_credit_cap;
    document.getElementById("aiCostCap").textContent=c.monthly_cost_cap_bwp==null?"None":`P${Number(c.monthly_cost_cap_bwp).toFixed(2)}`;
    document.getElementById("aiMonthlyCreditCapInput").value=c.monthly_credit_cap??"";
    document.getElementById("aiMonthlyCostCapInput").value=c.monthly_cost_cap_bwp??"";
    document.getElementById("aiLowBalanceInput").value=c.low_balance_threshold??25;
    const canEdit=currentWorkspaceRole()==="owner";
    ["aiMonthlyCreditCapInput","aiMonthlyCostCapInput","aiLowBalanceInput"].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=!canEdit});
    const saveButton=document.querySelector('#aicontrols button[data-bw-onclick="saveAiCostControls()"]');if(saveButton)saveButton.style.display=canEdit?"":"none";
  }catch(e){}
}
async function saveAiCostControls(){
  if(currentWorkspaceRole()!=="owner"){notifyUser("Only the account owner can change AI cost controls.");return false}
  const credit=document.getElementById("aiMonthlyCreditCapInput").value;
  const cost=document.getElementById("aiMonthlyCostCapInput").value;
  const low=document.getElementById("aiLowBalanceInput").value;
  try{
    await apiJson("/api/ai/cost-control",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
      monthlyCreditCap:credit===""?null:Number(credit),
      monthlyCostCapBwp:cost===""?null:Number(cost),
      lowBalanceThreshold:Number(low||25)
    })});
    await renderAiCostControls();notifyUser("AI cost controls saved.");
  }catch(e){notifyUser(e.message)}
}


async function createTender(){
  const title=(document.getElementById("newTenderTitle").value||"").trim();
  if(!title)return notifyUser("Enter a tender title.");
  try{
    await apiJson("/api/tenders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      title,issuer:document.getElementById("newTenderIssuer").value,
      closingAt:document.getElementById("newTenderClosing").value||null
    })});
    document.getElementById("newTenderTitle").value="";
    await renderTenderReady();
  }catch(e){notifyUser(e.message)}
}
async function renderTenderReady(){
  const list=document.getElementById("tenderList");if(!list)return;
  try{
    const r=await apiJson("/api/tenders");
    const items=r.items||[];
    document.getElementById("trackedTenderCount").textContent=items.length;
    const soon=items.filter(x=>x.closing_at&&((new Date(x.closing_at)-new Date())/86400000)<=14&&new Date(x.closing_at)>new Date()).length;
    document.getElementById("tenderClosingSoon").textContent=soon;
    document.getElementById("tenderReadinessScore").textContent=items.length?"Track":"—";
    list.safeHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.issuer||"")} ${x.closing_at?`· closes ${new Date(x.closing_at).toLocaleDateString()}`:""} · ${escapeHtml(x.status||"watching")}</div></div>`).join("")||'<div class="muted small">No tenders yet.</div>';
  }catch(e){list.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderEmployeesForHr(){
  const sel=document.getElementById("hrCaseEmployee");if(!sel)return;
  try{
    const r=await apiJson("/api/employees");
    const items=(r.items||[]).filter(x=>String(x.status||"").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(x.id)));
    document.getElementById("employeeCount").textContent=items.length;
    sel.safeHTML='<option value="">General / not assigned</option>'+items.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.full_name)}</option>`).join("");
  }catch{}
}
async function createHrCase(){
  try{
    await apiJson("/api/hr/cases",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      employeeId:document.getElementById("hrCaseEmployee").value||null,
      caseType:document.getElementById("hrCaseType").value,
      riskLevel:document.getElementById("hrCaseRisk").value,
      summary:document.getElementById("hrCaseSummary").value
    })});
    document.getElementById("hrCaseSummary").value="";
    await renderHrCases();
  }catch(e){notifyUser(e.message)}
}
async function advanceHrCase(id,status){
  try{
    await apiJson(`/api/hr/cases/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    await renderHrCases();
  }catch(e){notifyUser(e.message)}
}
async function renderHrCases(){
  const list=document.getElementById("hrCaseList");if(!list)return;
  try{
    const [r,evidence]=await Promise.all([apiJson("/api/hr/cases"),apiJson("/api/evidence/integrity")]);
    const items=r.items||[];
    document.getElementById("openHrCases").textContent=items.filter(x=>x.status!=="closed").length;
    document.getElementById("highRiskHrCases").textContent=items.filter(x=>["high","critical"].includes(x.risk_level)).length;
    document.getElementById("reviewHrCases").textContent=items.filter(x=>Number(x.professional_review_required)===1&&x.status!=="closed").length;
    list.safeHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.case_type)}</b><div class="muted small">${escapeHtml(x.risk_level)} risk · ${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.summary||"")}</div></div><div>${x.status==="open"?`<button class="btn alt" data-bw-onclick="advanceHrCase('${x.id}','evidence')">Evidence</button>`:""}${x.status==="evidence"?`<button class="btn alt" data-bw-onclick="advanceHrCase('${x.id}','review')">Review</button>`:""}${x.status==="review"?`<button class="btn soft" data-bw-onclick="showView('workhub');setTimeout(focusManagementReviewInbox,120)">Review inbox</button>`:""}${x.status==="approved"?`<button class="btn" data-bw-onclick="advanceHrCase('${x.id}','closed')">Close</button>`:""}<button class="btn alt" data-bw-onclick="createEmploymentDefensePack('${x.id}')">Defense Pack</button></div></div></div>`).join("")||'<div class="muted small">No HR cases yet.</div>';
    const caseSelect=document.getElementById("defenseCaseSelect"),evidenceSelect=document.getElementById("defenseEvidenceSelect");
    if(caseSelect)caseSelect.safeHTML=items.filter(x=>x.status!=="closed").map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.case_type)} · ${escapeHtml(x.risk_level)} · ${escapeHtml(x.status)}</option>`).join("");
    if(evidenceSelect)evidenceSelect.safeHTML=(evidence.items||[]).filter(x=>x.review_status==="approved").map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name||x.id)}</option>`).join("");
  }catch(e){list.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function createCompanyAction(){
  try{
    await apiJson("/api/company-actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      actionType:document.getElementById("companyActionType").value,
      dueAt:document.getElementById("companyActionDue").value||null
    })});
    await renderCompanyActions();await renderUnifiedNextActions();
  }catch(e){notifyUser(e.message)}
}
async function advanceCompanyAction(id,status){
  try{
    await apiJson(`/api/company-actions/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    await renderCompanyActions();await renderUnifiedNextActions();
  }catch(e){notifyUser(e.message)}
}
async function renderCompanyActions(){
  const list=document.getElementById("companyActionList");if(!list)return;
  try{
    const r=await apiJson("/api/company-actions");const items=r.items||[];
    document.getElementById("companyOpenActions").textContent=items.filter(x=>x.status!=="completed").length;
    document.getElementById("companyReviewActions").textContent=items.filter(x=>x.status==="review").length;
    document.getElementById("companyBlockedActions").textContent=items.filter(x=>x.status==="blocked").length;
    const soon=items.filter(x=>x.due_at&&new Date(x.due_at)>new Date()&&new Date(x.due_at)-new Date()<30*86400000).length;
    document.getElementById("companyDueSoon").textContent=soon;
    list.safeHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.action_type)}</b><div class="muted small">${escapeHtml(x.status)}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}</div></div><div>${x.status==="draft"?`<button class="btn alt" data-bw-onclick="advanceCompanyAction('${x.id}','ready')">Ready</button>`:""}${x.status==="ready"?`<button class="btn alt" data-bw-onclick="advanceCompanyAction('${x.id}','review')">Review</button>`:""}${x.status==="review"?`<button class="btn soft" data-bw-onclick="showView('workhub');setTimeout(focusManagementReviewInbox,120)">Review inbox</button>`:""}${x.status==="approved"?`<button class="btn" data-bw-onclick="advanceCompanyAction('${x.id}','completed')">Complete</button>`:""}</div></div></div>`).join("")||'<div class="muted small">No actions yet.</div>';
  }catch(e){list.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
function openLicenceEntry(){const d=document.getElementById("licenceEntryDetails");if(d)d.open=true;setTimeout(()=>document.getElementById("newLicenceType")?.focus(),40)}
async function createLicence(){
  if(!["owner","manager"].includes(currentWorkspaceRole())){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Your role cannot add licences.";return false}
  const type=(document.getElementById("newLicenceType").value||"").trim();if(!type)return notifyUser("Enter a licence or registration type.");
  const issuedRaw=document.getElementById("newLicenceIssued").value||"",renewalRaw=document.getElementById("newLicenceRenewal").value||"",issuedAt=issuedRaw?licenceDateOnly(issuedRaw):"",renewalDueAt=renewalRaw?licenceDateOnly(renewalRaw):"";
  if(issuedRaw&&!issuedAt)return notifyUser("Enter a real issued date.");if(renewalRaw&&!renewalDueAt)return notifyUser("Enter a real renewal / annual-fee date.");if(issuedAt&&renewalDueAt&&renewalDueAt<issuedAt)return notifyUser("The next renewal / annual-fee date cannot be before the issued date.");
  try{
    await apiJson("/api/licences",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      licenceType:type,authority:document.getElementById("newLicenceAuthority").value,
      issuedAt:issuedAt||null,
      renewalDueAt:renewalDueAt||null
    })});
    ["newLicenceType","newLicenceAuthority","newLicenceIssued","newLicenceRenewal"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
    const status=document.getElementById("licenceSaveStatus");if(status)status.textContent="Added to the licence register.";
    await renderLicences();await renderUnifiedNextActions();return true;
  }catch(e){notifyUser(e.message);return false}
}
async function renewLicence(id,currentDue=""){
  if(!["owner","manager"].includes(currentWorkspaceRole()))return false;
  const next=await BW.dialog.prompt({title:"Next renewal due date",message:"Enter the next authority-confirmed renewal / annual-fee due date.",defaultValue:String(currentDue||"").slice(0,10),type:"date",required:true,maxLength:10,confirmLabel:"Save due date"});if(next===null)return false;
  const value=licenceDateOnly(String(next||"").trim());if(!value){notifyUser("Enter a real calendar date as YYYY-MM-DD.");return false}
  const prior=licenceDateOnly(currentDue);if(prior&&value<=prior){notifyUser("Enter a next renewal / annual-fee date after the currently recorded date.");return false}
  try{await apiJson(`/api/licences/${encodeURIComponent(id)}/renew`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({renewalDueAt:value})});await renderLicences();await renderUnifiedNextActions();return true}catch(e){notifyUser(e.message);return false}
}
function licenceDateOnly(value){const v=String(value||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return "";const [y,m,d]=v.split("-").map(Number),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?v:""}
function licenceDateState(value){
 const dateOnly=licenceDateOnly(value);if(!dateOnly)return {days:null,label:"Date needed",kind:"warn"};const t=new Date(dateOnly+"T23:59:59+02:00").getTime();if(!Number.isFinite(t))return {days:null,label:"Date needs review",kind:"warn"};const days=Math.ceil((t-Date.now())/86400000);if(days<0)return {days,label:"Past due",kind:"bad"};if(days<=30)return {days,label:`Due in ${days} day${days===1?"":"s"}`,kind:"warn"};return {days,label:`Due ${new Date(t).toLocaleDateString()}`,kind:"good"};
}
async function renderLicences(){
  const list=document.getElementById("licenceList");if(!list)return;
  try{
    const r=await apiJson("/api/licences"),items=r.items||[],states=items.map(x=>({x,s:licenceDateState(x.renewal_due_at)}));
    const active=items.filter(x=>x.status==="active").length,due=states.filter(({s})=>s.days!==null&&s.days>=0&&s.days<=30).length,risk=states.filter(({x,s})=>x.status!=="active"||(s.days!==null&&s.days<0)).length,missing=states.filter(({s})=>s.days===null).length;
    document.getElementById("activeLicenceCount").textContent=active;document.getElementById("licenceRenewalsDue").textContent=due;document.getElementById("licenceAtRisk").textContent=risk;
    let title="Licence register is up to date",detail="Keep authority-confirmed dates and evidence current.",actions=`<button class="btn alt" type="button" data-bw-onclick="openLicenceEntry()">Add licence</button>`;
    const atRisk=states.filter(({x,s})=>x.status!=="active"||(s.days!==null&&s.days<0)).sort((a,b)=>(a.s.days??9999)-(b.s.days??9999));
    const dueSoon=states.filter(({s})=>s.days!==null&&s.days>=0&&s.days<=30).sort((a,b)=>a.s.days-b.s.days);
    if(atRisk.length){const {x,s}=atRisk[0];title=`Resolve ${x.licence_type}`;detail=s.days!==null&&s.days<0?`The recorded renewal / annual-fee date is ${Math.abs(s.days)} day(s) past due. Confirm status with ${x.authority||"the issuing authority"} before relying on this record.`:`The recorded status is ${x.status||"not active"}. Confirm the authority position.`;actions=`<button class="btn" type="button" data-bw-onclick="renewLicence('${safeId(x.id)}','${licenceDateOnly(x.renewal_due_at)}')">Record renewal / next date</button>`}
    else if(dueSoon.length){const {x,s}=dueSoon[0];title=`Prepare ${x.licence_type}`;detail=`The next recorded renewal / annual-fee date is in ${s.days} day(s). Prepare the authority requirements and evidence before the date.`;actions=`<button class="btn" type="button" data-bw-onclick="renewLicence('${safeId(x.id)}','${licenceDateOnly(x.renewal_due_at)}')">Record completed renewal</button>`}
    else if(missing){const x=states.find(({s})=>s.days===null).x;title=`Add the next date for ${x.licence_type}`;detail="The licence is recorded, but the next authority-confirmed renewal or annual-fee date is missing.";actions=`<button class="btn" type="button" data-bw-onclick="renewLicence('${safeId(x.id)}','')">Add next date</button>`}
    else if(!items.length&&state.profile?.trade){title="Record the licence that applies";detail="Business details says a trade licence or registration is tracked, but the register is empty.";actions=`<button class="btn" type="button" data-bw-onclick="openLicenceEntry()">Add first licence</button>`}
    else if(!items.length&&confirmedStatus(state.profile,"trade")==="unknown"){title="Confirm your licence status";detail="No licence is recorded and the business licence/registration status is not confirmed. BW will not infer legal applicability from industry alone.";actions=`<button class="btn" type="button" data-bw-onclick="showView('profile')">Confirm status</button>`}
    else if(!items.length){title="No licence currently tracked";detail="Business details records the licence/registration status as confirmed none currently tracked. Update it if the official position changes.";actions=`<button class="btn alt" type="button" data-bw-onclick="showView('profile')">Review Business details</button>`}
    document.getElementById("licenceNextTitle").textContent=title;document.getElementById("licenceNextDetail").textContent=detail;document.getElementById("licenceNextActions").safeHTML=actions;
    list.safeHTML=states.map(({x,s})=>{const dueDate=licenceDateOnly(x.renewal_due_at);return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.licence_type)}</b><div class="muted small">${escapeHtml(x.authority||"Authority not recorded")}${dueDate?` · next date ${new Date(dueDate+"T12:00:00+02:00").toLocaleDateString()}`:" · next date not recorded"}</div></div><div class="licence-state"><span class="badge ${s.kind}">${escapeHtml(s.label)}</span><button class="btn alt" type="button" data-bw-onclick="renewLicence('${safeId(x.id)}','${dueDate}')">Record renewal</button></div></div></div>`}).join("")||'<div class="profile-empty">No licences recorded yet. Add one only when the business has an authority-issued licence, registration or annual-fee obligation to track.</div>';
  }catch(e){list.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
const HOME_ACTION_META={
  hr:{target:"employer",label:"Open case"},tender:{target:"tender",label:"Open tender"},company:{target:"companysecretary",label:"Open company action"},licence:{target:"licenceos",label:"Open licence"},regulatory:{target:"obligations",label:"Review obligation"},risk:{target:"protectionengine",label:"Review risk"}
};
let homeFirstActionTarget="workhub";
function homeActionMeta(source){return HOME_ACTION_META[String(source||"")]||{target:"workhub",label:"Open work"}}
function openHomeFirstAction(){return showView(homeFirstActionTarget||"workhub")}
function homeDueTimestamp(value){const t=Date.parse(String(value||""));return Number.isFinite(t)?t:null}
function homeDueLabel(value){const t=homeDueTimestamp(value);return t==null?"":new Date(t).toLocaleDateString(undefined,{month:"short",day:"numeric"})}
async function renderUnifiedNextActions(){
  const box=document.getElementById("unifiedNextActions");if(!box)return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  try{
    const r=await apiJson("/api/next-actions"),items=r.items||[],now=Date.now(),high=items.filter(x=>Number(x.priority)===1),dueSoon=items.filter(x=>{const t=homeDueTimestamp(x.dueAt);return t!==null&&t>=now&&t-now<=30*86400000});
    set("homeActionCount",items.length);set("homeHighPriorityCount",high.length);homeFirstActionTarget=items.length?homeActionMeta(items[0].source).target:"workhub";
    const top=items.slice(0,5);
    box.safeHTML=top.length?top.map(x=>{const meta=homeActionMeta(x.source),due=homeDueLabel(x.dueAt),priority=Number(x.priority)===1?"High":Number(x.priority)===2?"Normal":"Low",proofMissing=Number(x.proofMissing||0),proofDirect=x.source==="regulatory"&&proofMissing>0;return `<div class="home-action-row"><div class="home-action-copy"><b>${escapeHtml(x.title)}</b><div class="home-action-meta"><span>${escapeHtml(priority)} priority</span><span>${escapeHtml(x.status||"Open")}</span>${due?`<span>Due ${escapeHtml(due)}</span>`:""}${proofDirect?`<span class="home-proof-flag">${proofMissing} proof gap${proofMissing===1?"":"s"}</span>`:""}</div></div><div class="home-action-actions">${x.source==="regulatory"?`<button class="btn" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">${proofDirect?"Add proof":"Work action"}</button>`:""}<button class="btn ${Number(x.priority)===1&&!proofDirect?"":"soft"}" type="button" data-bw-onclick="showView('${meta.target}')">${escapeHtml(meta.label)}</button></div></div>`}).join(""):'<div class="home-action-empty"><b>No open cross-product action is currently returned.</b><div class="small" style="margin-top:3px">Keep upcoming deadlines and source changes under review; an empty queue is not a legal all-clear.</div></div>';
    const label=document.getElementById("homeDecisionTitle");if(label)label.textContent=high.length?`${high.length} high-priority item${high.length===1?"":"s"} need attention`:items.length?`${items.length} open item${items.length===1?"":"s"} to work through`:"No open action in the current queue";
    const dueHint=document.getElementById("homeActionDueHint");if(dueHint)dueHint.textContent=dueSoon.length?`${dueSoon.length} due within 30 days`:"No queued item due within 30 days";
  }catch(e){set("homeActionCount","—");set("homeHighPriorityCount","—");homeFirstActionTarget="workhub";box.safeHTML=`<div class="notice bad"><b>Action status unavailable</b><div class="small">The unified queue could not be confirmed. Do not treat an empty dashboard as all clear. Open Work & deadlines before relying on the Home summary.</div><button class="btn alt" style="margin-top:8px" data-bw-onclick="renderUnifiedNextActions()">Retry</button></div>`}
}
async function renderHomeDecisionSignals(){
  if(!roleCanView("dashboard"))return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  const date=typeof browserGaboroneDate==="function"?browserGaboroneDate():new Date().toISOString().slice(0,10);
  const [calendar,ops,proof]=await Promise.allSettled([apiJson("/api/statutory-calendar"),apiJson(`/api/daily-reporting/dashboard?date=${encodeURIComponent(date)}`),apiJson("/api/evidence-health")]);
  if(calendar.status==="fulfilled"){
    const now=Date.now(),rows=(calendar.value.obligations||[]).map(x=>({x,t:homeDueTimestamp(x.due_at)})).filter(y=>y.t!==null&&y.t>=now).sort((a,b)=>a.t-b.t),next=rows[0];set("homeNextDeadline",next?homeDueLabel(next.x.due_at):"None set");
  }else set("homeNextDeadline","Unavailable");
  if(ops.status==="fulfilled"){
    const d=ops.value||{},coverage=Number(d.coverage),missing=(d.missing||[]).length,attention=Number(d.totals?.attention||0),locations=Number(d.locationsReporting||0),coverageText=Number.isFinite(coverage)?`${Math.round(coverage)}%`:"—";set("homeOpsCoverage",coverageText);set("homeOpsCardValue",coverageText);set("homeOpsDetail",`${locations} location${locations===1?"":"s"} reported${missing?` · ${missing} expected report${missing===1?"":"s"} missing`:" · no expected report currently missing"}${attention?` · ${attention} management flag${attention===1?"":"s"}`:""}.`);
  }else{set("homeOpsCoverage","Unavailable");set("homeOpsCardValue","—");set("homeOpsDetail","Daily reporting status could not be confirmed. Open Daily reports before acting on operational performance.")}
  if(proof.status==="fulfilled"){
    const e=proof.value||{},score=Number(e.healthScore),missing=Number(e.missingRequired||0),expired=Number(e.expired||0),expiring=Number(e.expiring||0),quarantined=Number(e.quarantined||0);set("homeProofHealth",Number.isFinite(score)?`${Math.max(0,Math.min(100,Math.round(score)))}%`:"Not established");const issues=missing+expired+expiring+quarantined;set("homeProofDetail",issues?`${missing} required missing · ${expired} expired · ${expiring} expiring · ${quarantined} awaiting clean approval.`:"No current evidence-health issue is returned by the server snapshot.");
  }else{set("homeProofHealth","Unavailable");set("homeProofDetail","Evidence health could not be confirmed or is not available on this plan. Open Documents & proof for the underlying records.")}
}


function homeMoneyMinor(value){
  const n=Number(value);if(!Number.isFinite(n))return "—";
  const amount=n/100,whole=Math.abs(amount-Math.round(amount))<0.00001;
  return `P${amount.toLocaleString("en-BW",{minimumFractionDigits:whole?0:2,maximumFractionDigits:2})}`;
}
function ownerGreetingText(){
  try{const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Gaborone",hour:"2-digit",hourCycle:"h23"}).format(new Date()));return `${hour<12?"Good morning":hour<18?"Good afternoon":"Good evening"}. Here’s your business today.`}catch{return "Here’s your business today."}
}
function ownerBriefUpdatedLabel(value){
  try{const d=value?new Date(value):new Date();return `Updated ${new Intl.DateTimeFormat("en-BW",{timeZone:"Africa/Gaborone",hour:"2-digit",minute:"2-digit"}).format(d)}`}catch{return "Updated now"}
}
let ownerBriefLastGoodAt=null;
function setOwnerBriefNotice(message=""){
  const el=document.getElementById("ownerBriefNotice");if(!el)return;
  const text=String(message||"").trim();el.textContent=text;el.style.display=text?"block":"none";
}
function openThebeFromHome(question="",run=false){
  if(!roleCanView("aiservices"))return false;
  const source=document.getElementById("homeThebeQuestion"),prompt=String(question||source?.value||"").trim().slice(0,1000);
  const opened=showView("aiservices");if(!opened)return false;
  requestAnimationFrame(()=>{
    const mode=document.getElementById("aiAdvisorMode"),target=document.getElementById("aiAdvisorQuestion");
    if(mode)mode.value="ask";
    if(target){if(prompt)target.value=prompt;target.focus()}
    if(run&&prompt.length>=3&&typeof askAiAdvisor==="function")void askAiAdvisor();
  });
  return true;
}
function askThebeFromHome(question=""){
  const source=document.getElementById("homeThebeQuestion"),prompt=String(question||source?.value||"").trim().slice(0,1000);
  if(prompt.length<3){source?.focus();const sr=document.getElementById("srStatus");if(sr)sr.textContent="Enter a question for Thebe.";return false}
  return openThebeFromHome(prompt,true);
}

async function renderDailyOperatingBrief(){
  if(!roleCanView("dashboard")||!["owner","manager"].includes(currentWorkspaceRole()))return;
  const box=document.getElementById("unifiedNextActions"),changesBox=document.getElementById("homeChangesList");if(!box||!changesBox)return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  const renderAction=x=>{const meta=homeActionMeta(x.source),due=homeDueLabel(x.dueAt),priority=Number(x.priority)===1?"High":Number(x.priority)===2?"Normal":"Low",proofMissing=Number(x.proofMissing||0),proofDirect=x.source==="regulatory"&&proofMissing>0;return `<div class="home-action-row"><div class="home-action-copy"><b>${escapeHtml(x.title)}</b><div class="home-action-meta"><span>${escapeHtml(priority)} priority</span><span>${escapeHtml(x.status||"Open")}</span>${due?`<span>Due ${escapeHtml(due)}</span>`:""}${proofDirect?`<span class="home-proof-flag">${proofMissing} proof gap${proofMissing===1?"":"s"}</span>`:""}</div></div><div class="home-action-actions">${x.source==="regulatory"?`<button class="btn" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">${proofDirect?"Add proof":"Work action"}</button>`:""}<button class="btn ${Number(x.priority)===1&&!proofDirect?"":"soft"}" type="button" data-bw-onclick="showView('${meta.target}')">${escapeHtml(meta.label)}</button></div></div>`};
  try{
    const [dailyR,financeR,employeesR]=await Promise.allSettled([
      apiJson("/api/daily-brief"),
      apiJson("/api/finance/summary"),
      apiJson("/api/employees")
    ]);
    if(dailyR.status!=="fulfilled")throw dailyR.reason||new Error("daily_brief_unavailable");
    const d=dailyR.value||{},status=d.status||{},actions=(d.topActions||[]).slice(0,3),changes=(d.changes||[]).slice(0,6),reviews=d.reviews||{},ops=d.operations||{},e=d.evidenceHealth||{};
    const urgent=Number(status.urgent||0),reviewTotal=Number(reviews.total||status.waitingReview||0),openWork=Number(status.openWork||0);
    set("ownerGreeting",ownerGreetingText());set("ownerBriefFreshness",`${ownerBriefUpdatedLabel(d.generatedAt)} · ${Number(d.windowHours||24)}h operating window`);
    set("homeActionCount",openWork);set("homeHighPriorityCount",urgent);set("homeReviewCount",reviewTotal);set("homeChangesCount",Number(status.changes??changes.length));set("homeChangesBadge",`${Number(d.windowHours||24)}h`);
    set("homeNextDeadline",status.nextDeadline?homeDueLabel(status.nextDeadline):"None set");
    set("homeComplianceDetail",status.nextDeadline?"Next tracked deadline · open Calendar for the source record":"No future tracked deadline is currently returned; this is not a compliance all-clear.");
    const coverage=Number(ops.coverage??status.reportingCoverage),coverageText=Number.isFinite(coverage)?`${Math.round(coverage)}%`:"—";set("homeOpsCoverage",coverageText);set("homeOpsCardValue",coverageText);
    const missing=Number(ops.missing||0),attention=Number(ops.attention||0),incidents=Number(ops.incidents||0),locations=Number(ops.locationsReporting||0);set("homeOpsDetail",`${locations} location${locations===1?"":"s"} reported${missing?` · ${missing} expected report${missing===1?"":"s"} missing`:" · no expected report currently missing"}${attention?` · ${attention} manager-attention flag${attention===1?"":"s"}`:""}${incidents?` · ${incidents} incident flag${incidents===1?"":"s"}`:""}. Missing reports are not proof of absence or poor performance.`);
    const reviewParts=[];if(Number(reviews.obligations||0))reviewParts.push(`${reviews.obligations} compliance`);if(Number(reviews.company||0))reviewParts.push(`${reviews.company} company`);if(Number(reviews.hr||0))reviewParts.push(`${reviews.hr} HR`);if(Number(reviews.tenders||0))reviewParts.push(`${reviews.tenders} tender`);set("homeReviewCardValue",reviewTotal);set("homeReviewDetail",reviewParts.length?`${reviewParts.join(" · ")} item${reviewTotal===1?"":"s"} waiting for a recorded review decision.`:"No workflow is currently returned at a review stage.");
    set("homeAttentionDetail",`${urgent} urgent · ${reviewTotal} waiting review`);
    const score=Number(e.healthScore),proofIssues=Number(e.missingRequired||0)+Number(e.expired||0)+Number(e.expiring||0)+Number(e.quarantined||0);set("homeProofHealth",Number.isFinite(score)?`${Math.max(0,Math.min(100,Math.round(score)))}%`:"Not established");set("homeProofDetail",proofIssues?`${Number(e.missingRequired||0)} required missing · ${Number(e.expired||0)} expired · ${Number(e.expiring||0)} expiring · ${Number(e.quarantined||0)} awaiting clean approval.`:"No current evidence-health issue is returned by the server snapshot.");

    if(financeR.status==="fulfilled"){
      const f=financeR.value||{},receivables=f.receivables||{},accounts=Array.isArray(f.accounts)?f.accounts:[],recon=f.reconciliation||{};
      set("homeCashPosition",homeMoneyMinor(f.cashPositionMinor));
      set("homeCashDetail",`Canonical Finance Core · ${accounts.length} active account${accounts.length===1?"":"s"}${Number(recon.unresolvedCount||0)?` · ${Number(recon.unresolvedCount)} reconciliation exception${Number(recon.unresolvedCount)===1?"":"s"}`:""}`);
      set("homeMoneyOwed",homeMoneyMinor(receivables.outstandingMinor));
      set("homeReceivablesDetail",`${Number(receivables.outstandingInvoiceCount||0)} outstanding invoice${Number(receivables.outstandingInvoiceCount||0)===1?"":"s"} · ${Number(receivables.overdueInvoiceCount||0)} overdue`);
    }else{
      set("homeCashPosition","Unavailable");set("homeCashDetail","Finance Core could not be confirmed. Open Thebe Finance before relying on a cash figure.");set("homeMoneyOwed","Unavailable");set("homeReceivablesDetail","Receivables could not be confirmed from the canonical invoice ledger.");
    }

    if(employeesR.status==="fulfilled"){
      const rows=Array.isArray(employeesR.value?.items)?employeesR.value.items:[],active=rows.filter(x=>String(x.status||"active").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(x.id)));
      set("homeEmployeeCount",active.length);set("homeEmployeeDetail",`${active.length} active employee${active.length===1?"":"s"} · ${coverageText} reporting today`);
    }else{
      set("homeEmployeeCount","Unavailable");set("homeEmployeeDetail",`Employee register unavailable · ${coverageText} reporting coverage`);
    }

    const partial=financeR.status!=="fulfilled"||employeesR.status!=="fulfilled";set("ownerBriefStatus",partial?"Thebe Brief · partial":"Thebe Brief · live");
    setOwnerBriefNotice(partial?"Some live sources could not be confirmed. Cards marked Unavailable are not zero balances or all-clear signals.":"");
    homeFirstActionTarget=actions.length?homeActionMeta(actions[0].source).target:"workhub";
    box.safeHTML=actions.length?actions.map(renderAction).join(""):'<div class="home-action-empty"><b>No action is currently returned for today.</b><div class="small" style="margin-top:3px">Keep deadlines and source changes under review. This is not a legal all-clear.</div></div>';
    changesBox.safeHTML=changes.length?changes.map(x=>`<div class="daily-change-item ${escapeHtml(String(x.severity||"info").toLowerCase())}"><span class="daily-change-dot" aria-hidden="true"></span><div class="daily-change-copy"><b>${escapeHtml(x.title||"Workspace change")}</b><small>${escapeHtml(x.kind==="operations"?"Operations signal":x.kind==="completed"?"Completed work":"Business / protection change")}</small></div></div>`).join(""):'<div class="muted small">No material system, operating or completion change is recorded in the last 24 hours.</div>';
    const title=document.getElementById("homeDecisionTitle");if(title)title.textContent=urgent?`${urgent} urgent item${urgent===1?"":"s"} to handle today`:reviewTotal?`${reviewTotal} item${reviewTotal===1?" is":"s are"} waiting for review`:"What needs your attention today";
    ownerBriefLastGoodAt=d.generatedAt||new Date().toISOString();
  }catch(e){
    if(ownerBriefLastGoodAt){
      set("ownerGreeting",ownerGreetingText());set("ownerBriefFreshness",`${ownerBriefUpdatedLabel(ownerBriefLastGoodAt)} · last confirmed; refresh failed`);set("ownerBriefStatus","Thebe Brief · stale");
      setOwnerBriefNotice("Refresh failed. The last confirmed operating brief remains visible. Verify source records before acting on time-sensitive figures, deadlines or queues.");
      return;
    }
    ["homeActionCount","homeHighPriorityCount","homeReviewCount","homeChangesCount","homeNextDeadline","homeOpsCoverage","homeOpsCardValue","homeReviewCardValue","homeProofHealth","homeCashPosition","homeMoneyOwed","homeEmployeeCount"].forEach(id=>set(id,"Unavailable"));homeFirstActionTarget="workhub";
    set("ownerGreeting",ownerGreetingText());set("ownerBriefFreshness","Live business brief unavailable");set("ownerBriefStatus","Thebe Brief · unavailable");setOwnerBriefNotice("No confirmed operating brief is available yet. Retry or open the source workspaces before making a time-sensitive decision.");set("homeCashDetail","Finance status could not be confirmed.");set("homeReceivablesDetail","Receivables status could not be confirmed.");set("homeEmployeeDetail","Employee status could not be confirmed.");set("homeComplianceDetail","Deadline status could not be confirmed.");set("homeAttentionDetail","Open Work & deadlines to verify current items.");
    box.safeHTML='<div class="notice bad"><b>Daily operating brief unavailable</b><div class="small">The server-backed brief could not be confirmed. Do not interpret missing cards or an empty queue as all clear. Open Work & deadlines and Daily reports before acting.</div><button class="btn alt" style="margin-top:8px" data-bw-onclick="renderDailyOperatingBrief()">Retry brief</button></div>';
    changesBox.safeHTML='<div class="notice bad small">Recent changes could not be confirmed.</div>';set("homeOpsDetail","Daily reporting could not be confirmed. Review source reports before making an operational or employment decision.");set("homeReviewDetail","Review status could not be confirmed. Open Work & deadlines before relying on this summary.");set("homeProofDetail","Evidence health could not be confirmed. Open Documents & proof for the underlying records.");
  }
}


async function renderPartnerPortal(){
  const clients=document.getElementById("partnerClientList");if(!clients)return;
  try{
    const [c,t]=await Promise.all([apiJson("/api/partner/clients"),apiJson("/api/partner/tasks")]);
    const ci=c.items||[],ti=t.items||[];
    document.getElementById("partnerClientCount").textContent=ci.length;
    document.getElementById("partnerOpenTasks").textContent=ti.filter(x=>x.status!=="done").length;
    document.getElementById("partnerHighPriority").textContent=ti.filter(x=>x.status!=="done"&&Number(x.priority)===1).length;
    document.getElementById("partnerOverdue").textContent=ti.filter(x=>x.status!=="done"&&x.due_at&&new Date(x.due_at)<new Date()).length;
    clients.safeHTML=ci.map(x=>`<div class="item"><b>${escapeHtml(x.client_tenant_id)}</b><div class="muted small">${escapeHtml(x.relationship_type)} · ${escapeHtml(x.status)}</div></div>`).join("")||'<div class="muted small">No linked clients yet.</div>';
    document.getElementById("partnerTaskList").safeHTML=ti.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">Priority ${x.priority} · ${escapeHtml(x.status)}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No partner tasks.</div>';
  }catch(e){}
}
async function renderPassport(){
  const list=document.getElementById("passportControlList");if(!list)return;
  try{
    const r=await apiJson("/api/passport"),shares=r.shares||[],canManageShares=r.shareManagementAllowed===true&&["owner","manager"].includes(currentWorkspaceRole());
    const sharingCard=document.getElementById("passportSharingCard"),readOnlyNote=document.getElementById("passportReadOnlyNote");if(sharingCard)sharingCard.style.display=canManageShares?"":"none";if(readOnlyNote)readOnlyNote.style.display=canManageShares?"none":"";
    document.getElementById("passportScore").textContent=`${r.score.score}%`;
    document.getElementById("passportVerified").textContent=r.score.verified;
    document.getElementById("passportTotal").textContent=r.score.total;
    document.getElementById("passportShares").textContent=Number(r.activeShareCount||0);
    list.safeHTML=(r.controls||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.control_key)}</b><div class="muted small">${escapeHtml(x.status)}${x.expires_at?` · review/expiry ${new Date(x.expires_at).toLocaleDateString()}`:""}</div></div>${canManageShares?`<label class="small"><input class="passportControlSelect" type="checkbox" value="${escapeHtml(x.control_key)}" ${x.status==="verified"?"checked":""}> Share</label>`:""}</div></div>`).join("")||'<div class="muted small">No Passport controls yet. Refresh controls from the Control Center first.</div>';
    if(!canManageShares)return;
    document.getElementById("passportShareList").safeHTML=shares.map(x=>{
      const status=x.revoked_at?"Revoked":x.invalidated_at?"Reissue required":(x.expires_at&&new Date(x.expires_at)<new Date()?"Expired":"Active");
      return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.label||"Passport share")}</b><div class="muted small">${escapeHtml(status)} · revision ${x.issued_revision??0}${x.expires_at?` · expires ${new Date(x.expires_at).toLocaleDateString()}`:""}</div>${x.invalidation_reason?`<div class="small">Reason: ${escapeHtml(x.invalidation_reason)}</div>`:""}</div>${!x.revoked_at&&!x.invalidated_at?`<button class="btn alt" data-bw-onclick="revokePassportShare('${x.id}')">Revoke</button>`:""}</div></div>`;
    }).join("")||'<div class="muted small">No shares yet.</div>';
  }catch(e){list.safeHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}
async function createPassportShare(){
  if(!["owner","manager"].includes(currentWorkspaceRole())){notifyUser("Only the account owner or manager can create external passport shares.");return false}
  try{
    const selected=[...document.querySelectorAll(".passportControlSelect:checked")].map(x=>x.value);
    if(!selected.length){notifyUser("Select at least one control to share.");return}
    const scopes=["controls"];
    if(document.getElementById("passportScopeScore")?.checked)scopes.push("score");
    if(document.getElementById("passportScopeCompany")?.checked)scopes.push("company_name");
    if(document.getElementById("passportScopeVerifiedAt")?.checked)scopes.push("verified_at");
    const r=await apiJson("/api/passport/share",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      label:document.getElementById("passportShareLabel")?.value||"Compliance verification",
      maxViews:Number(document.getElementById("passportMaxViews")?.value||25),selectedControls:selected,scopes
    })});
    const box=document.getElementById("passportShareCreated");
    box.safeHTML=`<div class="notice"><b>Secure link created.</b><div class="small">The bearer token is placed after # so it is not sent in the HTTP request URL. Copy this link now; the raw token is not stored for later display.</div><input id="createdPassportShareUrl" readonly value="${escapeHtml(r.shareUrl)}" style="margin-top:8px"><button class="btn alt" style="margin-top:8px" data-bw-onclick="navigator.clipboard?.writeText(document.getElementById('createdPassportShareUrl').value)">Copy link</button></div>`;
    await renderPassport();await renderPassportShares();
  }catch(e){notifyUser(e.message)}
}
async function createWorkflowRule(){
  try{
    await apiJson("/api/workflow-rules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      triggerType:document.getElementById("workflowTrigger").value,
      actionType:document.getElementById("workflowAction").value
    }),idempotencyKey:true});
    await renderWorkflowRules();
  }catch(e){notifyUser(e.message)}
}
async function renderWorkflowRules(){
  const list=document.getElementById("workflowRuleList");if(!list)return;
  try{
    const r=await apiJson("/api/workflow-rules");const items=r.items||[];
    document.getElementById("workflowRuleCount").textContent=items.length;
    document.getElementById("workflowEnabledCount").textContent=items.filter(x=>Number(x.enabled)===1).length;
    list.safeHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.trigger_type)}</b><div class="muted small">→ ${escapeHtml(x.action_type)} · ${Number(x.enabled)===1?"enabled":"disabled"}</div></div>`).join("")||'<div class="muted small">No automation rules yet.</div>';
  }catch(e){}
}


function notificationAttentionAction(x){
  const target=String(x?.target||"workhub"),id=safeId(x?.id||"");
  if(x?.kind==="proof"&&id)return `<button class="btn" type="button" data-bw-onclick="openActionProof('regulatory','${id}')">Add proof</button>`;
  if(x?.kind==="escalation"&&id)return `<button class="btn" type="button" data-bw-onclick="openActionProof('regulatory','${id}')">Work action</button>`;
  const labels={dailyreports:"Review reports",workhub:"Open review queue",regulatoryobligations:"Open action",employer:"Open HR work",tenderready:"Open tender",companysecretary:"Open company work",licenceos:"Open licence",riskengine:"Open risk",notifications:"Review delivery"};
  return `<button class="btn ${x?.severity==="urgent"?"":"soft"}" type="button" data-bw-onclick="showView('${target}')">${escapeHtml(labels[target]||"Open")}</button>`;
}
async function renderNotifications(){
  const list=document.getElementById("notificationList"),attentionList=document.getElementById("notificationAttentionList");if(!list||!attentionList)return;
  if(!["owner","manager"].includes(currentWorkspaceRole())){attentionList.safeHTML='<div class="notice bad"><b>Management alerts are not available for this role.</b></div>';return}
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  try{
    const [attention,n,p,w]=await Promise.all([apiJson("/api/notification-attention"),apiJson("/api/notifications"),apiJson("/api/notification-preferences"),apiJson("/api/notification-channels/whatsapp")]);
    const c=attention.counts||{},alerts=attention.alerts||[],items=n.items||[];
    set("notifUrgent",Number(c.urgent||0));set("notifReviews",Number(c.review||0));set("notifProofGaps",Number(c.proofGaps||0));set("notifFailed",Number(c.deadLetters||c.failed||0));
    set("notifQueued",items.filter(x=>x.status==="queued").length);set("notifSent",items.filter(x=>x.status==="sent").length);
    set("notificationRoutineCount",Number(c.routineKeptInApp24h||0));set("notificationExternalCount",Number(c.externalSent24h||0));set("notifEscalations",Number(c.openEscalations||0));set("escalationOpenCount",Number(c.openEscalations||0));set("escalationAckCount",Number(c.acknowledgedEscalations||0));set("escalationOverdueCount",Number(c.overdueAcknowledgements||0));
    const next=attention.nextDeadline;set("notificationNextDeadline",next?`Next recorded deadline: ${new Date(next).toLocaleDateString()}. Urgent external escalation begins only when the recorded deadline enters the urgent window.`:"Next recorded deadline: none currently generated. An empty queue is not a legal all-clear.");
    const status=document.getElementById("notificationAttentionStatus");if(status){status.className=`badge ${Number(c.urgent||0)>0?"bad":alerts.length?"warn":"good"}`;status.textContent=Number(c.urgent||0)>0?`${Number(c.urgent)} urgent`:alerts.length?`${alerts.length} to review`:"No urgent interrupt"}
    attentionList.safeHTML=alerts.length?alerts.map(x=>{const due=x.dueAt?` · due ${new Date(x.dueAt).toLocaleDateString()}`:"",proof=Number(x.missingProof||0)?` · ${Number(x.missingProof)} proof gap${Number(x.missingProof)===1?"":"s"}`:"";return `<div class="notification-attention-row ${x.severity==="urgent"?"urgent":""}"><div><b>${escapeHtml(x.title||"Attention item")}</b><small>${escapeHtml(x.status||x.severity||"Review")}${escapeHtml(due)}${escapeHtml(proof)}</small></div><div class="actions">${notificationAttentionAction(x)}</div></div>`}).join(""):'<div class="notice good"><b>No urgent interrupt is currently returned.</b><div class="small">Routine work still appears in Today and Work & deadlines. Do not treat this as legal all-clear.</div></div>';
    const escList=document.getElementById("escalationClosureList"),escItems=attention.escalations||[];if(escList)escList.safeHTML=escItems.length?escItems.map(x=>{const responseDue=x.response_due_at?new Date(x.response_due_at):null,responseOverdue=!!x.responseOverdue,ack=x.status==="acknowledged",due=x.due_at?` · action due ${new Date(x.due_at).toLocaleDateString()}`:" · action deadline not confirmed",response=responseDue?` · acknowledge by ${responseDue.toLocaleString()}`:"";return `<div class="escalation-closure-row ${responseOverdue?"overdue":""}"><div><b>${escapeHtml(x.title||"Compliance escalation")}</b><small>${escapeHtml(String(x.escalation_level||"warning").replaceAll("_"," "))} · ${escapeHtml(x.reason||"Action needs management attention")}${escapeHtml(due)}${escapeHtml(response)}</small><small>${ack?`Acknowledged${x.acknowledged_at?` ${new Date(x.acknowledged_at).toLocaleString()}`:""} · responsibility: ${escapeHtml(x.assigned_name||"Unassigned")}`:`Not acknowledged · responsibility: ${escapeHtml(x.assigned_name||"Unassigned")}`}</small></div><div class="actions">${!ack?`<button class="btn soft" type="button" data-bw-onclick="acknowledgeEscalation('${safeId(x.id)}')">Acknowledge</button>`:""}<button class="btn" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.obligation_id)}')">${ack?"Continue action":"Work action"}</button></div></div>`}).join(""):'<div class="notice good"><b>No unresolved management escalation.</b><div class="small">This means the escalation queue is empty; it is not a legal all-clear for the wider workspace.</div></div>';
    const pref=p.item||{};
    document.getElementById("prefEmail").checked=Number(pref.email_enabled)===1;
    const waBox=document.getElementById("prefWhatsapp"),connector=w.connector||{},consent=w.consent||{},usage=w.usage||{};
    waBox.checked=Number(pref.whatsapp_enabled)===1&&consent.active===true;waBox.disabled=connector.configured!==true||consent.active!==true;
    document.getElementById("prefSms").checked=Number(pref.sms_enabled)===1;document.getElementById("prefInApp").checked=Number(pref.in_app_enabled)!==0;
    document.getElementById("prefQuietStart").value=pref.quiet_hours_start||"20:00";document.getElementById("prefQuietEnd").value=pref.quiet_hours_end||"07:00";
    set("notificationQuietPolicy",`${pref.quiet_hours_start||"20:00"}–${pref.quiet_hours_end||"07:00"}`);
    list.safeHTML=items.slice(0,40).map(x=>`<div class="item"><b>${escapeHtml(x.subject||x.template_key)}</b><div class="muted small">${escapeHtml(x.channel)} · ${escapeHtml(x.status)}${x.provider_status?` · provider ${escapeHtml(x.provider_status)}`:""} · ${new Date(x.scheduled_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No notifications yet.</div>';
    const summary=document.getElementById("whatsappConsentSummary"),form=document.getElementById("whatsappConsentForm"),revoke=document.getElementById("whatsappRevokeButton"),test=document.getElementById("whatsappTestButton"),waStatus=document.getElementById("whatsappConsentStatus");
    if(connector.configured!==true){summary.textContent=`Connector not active · ${Number(connector.templateCount||0)} of ${Number(connector.requiredTemplateCount||6)} approved template mappings configured.`;form.style.display="none";revoke.style.display="none";waStatus.textContent="An administrator must configure the Meta business number, credentials, all utility templates and signed webhook before consent can be recorded."}
    else if(consent.active===true){summary.textContent=`Connected to ${consent.phoneMasked||"your consented number"} · consent ${consent.consentVersion||w.consentVersion}.`;form.style.display="none";revoke.style.display="inline-flex";if(test)test.style.display="inline-flex";waStatus.textContent=`WhatsApp is enabled for urgent utility interruptions and the scheduled daily summary, subject to quiet hours. ${usage.limit==null?`${Number(usage.used||0)} reserved this month.`:`${Number(usage.used||0)} of ${Number(usage.limit||0)} monthly reminders reserved.`} You can revoke consent at any time.`}
    else{summary.textContent="Connector ready. Add a Botswana mobile number and give explicit utility-message consent.";form.style.display="flex";revoke.style.display="none";waStatus.textContent=`This validates number format and records consent; it does not prove phone ownership. Plan allowance: ${usage.limit==null?"fair use":Number(usage.limit||0)+" reminders/month"}.`}
  }catch(e){
    ["notifUrgent","notifReviews","notifProofGaps","notifFailed","notifEscalations","notificationRoutineCount","notificationExternalCount","escalationOpenCount","escalationAckCount","escalationOverdueCount"].forEach(id=>set(id,"—"));
    const status=document.getElementById("notificationAttentionStatus");if(status){status.className="badge bad";status.textContent="Unavailable"}
    attentionList.safeHTML=`<div class="notice bad"><b>Attention summary unavailable</b><div class="small">${escapeHtml(e.message||String(e))}. Do not interpret missing alerts as all clear. Open Today and Work & deadlines before relying on current status.</div><button class="btn alt" type="button" style="margin-top:8px" data-bw-onclick="renderNotifications()">Retry</button></div>`;const escList=document.getElementById("escalationClosureList");if(escList)escList.safeHTML='<div class="notice bad"><b>Escalation ownership unavailable</b><div class="small">Do not assume unresolved escalations are clear. Retry before relying on this screen.</div></div>';
    list.safeHTML='<div class="muted small">Delivery history unavailable.</div>';
  }
}
async function saveWhatsAppConsent(){
  const status=document.getElementById("whatsappConsentStatus"),phone=document.getElementById("whatsappPhone").value,consent=document.getElementById("whatsappConsentAck").checked;
  try{status.textContent="Saving consent…";await apiJson("/api/notification-channels/whatsapp",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({phone,consent})});document.getElementById("whatsappConsentAck").checked=false;await renderNotifications();}
  catch(e){status.textContent=e.message}
}
async function testWhatsAppConnection(){
  const status=document.getElementById("whatsappConsentStatus");
  try{status.textContent="Queuing connection test…";const result=await apiJson("/api/notification-channels/whatsapp/test",{method:"POST"});status.textContent=result.message||"Connection test queued. Check WhatsApp for delivery."}catch(e){status.textContent=e.message}
}
async function revokeWhatsAppConsent(){
  const confirmed=await BW.dialog.confirm({title:"Revoke WhatsApp consent?",message:"Revoke WhatsApp reminder consent and cancel queued WhatsApp notifications for this account?",confirmLabel:"Revoke consent",danger:true});if(!confirmed)return;
  const status=document.getElementById("whatsappConsentStatus");try{status.textContent="Revoking consent…";await apiJson("/api/notification-channels/whatsapp",{method:"DELETE"});await renderNotifications()}catch(e){status.textContent=e.message}
}
async function saveNotificationPreferences(){
  try{
    await apiJson("/api/notification-preferences",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
      emailEnabled:document.getElementById("prefEmail").checked,
      whatsappEnabled:document.getElementById("prefWhatsapp").checked,
      smsEnabled:document.getElementById("prefSms").checked,
      inAppEnabled:document.getElementById("prefInApp").checked,
      quietHoursStart:document.getElementById("prefQuietStart").value||null,
      quietHoursEnd:document.getElementById("prefQuietEnd").value||null,
      timezone:"Africa/Gaborone"
    })});
    await renderNotifications();notifyUser("Notification preferences saved.");
  }catch(e){notifyUser(e.message)}
}
async function createComplianceSchedule(){
  try{
    await apiJson("/api/compliance-schedules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      scheduleType:document.getElementById("scheduleType").value,
      cadence:document.getElementById("scheduleCadence").value
    })});
    await renderSchedules();
  }catch(e){notifyUser(e.message)}
}
async function renderSchedules(){
  const list=document.getElementById("scheduleList");if(!list)return;
  try{
    const r=await apiJson("/api/compliance-schedules");const items=r.items||[];
    document.getElementById("scheduleCount").textContent=items.length;
    document.getElementById("scheduleEnabled").textContent=items.filter(x=>Number(x.enabled)===1).length;
    const dates=items.filter(x=>x.next_run_at).map(x=>new Date(x.next_run_at)).sort((a,b)=>a-b);
    document.getElementById("scheduleNext").textContent=dates.length?dates[0].toLocaleDateString():"—";
    list.safeHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.schedule_type)}</b><div class="muted small">${escapeHtml(x.cadence)} · ${Number(x.enabled)===1?"enabled":"disabled"}${x.next_run_at?` · next ${new Date(x.next_run_at).toLocaleString()}`:""}</div></div>`).join("")||'<div class="muted small">No schedules yet.</div>';
  }catch(e){}
}
async function createPartnerInvite(){
  const email=(document.getElementById("partnerInviteEmail").value||"").trim();if(!email)return;
  try{
    const r=await apiJson("/api/partner/invites",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
    notifyUser(`Invite created for ${email}. Delivery will use the configured email provider.`);
    document.getElementById("partnerInviteEmail").value="";
    await renderPartnerInvites();
  }catch(e){notifyUser(e.message)}
}
async function renderPartnerInvites(){
  const box=document.getElementById("partnerInviteList");if(!box)return;
  try{
    const r=await apiJson("/api/partner/invites");
    box.safeHTML=(r.items||[]).slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.email)}</b><div class="muted small">${escapeHtml(x.status)} · expires ${new Date(x.expires_at).toLocaleDateString()}</div></div>`).join("");
  }catch(e){}
}


async function orderProfessionalService(sku){
  if(currentWorkspaceRole()!=="owner"){notifyUser("Owner approval is required before creating a paid professional-service order.");return}
  try{
    const service=await apiJson("/api/services/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sku}),idempotencyKey:true});
    const payment=await apiJson("/api/payments/service-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serviceOrderId:service.id}),idempotencyKey:true});
    await renderProfessionalServices();await renderPayments();
    await openHostedCheckout(payment.paymentOrder.id);
  }catch(e){notifyUser(e.message)}
}
async function renderProfessionalServices(){
  const cat=document.getElementById("serviceCatalogList");if(!cat)return;
  try{
    const [c,o]=await Promise.all([apiJson("/api/services/catalog"),apiJson("/api/services/orders")]);
    const ci=c.items||[],oi=o.items||[];
    document.getElementById("serviceCatalogCount").textContent=ci.length;
    document.getElementById("serviceOpenOrders").textContent=oi.filter(x=>!["completed","canceled","refunded"].includes(x.status)).length;
    document.getElementById("serviceInReview").textContent=oi.filter(x=>x.status==="in_review").length;
    document.getElementById("serviceCompleted").textContent=oi.filter(x=>x.status==="completed").length;
    cat.safeHTML=ci.map(x=>`<button class="eventcard" data-bw-onclick="orderProfessionalService('${escapeHtml(x.sku)}')"><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.description||"")}</div><div style="margin-top:8px;font-weight:800">From P${x.base_price_bwp}</div></button>`).join("");
    document.getElementById("serviceOrderList").safeHTML=oi.map(x=>`<div class="item"><b>${escapeHtml(x.name||x.sku)}</b><div class="muted small">P${x.price_bwp} · ${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleDateString()}</div></div>`).join("")||'<div class="muted small">No service orders yet.</div>';
  }catch(e){cat.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function renderPayments(){
  const list=document.getElementById("paymentOrderList");if(!list)return;
  try{
    const r=await apiJson("/api/payments/orders");const items=r.items||[];
    document.getElementById("paymentPending").textContent=items.filter(x=>["pending","processing"].includes(x.status)).length;
    document.getElementById("paymentPaid").textContent=items.filter(x=>x.status==="paid").length;
    document.getElementById("paymentFailed").textContent=items.filter(x=>x.status==="failed").length;
    document.getElementById("paymentRefunded").textContent=items.filter(x=>x.status==="refunded").length;
    list.safeHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.order_type)}</b><div class="muted small">P${x.amount_bwp} · ${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No payment orders yet.</div>';
    const [v,rf]=await Promise.all([apiJson("/api/payments/verifications"),apiJson("/api/payments/refunds")]);
    const vb=document.getElementById("paymentVerificationList"),rb=document.getElementById("paymentRefundList");
    if(vb)vb.safeHTML=(v.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.verification_status)}</b><div class="muted small">${escapeHtml(x.provider)} · ${escapeHtml(x.trigger_type)}${x.provider_result_code?` · code ${escapeHtml(x.provider_result_code)}`:""} · ${new Date(x.checked_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No provider verification checks yet.</div>';
    if(rb)rb.safeHTML=(rf.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.status)} · P${x.amount_bwp}</b><div class="muted small">${escapeHtml(x.provider)}${x.reversal_status?` · ${escapeHtml(x.reversal_status)}`:""} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No refunds yet.</div>';
    try{
      const admin=await apiJson("/api/platform/billing/manual-payments"),card=document.getElementById("manualPaymentAdminCard"),box=document.getElementById("manualPaymentAdminList");
      if(card&&box){card.hidden=false;box.safeHTML=(admin.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.tenant_name||x.tenant_id)} · P${x.amount_bwp}</b><div class="muted small">${escapeHtml(x.metadata?.plan||"subscription")} · bank ref ${escapeHtml(x.bank_reference)} · submitted ${new Date(x.submitted_at).toLocaleString()}</div><div class="row" style="margin-top:8px"><button type="button" class="btn" data-bw-onclick="reviewManualPayment('${escapeHtml(x.id)}','approve')">Verify & activate</button><button type="button" class="btn soft" data-bw-onclick="reviewManualPayment('${escapeHtml(x.id)}','reject')">Reject</button></div></div>`).join("")||'<div class="muted small">No manual payments awaiting approval.</div>'}
    }catch(e){const card=document.getElementById("manualPaymentAdminCard");if(card)card.hidden=true}
  }catch(e){list.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function reviewManualPayment(submissionId,action){
 try{
   let reason="";
   if(action==="reject"){
     reason=await BW.dialog.prompt({title:"Reject payment submission",message:"Explain why this bank payment could not be verified. The customer plan will remain inactive.",multiline:true,required:true,minLength:5,maxLength:500,confirmLabel:"Reject payment"});
     if(reason===null)return;
     reason=reason.trim();if(reason.length<5){notifyUser("Add a rejection reason of at least 5 characters.");return}
   }else{
     const confirmed=await BW.dialog.confirm({title:"Verify payment and activate plan",message:"Confirm that the matching funds are visible in the Thebe Desk company bank account. Customer-submitted references are not proof of receipt.",confirmLabel:"Verify & activate"});
     if(!confirmed)return;
   }
   const r=await apiJson(`/api/platform/billing/manual-payments/${encodeURIComponent(submissionId)}/${action}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason}),idempotencyKey:true});
   notifyUser(action==="approve"?"Payment verified and plan activated.":"Payment submission rejected.");
   await Promise.all([renderPayments(),loadBilling()]);
 }catch(e){notifyUser(e.message)}
}


async function openHostedCheckout(paymentOrderId){
  const r=await apiJson("/api/payments/create-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentOrderId})});
  if(!r.ok||!r.checkoutUrl)throw new Error(r.error||"Checkout is not configured.");
  const checkoutDestination=BW.dom.safeHostedCheckoutUrl(r.checkoutUrl,r.provider);
  if(checkoutDestination==="#")throw new Error("The payment provider returned an invalid checkout destination.");
  window.location.assign(checkoutDestination);
}


async function renderPaymentProviders(){
  const box=document.getElementById("paymentProviderList");if(!box)return;
  try{
    const r=await apiJson("/api/payments/providers");
    box.safeHTML=(r.providers||[]).map(p=>`<div class="item"><div class="between row"><div><b>${escapeHtml(p.label)}</b><div class="muted small">${escapeHtml(p.mode)} · ${escapeHtml(p.settlementCurrency)} · ${escapeHtml(p.merchantStatus)}</div><div class="muted small">${(p.capabilities||[]).map(escapeHtml).join(" · ")}</div></div><span class="badge">${p.configured?"Configured":"Setup required"}</span></div></div>`).join("");
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderPaymentReconciliation(){
  const box=document.getElementById("paymentReconciliationList");if(!box)return;
  try{
    const r=await apiJson("/api/payments/reconciliation");
    box.safeHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.provider)} · ${escapeHtml(x.reconciliation_status)}</b><div class="muted small">Internal: ${escapeHtml(x.internal_status||"")} ${x.provider_status?`· Provider: ${escapeHtml(x.provider_status)}`:""} · ${new Date(x.checked_at).toLocaleString()}</div>${x.notes?`<div class="small">${escapeHtml(x.notes)}</div>`:""}</div>`).join("")||'<div class="muted small">No reconciliation events yet.</div>';
  }catch(e){}
}


async function renderEntitlements(){
  const box=document.getElementById("entitlementList");if(!box)return;
  try{
    const r=await apiJson("/api/entitlements");
    const es=r.entitlements||[],ov=r.overrides||[],us=r.usage||[];
    document.getElementById("entitlementPlan").textContent=(r.plan||"starter").toUpperCase();
    document.getElementById("entitlementEnabled").textContent=es.filter(x=>Number(x.enabled)===1).length;
    document.getElementById("entitlementLimited").textContent=es.filter(x=>Number(x.enabled)===1&&x.limit_value!=null).length;
    document.getElementById("entitlementOverrides").textContent=ov.length;
    box.safeHTML=es.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.feature_key)}</b><div class="muted small">${Number(x.enabled)===1?"Enabled":"Not included"}${x.limit_value!=null?` · limit ${x.limit_value}`:""}</div></div><span class="badge">${Number(x.enabled)===1?"On":"Off"}</span></div></div>`).join("");
    document.getElementById("entitlementUsage").safeHTML=us.map(x=>`<div class="item"><b>${escapeHtml(x.counter_key)}</b><div class="muted small">${x.value} · ${escapeHtml(x.period_key)}</div></div>`).join("")||'<div class="muted small">No usage yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function renderRegulatoryIntelligence(){
  const src=document.getElementById("regulatorySourceList");if(!src)return;
  try{
    const [s,r,c,i]=await Promise.all([
      apiJson("/api/regulatory/sources"),
      apiJson("/api/regulatory/rules"),
      apiJson("/api/regulatory/conflicts"),
      apiJson("/api/regulatory/impacts")
    ]);
    const ss=s.items||[],rr=r.items||[],cc=c.items||[],ii=i.items||[];
    document.getElementById("regSourcesPending").textContent=ss.filter(x=>x.status==="approved").length;
    document.getElementById("regRulesReview").textContent=ii.filter(x=>["action","urgent"].includes(x.impact_level)&&x.status==="pending").length;
    document.getElementById("regRulesPublished").textContent=rr.filter(x=>x.status==="published").length;
    document.getElementById("regConflictsOpen").textContent=cc.filter(x=>x.status==="open").length;
    src.safeHTML=ss.slice(0,30).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.authority)} · ${escapeHtml(x.status)}${x.effective_date?` · effective ${new Date(x.effective_date).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No sources loaded.</div>';
    document.getElementById("regulatoryRuleList").safeHTML=rr.slice(0,30).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">v${x.version} · ${escapeHtml(x.status)} · ${escapeHtml(x.confidence)} confidence</div></div>`).join("")||'<div class="muted small">No rules loaded.</div>';
    document.getElementById("regulatoryConflictList").safeHTML=cc.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.topic_key)}</b><div class="muted small">${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.description||"")}</div></div>`).join("")||'<div class="muted small">No open conflicts.</div>';
    document.getElementById("regulatoryImpactList").safeHTML=ii.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.rule_title)}</b><div class="muted small">${escapeHtml(x.impact_level)} · ${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.explanation||"")}</div></div>`).join("")||'<div class="muted small">No current impacts.</div>';
  }catch(e){src.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function runScan(){
  const out=document.getElementById("scanResults");
  const btn=document.querySelector('#scanModal button[data-bw-onclick="runScan()"]');
  if(out)out.safeHTML='<div class="notice"><b>Scanning current published rules…</b><div class="small">This can take a moment. Existing obligations are updated idempotently; the scan does not invent rules or bypass review gates.</div></div>';
  if(btn){btn.disabled=true;btn.textContent="Scanning…"}
  try{
    const rulesResponse=await apiJson("/api/regulatory/rules");
    const rules=(rulesResponse.items||[]).filter(x=>x.status==="published").slice(0,200);
    let evaluated=0,failed=0,created=0;
    for(let i=0;i<rules.length;i+=4){
      const batch=rules.slice(i,i+4);
      const results=await Promise.allSettled(batch.map(r=>apiJson(`/api/regulatory/rules/${encodeURIComponent(r.id)}/evaluate`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"})));
      results.forEach(r=>{if(r.status==="fulfilled"){evaluated++;created+=Number(r.value?.obligationsCreated||0)}else failed++});
      if(out)out.safeHTML=`<div class="notice"><b>Scan in progress</b><div class="small">${evaluated+failed} of ${rules.length} published rules checked.</div></div>`;
    }
    let statutory={rulesEvaluated:0,obligationsCreated:0,schedulesNeedingInput:0};
    try{statutory=await apiJson("/api/statutory-calendar/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})}catch(e){failed++}
    created+=Number(statutory.obligationsCreated||0);
    await Promise.allSettled([renderComplianceObligations(),renderStatutoryCalendar(),renderRegulatoryIntelligence(),renderUnifiedNextActions()]);
    if(out)out.safeHTML=`<div class="notice ${failed?"":"good"}"><b>${failed?"Scan completed with review items":"Scan complete"}</b><div class="small">${evaluated} published rules evaluated · ${created} new obligation${created===1?"":"s"} created · ${Number(statutory.schedulesNeedingInput||0)} schedule setup gap${Number(statutory.schedulesNeedingInput||0)===1?"":"s"}${failed?` · ${failed} check${failed===1?"":"s"} could not complete`:""}.</div></div>`;
  }catch(e){
    if(out)out.safeHTML=`<div class="notice bad"><b>Scan could not complete</b><div class="small">${escapeHtml(e.message||String(e))}</div></div>`;
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Run again"}
  }
}

async function renderComplianceObligations(){
  const box=document.getElementById("regObligationList");if(!box)return;
  try{
    const [o,a]=await Promise.all([apiJson("/api/obligations"),apiJson("/api/regulatory/applicability")]);
    const items=o.items||[],apps=a.items||[],now=new Date();
    document.getElementById("regObligationOpen").textContent=items.filter(x=>["open","in_progress","review","blocked"].includes(x.status)).length;
    document.getElementById("regObligationDueSoon").textContent=items.filter(x=>x.due_at&&new Date(x.due_at)>now&&new Date(x.due_at)-now<30*86400000&&x.status!=="completed").length;
    document.getElementById("regObligationReview").textContent=items.filter(x=>x.status==="review").length;
    document.getElementById("regObligationCompleted").textContent=items.filter(x=>x.status==="completed").length;
    box.safeHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.status)} · priority ${x.priority}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:" · deadline not confirmed"}${x.assigned_name?` · owner ${escapeHtml(x.assigned_name)}`:" · unassigned"}${Number(x.evidence_required)===1?" · proof required":""}${x.superseded_at?" · superseded — review current rule":""}</div><div class="small">${escapeHtml(x.description||"")}</div></div><div class="actions">${Number(x.evidence_required)===1&&!['completed','not_applicable'].includes(x.status)?`<button class="btn soft" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">Proof</button>`:""}${!["completed","not_applicable"].includes(x.status)?`<button class="btn ${x.status==="review"?"":"soft"}" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">${x.status==="open"?"Work action":x.status==="review"?"Review decision":"Continue"}</button>`:'<span class="badge good">Recorded</span>'}</div></div></div>`).join("")||'<div class="muted small">No obligations yet.</div>';
    document.getElementById("regApplicabilityList").safeHTML=apps.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.applicability_status)} · evaluated ${new Date(x.evaluated_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No rule evaluations yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}



async function acknowledgeEscalation(id){
  try{
    await apiJson(`/api/obligation-escalations/${encodeURIComponent(id)}/acknowledge`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({note:"Acknowledged from management attention queue"})});
    await Promise.allSettled([renderNotifications(),renderUnifiedNextActions(),renderComplianceObligations()]);
  }catch(e){notifyUser(e.message||String(e))}
}
async function renderInspectionReadiness(){
  const scenarios=document.getElementById("inspectionScenarioList");if(!scenarios)return;
  try{
    const [s,r,p]=await Promise.all([apiJson("/api/inspection-scenarios"),apiJson("/api/inspection-simulations"),apiJson("/api/inspection-packs")]);
    const ss=s.items||[],runs=r.items||[],packs=p.items||[],latest=runs[0]||null,canSimulate=currentWorkspaceRole()!=="auditor";
    scenarios.safeHTML=ss.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.authority_label)} · ${escapeHtml(x.description)}</div></div>${canSimulate?`<button class="btn alt" data-bw-onclick="runInspectionScenario('${x.scenario_key}')">Simulate</button>`:'<span class="badge">Read only</span>'}</div></div>`).join("")||'<div class="muted small">No scenarios available on this plan.</div>';
    document.getElementById("inspectionReadinessScore").textContent=latest?.coverage_status==="insufficient"?"N/A":latest?.readiness_score??"—";
    document.getElementById("inspectionCritical").textContent=latest?.critical_findings??0;
    document.getElementById("inspectionHigh").textContent=latest?.high_findings??0;
    document.getElementById("inspectionPackCount").textContent=packs.length;
    document.getElementById("inspectionSimulationList").safeHTML=runs.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.scenario_name)}</b><div class="muted small">${x.coverage_status==="insufficient"?"Insufficient data":`Score ${x.readiness_score}`} · ${escapeHtml(x.readiness_band)} · coverage ${escapeHtml(x.coverage_status)} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No simulations yet.</div>';
    document.getElementById("inspectionPackList").safeHTML=packs.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.label)}</b><div class="muted small">${escapeHtml(x.status)} · ${new Date(x.generated_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No packs yet.</div>';
    if(packs[0])latestInspectionPackId=packs[0].id;
  }catch(e){scenarios.safeHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}


async function renderNotificationDeadLetters(){
  const box=document.getElementById("notificationDeadLetterList");if(!box)return;
  try{
    const r=await apiJson("/api/notifications/dead-letters");
    box.safeHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.channel)} · ${escapeHtml(x.reason)}</b><div class="muted small">${escapeHtml(x.subject||"")} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No dead letters.</div>';
  }catch(e){}
}
async function exportLatestInspectionPack(){
  if(currentWorkspaceRole()==="auditor"){notifyUser("Auditor access is read-only. Export generation requires a reviewer, manager or owner.");return false}
  if(!latestInspectionPackId){notifyUser("Generate an inspection pack first.");return;}
  try{
    const r=await apiJson(`/api/inspection-packs/${latestInspectionPackId}/export`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({format:"json"})});
    const blob=new Blob([JSON.stringify(r.data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`inspection-pack-${latestInspectionPackId}.json`;a.click();URL.revokeObjectURL(url);
  }catch(e){notifyUser(e.message)}
}


async function renderPartnerAccess(){
  const box=document.getElementById("partnerAccessList");if(!box)return;
  try{
    const r=await apiJson("/api/partner/access");
    box.safeHTML=(r.items||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.client_name||x.client_tenant_id)}</b><div class="muted small">${escapeHtml(x.status)} · ${(JSON.parse(x.scopes_json||"[]")).map(escapeHtml).join(" · ")}</div></div>${x.status==="active"?`<button class="btn alt" data-bw-onclick="revokePartnerAccess('${x.client_tenant_id}')">Revoke</button>`:""}</div></div>`).join("")||'<div class="muted small">No authorized clients.</div>';
  }catch(e){}
}
async function revokePartnerAccess(clientTenantId){
  try{
    await apiJson(`/api/partner/access/${clientTenantId}/revoke`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    await renderPartnerAccess();await renderPartnerClients();
  }catch(e){notifyUser(e.message)}
}


async function renderPassportShares(){
  const box=document.getElementById("passportShareList");if(!box||!["owner","manager"].includes(currentWorkspaceRole()))return;
  try{
    const r=await apiJson("/api/passport/shares");
    box.safeHTML=(r.items||[]).map(x=>{
      const status=x.revoked_at?"revoked":x.invalidated_at?"reissue required":(x.expires_at&&new Date(x.expires_at)<new Date()?"expired":"active");
      return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.label||"Compliance Passport")}</b><div class="muted small">${escapeHtml(status)} · revision ${x.issued_revision??0} · ${x.view_count||0}${x.max_views!=null?`/${x.max_views}`:""} views · expires ${x.expires_at?new Date(x.expires_at).toLocaleString():"never"}</div>${x.invalidation_reason?`<div class="small">${escapeHtml(x.invalidation_reason)}</div>`:""}</div>${!x.revoked_at&&!x.invalidated_at?`<button class="btn alt" data-bw-onclick="revokePassportShare('${x.id}')">Revoke</button>`:""}</div></div>`;
    }).join("")||'<div class="muted small">No shares.</div>';
  }catch(e){box.safeHTML=`<div class="muted small">${escapeHtml(e.message)}</div>`}
}
async function revokePassportShare(id){
  if(!["owner","manager"].includes(currentWorkspaceRole())){notifyUser("Only the account owner or manager can revoke external passport shares.");return false}
  try{
    await apiJson(`/api/passport/shares/${id}/revoke`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    await renderPassportShares();await renderPassport();
  }catch(e){notifyUser(e.message)}
}


async function requestDeletion(){
  if(currentWorkspaceRole()!=="owner"){notifyUser("Only the account owner can request tenant deletion.");return}
  const confirmation=await BW.dialog.prompt({title:"Request tenant deletion",message:"Type DELETE MY ACCOUNT exactly to request tenant deletion.",required:true,exactValue:"DELETE MY ACCOUNT",maxLength:32,confirmLabel:"Request deletion",danger:true});
  if(confirmation===null)return;
  try{
    await apiJson("/api/account/deletion-request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmation,reason:"Customer requested account deletion"})});
    await renderDeletion();
  }catch(e){notifyUser(e.message)}
}
async function renderDeletion(){
  const box=document.getElementById("deleteDetail");if(!box)return;
  try{
    const [d,h]=await Promise.all([apiJson("/api/account/deletion-status"),apiJson("/api/legal-holds")]);
    const item=d.item,holds=h.items||[];
    document.getElementById("deleteStatus").textContent=(item?.status||"none").toUpperCase();
    document.getElementById("deleteAttempts").textContent=item?.attempts||0;
    document.getElementById("deleteHolds").textContent=holds.filter(x=>x.status==="active").length;
    box.safeHTML=item?`<div><b>${escapeHtml(item.status)}</b><div class="muted small">Requested ${new Date(item.requested_at).toLocaleString()}${item.last_error?` · ${escapeHtml(item.last_error)}`:""}</div></div>`:'<div class="muted small">No deletion request.</div>';
    document.getElementById("legalHoldList").safeHTML=holds.map(x=>`<div class="item"><b>${escapeHtml(x.reason)}</b><div class="muted small">${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No holds.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function reviewEvidence(id,status){
  if(currentWorkspaceRole()==="auditor"){notifyUser("Auditor access is read-only for evidence review decisions.");return false}
  try{
    let reason="";if(status!=="approved"){const answer=await BW.dialog.prompt({title:"Evidence review reason",message:"Record the reason for this evidence decision.",multiline:true,required:true,minLength:8,maxLength:900,confirmLabel:"Record decision"});if(answer===null)return;reason=answer.trim()}
    await apiJson(`/api/evidence/integrity/${id}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status,reason})});
    await renderEvidenceIntegrity();
  }catch(e){notifyUser(e.message)}
}
async function retryEvidenceScan(id){
  if(currentWorkspaceRole()==="auditor"){notifyUser("Auditor access is read-only for evidence scan controls.");return false}
  try{await apiJson(`/api/evidence/${id}/scan-retry`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderEvidenceIntegrity()}catch(e){notifyUser(e.message)}
}
function downloadEvidence(id){location.href=`/api/evidence/${encodeURIComponent(id)}/download`;}
async function renderEvidenceIntegrity(){
  const box=document.getElementById("evidenceIntegrityList");if(!box)return;
  try{
    const [r,q]=await Promise.all([apiJson("/api/evidence/integrity"),apiJson("/api/evidence/scan-queue")]),items=r.items||[];
    document.getElementById("evidenceQuarantined").textContent=items.filter(x=>x.review_status==="quarantined").length;
    document.getElementById("evidenceScanClean").textContent=items.filter(x=>x.scan_status==="clean").length;
    document.getElementById("evidenceApproved").textContent=items.filter(x=>x.review_status==="approved"&&x.scan_status==="clean").length;
    document.getElementById("evidenceScanProblems").textContent=items.filter(x=>["infected","scan_error","legacy_unscanned"].includes(x.scan_status)).length;
    document.getElementById("evidenceScannerStatus").safeHTML=q.scannerConfigured
      ? '<span class="pill good">Scanner configured</span>'
      : '<span class="pill bad">Scanner not configured · approval remains blocked</span>';
    const canReviewEvidence=currentWorkspaceRole()!=="auditor";
    box.safeHTML=items.map(x=>{
      const clean=x.scan_status==="clean",canApprove=canReviewEvidence&&x.review_status==="quarantined"&&clean,canDownload=x.review_status==="approved"&&clean;
      return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b>
        <div class="muted small">review ${escapeHtml(x.review_status)} · scan ${escapeHtml(x.scan_status||"not_scanned")} · ${Math.round((x.size_bytes||0)/1024)} KB</div>
        ${x.malware_name?`<div class="small bad">Threat: ${escapeHtml(x.malware_name)}</div>`:""}
        ${x.scan_last_error?`<div class="small">Scan error: ${escapeHtml(x.scan_last_error)}</div>`:""}
        <div class="muted small">${x.content_sha256?escapeHtml(x.content_sha256.slice(0,20))+"…":""}${x.scanned_at?` · scanned ${new Date(x.scanned_at).toLocaleString()}`:""}</div></div>
        <div>${canApprove?`<button class="btn alt" data-bw-onclick="reviewEvidence('${x.id}','approved')">Approve</button>`:""}
          ${canReviewEvidence&&x.review_status==="quarantined"?`<button class="btn alt" data-bw-onclick="reviewEvidence('${x.id}','rejected')">Reject</button>`:""}
          ${canReviewEvidence&&["queued","scan_error","legacy_unscanned"].includes(x.scan_status)?`<button class="btn alt" data-bw-onclick="retryEvidenceScan('${x.id}')">Retry scan</button>`:""}
          ${canDownload?`<button class="btn alt" data-bw-onclick="downloadEvidence('${x.id}')">Download</button>`:""}</div></div></div>`;
    }).join("")||'<div class="muted small">No evidence yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


function boolFromSelect(id){return document.getElementById(id)?.value==="true"}
async function loadRiskEmployeeControls(){
  const eid=document.getElementById("riskEmployee")?.value;if(!eid)return;
  try{const r=await apiJson(`/api/employees/${eid}/risk-controls`);const x=r.item||{};
    riskContract.value=String(Number(x.contract_signed||0)===1);riskContractType.value=x.contract_type||"unknown";riskFixedEnd.value=x.fixed_term_end_date||"";riskFixedBasis.value=String(Number(x.fixed_term_justification_recorded||0)===1);riskProbationEnd.value=x.probation_end_date||"";riskProbationReviewed.value=String(Number(x.probation_review_recorded||0)===1);riskLeave.value=String(Number(x.leave_record_current||0)===1);riskAttendance.value=String(Number(x.attendance_record_current||0)===1);riskOvertime.value=String(Number(x.overtime_control||0)===1);riskAsset.value=String(Number(x.asset_acknowledgement||0)===1);riskDisciplinary.value=String(Number(x.disciplinary_process_open||0)===1);riskGrievance.value=String(Number(x.grievance_open||0)===1);riskNotes.value=x.notes||"";
  }catch(e){}
}
async function saveEmployeeRiskControls(){
  const employeeId=riskEmployee.value;if(!employeeId){notifyUser("Choose an employee.");return;}
  try{await apiJson(`/api/employees/${employeeId}/risk-controls`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({contractSigned:boolFromSelect("riskContract"),contractType:riskContractType.value,fixedTermEndDate:riskFixedEnd.value||null,fixedTermJustificationRecorded:boolFromSelect("riskFixedBasis"),probationEndDate:riskProbationEnd.value||null,probationReviewRecorded:boolFromSelect("riskProbationReviewed"),leaveRecordCurrent:boolFromSelect("riskLeave"),attendanceRecordCurrent:boolFromSelect("riskAttendance"),overtimeControl:boolFromSelect("riskOvertime"),assetAcknowledgement:boolFromSelect("riskAsset"),disciplinaryProcessOpen:boolFromSelect("riskDisciplinary"),grievanceOpen:boolFromSelect("riskGrievance"),notes:riskNotes.value})});await renderProtectionEngine();}catch(e){notifyUser(e.message)}
}
async function recalculateEmployerRisk(){try{await apiJson("/api/employer-risk/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderProtectionEngine();}catch(e){notifyUser(e.message)}}
async function recalculateProtectionScore(){try{await apiJson("/api/business-protection-score/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderProtectionEngine();}catch(e){notifyUser(e.message)}}
async function renderProtectionEngine(){
  const box=document.getElementById("employmentRiskFindings");if(!box)return;
  try{const [risk,bps,emps]=await Promise.all([apiJson("/api/employer-risk"),apiJson("/api/business-protection-score"),apiJson("/api/employees")]);
    bpsScore.textContent=bps.score??"—";bpsGrade.textContent=`Grade ${bps.grade||"—"}`;employmentProtection.textContent=risk.protectionScore??"—";employmentBand.textContent=(risk.riskBand||"—").toUpperCase();employmentHighFindings.textContent=(risk.findings||[]).filter(x=>["high","critical"].includes(x.severity)).length;employmentReviewed.textContent=`${risk.dimensions?.controlsReviewed??0}%`;
    protectionScore.textContent=bps.score??"—";protectionBar.style.width=`${bps.score||0}%`;protectionScore.className=`score ${bps.score>=80?"good":bps.score>=60?"warn":"bad"}`;
    const dims=bps.dimensions||{};bpsDimensions.safeHTML=Object.entries(dims).map(([k,v])=>`<div class="item"><div class="between row"><b>${escapeHtml(k.replaceAll("_"," "))}</b><span>${v.score}% · weight ${v.weight}%</span></div><div class="progress"><span style="width:${v.score}%"></span></div></div>`).join("");
    bpsDrivers.safeHTML=(bps.drivers||[]).map(x=>`<div class="item"><b>${escapeHtml(x.title||x.dimension)}</b><div class="muted small">${x.severity?escapeHtml(x.severity):`Score ${x.score}`}</div></div>`).join("")||'<div class="muted small">No material protection gaps.</div>';
    box.safeHTML=(risk.findings||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.severity)}${x.employeeId?` · employee ${escapeHtml(x.employeeId)}`:""}</div><div class="small">${escapeHtml(x.rationale)}</div><div class="muted small" style="margin-top:4px">Action: ${escapeHtml(x.recommendedAction)}</div></div></div></div>`).join("")||'<div class="muted small">No material employment-control findings.</div>';
    const sel=document.getElementById("riskEmployee"),old=sel.value,activeRiskEmployees=(emps.items||[]).filter(e=>String(e.status||"").trim().toLowerCase()==="active"&&!recentlyRemovedEmployeeIds.has(String(e.id)));sel.safeHTML=activeRiskEmployees.map(e=>`<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join("");if(old&&[...sel.options].some(o=>o.value===old))sel.value=old;sel.onchange=loadRiskEmployeeControls;if(sel.value)await loadRiskEmployeeControls();
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function recalculateRiskEvents(){
  try{await apiJson("/api/business-risk-events/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderRiskEvents();await renderProtectionEngine();await renderUnifiedNextActions()}
  catch(e){notifyUser(e.message)}
}
async function acknowledgeRiskEvent(id){
  try{await apiJson(`/api/business-risk-events/${id}/acknowledge`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderRiskEvents()}
  catch(e){notifyUser(e.message)}
}
async function renderRiskEvents(){
  const box=document.getElementById("riskEventList");if(!box)return;
  try{
    const r=await apiJson("/api/business-risk-events"),items=r.items||[],s=r.snapshot||{};
    const active=items.filter(x=>["open","acknowledged"].includes(x.status));
    document.getElementById("riskEventOpen").textContent=active.length;
    document.getElementById("riskEventCritical").textContent=active.filter(x=>x.severity==="critical").length;
    document.getElementById("riskEventHigh").textContent=active.filter(x=>x.severity==="high").length;
    document.getElementById("riskPressure").textContent=s.risk_pressure??0;
    box.safeHTML=active.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.category)} · ${escapeHtml(x.severity)} · ${escapeHtml(x.status)}${x.due_at?` · ${new Date(x.due_at).toLocaleDateString()}`:""} · seen ${x.occurrence_count||1}×</div><div class="small">${escapeHtml(x.rationale||"")}</div><div class="small"><b>Action:</b> ${escapeHtml(x.recommended_action||"")}</div></div>${x.status==="open"?`<button class="btn alt" data-bw-onclick="acknowledgeRiskEvent('${x.id}')">Acknowledge</button>`:""}</div></div>`).join("")||'<div class="notice good">No active business-risk events detected from current workspace records.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderPortfolioRisk(){
  const box=document.getElementById("portfolioRiskList");if(!box)return;
  try{
    const r=await apiJson("/api/partner/portfolio-risk");
    box.safeHTML=(r.items||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.clientName)}</b><div class="muted small">Protection ${x.protectionScore??"—"}${x.grade?` (${escapeHtml(x.grade)})`:""} · ${x.openEvents} open risk event(s)</div></div><div><span class="badge ${x.criticalEvents?"bad":x.highEvents?"warn":"good"}">${x.criticalEvents} critical · ${x.highEvents} high</span></div></div></div>`).join("")||'<div class="muted small">No authorized client portfolio data yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function activateIndustryPack(packKey){try{await apiJson(`/api/industry/packs/${packKey}/activate`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderIndustryIntelligence();await renderRegulatoryIntelligence()}catch(e){notifyUser(e.message)}}
async function dismissIndustryPack(packKey){try{await apiJson(`/api/industry/packs/${packKey}/dismiss`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderIndustryIntelligence()}catch(e){notifyUser(e.message)}}
async function updateIndustryControl(packKey,controlKey,status){try{await apiJson(`/api/industry/controls/${packKey}/${controlKey}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderIndustryIntelligence()}catch(e){notifyUser(e.message)}}
async function setIndustryBenchmarkOptIn(optIn){try{await apiJson("/api/industry/benchmark-preference",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({optIn})});await renderIndustryIntelligence()}catch(e){notifyUser(e.message)}}
async function renderIndustryIntelligence(){
  const packBox=document.getElementById("industryPackList");if(!packBox)return;
  try{
    const [p,c,b]=await Promise.all([apiJson("/api/industry/packs"),apiJson("/api/industry/controls"),apiJson("/api/industry/benchmark")]);
    const packs=p.items||[],controls=c.items||[];document.getElementById("industryName").textContent=p.profile?.industry||"Not set";
    document.getElementById("industryActivePacks").textContent=packs.filter(x=>x.status==="active").length;
    document.getElementById("industryControlsReady").textContent=controls.filter(x=>x.status==="ready"||x.status==="not_applicable").length;
    document.getElementById("industryCohort").textContent=b.available?b.cohortSize:`<${b.minCohort||10}`;
    const opt=document.getElementById("industryBenchmarkOptIn");if(opt)opt.checked=!!b.optIn;
    packBox.safeHTML=packs.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.status)} · match ${x.match_confidence||0}% · pack v${x.version}</div><div class="small">${escapeHtml(x.description||"")}</div></div><div>${x.status==="recommended"?`<button class="btn" data-bw-onclick="activateIndustryPack('${x.pack_key}')">Activate</button><button class="btn alt" data-bw-onclick="dismissIndustryPack('${x.pack_key}')">Dismiss</button>`:x.status==="active"?'<span class="badge good">Active</span>':''}</div></div></div>`).join("")||'<div class="muted small">No pack matches the current industry profile. Update the company industry if needed.</div>';
    document.getElementById("industryControlList").safeHTML=controls.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.pack_name)} · ${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.description||"")}</div>${x.evidence_hint?`<div class="muted small">Evidence examples: ${escapeHtml(x.evidence_hint)}</div>`:""}</div><select data-bw-onchange="updateIndustryControl('${x.pack_key}','${x.control_key}',this.value)"><option value="not_started" ${x.status==="not_started"?"selected":""}>Not started</option><option value="in_progress" ${x.status==="in_progress"?"selected":""}>In progress</option><option value="review" ${x.status==="review"?"selected":""}>Review</option><option value="ready" ${x.status==="ready"?"selected":""}>Ready</option><option value="not_applicable" ${x.status==="not_applicable"?"selected":""}>Not applicable</option></select></div></div>`).join("")||'<div class="muted small">Activate an industry pack to create controls.</div>';
    const bb=document.getElementById("industryBenchmark");
    bb.safeHTML=b.available?`<div class="item"><b>${escapeHtml(b.industryKey)}</b><div class="muted small">${b.cohortSize} opted-in businesses · updated ${new Date(b.asOf).toLocaleString()}</div><div class="small">Average Protection Score: <b>${b.metrics?.averageProtectionScore??"—"}</b> · Median: <b>${b.metrics?.medianProtectionScore??"—"}</b></div></div>`:`<div class="muted small">Benchmark withheld until at least ${b.minCohort||10} opted-in businesses exist in this industry. Current eligible cohort: ${b.cohortSize||0}.</div>`;
  }catch(e){packBox.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function recalculateControlCenter(){
  try{await apiJson("/api/control-center/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderControlCenter();await renderRiskEvents();await renderProtectionEngine()}
  catch(e){notifyUser(e.message)}
}
async function advanceRemediation(id,status){
  try{await apiJson(`/api/remediation/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderControlCenter()}
  catch(e){notifyUser(e.message)}
}
async function escalateRemediation(id){
  if(currentWorkspaceRole()!=="owner"){notifyUser("Professional review is recommended. The account owner must approve the paid service order.");return}
  try{const r=await apiJson(`/api/remediation/${id}/escalate`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});notifyUser(`Professional review order created: ${r.sku||""} · P${r.priceBwp??""}`);await renderControlCenter();await renderProfessionalServices()}
  catch(e){notifyUser(e.message)}
}
async function advanceRegChange(id,status){
  try{await apiJson(`/api/regulatory-change-cases/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderControlCenter()}
  catch(e){notifyUser(e.message)}
}
async function renderControlCenter(){
  const box=document.getElementById("controlCenterList");if(!box)return;
  try{
    const c=await apiJson("/api/control-center"),items=c.items||[],eh=c.evidenceHealth||{};
    document.getElementById("controlPassing").textContent=items.filter(x=>x.status==="passing").length;
    document.getElementById("controlAttention").textContent=items.filter(x=>["attention","review"].includes(x.status)).length;
    document.getElementById("controlFailed").textContent=items.filter(x=>x.status==="failed").length;
    document.getElementById("evidenceHealthScore").textContent=eh.health_score??"—";
    {const total=items.length,current=items.filter(x=>x.assurance_freshness==="current").length,stale=items.filter(x=>["stale","overdue"].includes(x.assurance_freshness)).length,failed=items.filter(x=>x.status==="failed").length;
      const mode=document.getElementById("cockpitMode"),fresh=document.getElementById("cockpitFreshness"),src=document.getElementById("cockpitSources"),status=document.getElementById("cockpitStatus"),statusText=document.getElementById("cockpitStatusText"),ev=document.getElementById("evidenceCoverage"),cap=document.getElementById("evidenceMetricCaption");
      if(mode)mode.textContent=STANDALONE_PREVIEW?"Preview data":"Server-backed";if(fresh)fresh.textContent=total?`${current}/${total} controls current`:"Baseline not established";if(src)src.textContent=sourceConflicts.length?`${sourceConflicts.length} conflict${sourceConflicts.length===1?"":"s"} blocked`:"No blocking conflicts";
      if(Number.isFinite(Number(eh.health_score))&&ev){ev.textContent=Math.max(0,Math.min(100,Number(eh.health_score)))+"%";if(cap)cap.textContent="Server evidence-health snapshot"}
      const attention=sourceConflicts.length||stale||failed;if(status){status.classList.toggle("warn",!!attention);status.classList.toggle("good",!attention&&!STANDALONE_PREVIEW)}if(statusText)statusText.textContent=STANDALONE_PREVIEW?"Preview mode":attention?"Attention required":"Assurance current";
    }
    box.safeHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.category)} · ${escapeHtml(x.status)} · ${escapeHtml(x.assurance_level)} · evidence ${escapeHtml(x.evidence_health)}</div><div class="small">${escapeHtml(x.objective||"")}</div></div><span class="badge ${x.status==="failed"?"bad":x.status==="passing"?"good":"warn"}">${escapeHtml(x.status)}</span></div></div>`).join("")||'<div class="muted small">Recalculate to establish the control baseline.</div>';
    document.getElementById("evidenceHealthDetail").safeHTML=`<div class="grid g2"><div class="item"><b>${eh.approved_count||0}</b><div class="muted small">approved</div></div><div class="item"><b>${eh.missing_required_count||0}</b><div class="muted small">mandatory items missing</div></div><div class="item"><b>${eh.expiring_count||0}</b><div class="muted small">expiring ≤30 days</div></div><div class="item"><b>${eh.expired_count||0}</b><div class="muted small">expired</div></div></div>`;
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`;const t=document.getElementById("cockpitStatusText"),st=document.getElementById("cockpitStatus"),fresh=document.getElementById("cockpitFreshness"),ev=document.getElementById("evidenceCoverage"),cap=document.getElementById("evidenceMetricCaption");if(t)t.textContent=STANDALONE_PREVIEW?"Preview mode":"Unable to confirm assurance";if(st)st.classList.add("warn");if(fresh)fresh.textContent="Status unavailable";if(!STANDALONE_PREVIEW&&ev)ev.textContent="—";if(!STANDALONE_PREVIEW&&cap)cap.textContent="Assurance unavailable · do not treat as verified"}
  const regBox=document.getElementById("regChangeList");
  try{
    const r=await apiJson("/api/regulatory-change-cases");
    regBox.safeHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.applicability_status)} · ${escapeHtml(x.impact_level)} · ${escapeHtml(x.status)} · ${x.obligation_count} open obligation(s)</div><div class="small">${escapeHtml(x.explanation||"")}</div>${x.status==="assessing"?`<button class="btn alt" data-bw-onclick="advanceRegChange('${x.id}','action_required')">Action required</button>`:""}${x.status==="action_required"&&Number(x.obligation_count||0)===0?`<button class="btn alt" data-bw-onclick="advanceRegChange('${x.id}','implemented')">Mark implemented</button>`:""}</div>`).join("")||'<div class="muted small">No published regulatory changes currently require review.</div>';
  }catch(e){regBox.safeHTML='<div class="muted small">Regulatory Change Control is available on Protect and above.</div>'}
  const remBox=document.getElementById("remediationList");
  try{
    const r=await apiJson("/api/remediation");
    remBox.safeHTML=(r.items||[]).filter(x=>!["resolved","canceled"].includes(x.status)).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.severity)} · ${escapeHtml(x.status)}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}</div><div class="small">${escapeHtml(x.recommended_action||"")}</div></div><div>${x.status==="open"?`<button class="btn alt" data-bw-onclick="advanceRemediation('${x.id}','in_progress')">Start</button>`:""}${x.requires_professional&&!x.service_order_id?`<button class="btn" data-bw-onclick="escalateRemediation('${x.id}')">Professional review</button>`:""}</div></div></div>`).join("")||'<div class="notice good">No active remediation cases.</div>';
  }catch(e){remBox.safeHTML='<div class="muted small">Advanced remediation is available on Protect and above.</div>'}
}


async function runAssuranceTest(){
  try{await apiJson("/api/control-assurance/test",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderAssuranceFreshness();await renderControlCenter()}
  catch(e){notifyUser(e.message)}
}
async function reviewControlFreshness(key,currentStatus){
  if(currentWorkspaceRole()==="auditor"){notifyUser("Auditor access is read-only for control review decisions.");return false}
  const notes=await BW.dialog.prompt({title:"Control freshness review",message:"Add review notes for the current control condition and supporting records.",defaultValue:"Reviewed current control condition and supporting records.",multiline:true,required:true,minLength:8,maxLength:900,confirmLabel:"Save review"});
  if(notes===null)return;
  try{
    await apiJson(`/api/controls/${key}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:currentStatus,notes})});
    await renderAssuranceFreshness();await renderControlCenter();
  }catch(e){notifyUser(e.message)}
}
async function renderAssuranceFreshness(){
  const box=document.getElementById("freshnessList");if(!box)return;
  try{
    const r=await apiJson("/api/control-center"),items=r.items||[];
    document.getElementById("freshCurrent").textContent=items.filter(x=>x.assurance_freshness==="current").length;
    document.getElementById("freshDue").textContent=items.filter(x=>x.assurance_freshness==="due").length;
    document.getElementById("freshOverdue").textContent=items.filter(x=>x.assurance_freshness==="overdue").length;
    document.getElementById("freshStale").textContent=items.filter(x=>x.assurance_freshness==="stale").length;
    const rank={stale:1,overdue:2,due:3,unknown:4,current:5},canReview=currentWorkspaceRole()!=="auditor";
    items.sort((a,b)=>(rank[a.assurance_freshness]||9)-(rank[b.assurance_freshness]||9)||(b.risk_weight||0)-(a.risk_weight||0));
    box.safeHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.category)} · ${escapeHtml(x.status)} · ${escapeHtml(x.assurance_level)} · freshness ${escapeHtml(x.assurance_freshness||"unknown")}</div><div class="small">${escapeHtml(x.stale_reason||"")}</div>${x.next_review_at?`<div class="muted small">Next human review: ${new Date(x.next_review_at).toLocaleDateString()}</div>`:""}</div>${canReview?`<button class="btn alt" data-bw-onclick="reviewControlFreshness('${x.control_key}','${x.status}')">Review</button>`:'<span class="badge">Read only</span>'}</div></div>`).join("")||'<div class="muted small">No controls yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function verifyAuditIntegrity(){
  const box=document.getElementById("auditIntegrityDetail");if(!box)return;
  try{
    const [r,a]=await Promise.all([apiJson("/api/audit/integrity"),apiJson("/api/audit")]);
    document.getElementById("auditIntegrityStatus").textContent=String(r.status||"unknown").toUpperCase();
    document.getElementById("auditSealedCount").textContent=r.checkedEvents||0;
    document.getElementById("auditLegacyCount").textContent=r.legacyEvents||0;
    document.getElementById("auditFailureCount").textContent=a.unresolvedWriteFailures||0;
    box.safeHTML=`<div class="item"><b>${escapeHtml(r.status||"unknown")}</b><div class="muted small">${r.firstInvalidSeq?`First invalid sequence: ${r.firstInvalidSeq}`:"No chained-event mismatch detected."}</div>${r.lastHash?`<div class="audit">${escapeHtml(r.lastHash.slice(0,32))}…</div>`:""}</div>`;
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderControlLineageOptions(){
  const sel=document.getElementById("lineageControlSelect");if(!sel)return;
  try{
    const current=sel.value,r=await apiJson("/api/control-center"),items=r.items||[];
    sel.safeHTML=items.map(x=>`<option value="${escapeHtml(x.control_key)}">${escapeHtml(x.name)}</option>`).join("");
    if(current&&items.some(x=>x.control_key===current))sel.value=current;
  }catch(e){sel.safeHTML=""}
}
async function loadControlLineage(){
  const sel=document.getElementById("lineageControlSelect"),box=document.getElementById("lineageDetail");if(!sel||!box||!sel.value)return;
  try{
    const r=await apiJson(`/api/control-lineage/${encodeURIComponent(sel.value)}`),l=r.lineage||{},c=l.control||{};
    const block=(title,items,render)=>`<div class="item"><b>${title}</b>${items.length?items.map(render).join(""):'<div class="muted small">None recorded.</div>'}</div>`;
    box.safeHTML=`<div class="grid g3"><div class="card"><div class="kpi">Status</div><div class="score" style="font-size:24px">${escapeHtml(c.status||"—")}</div></div><div class="card"><div class="kpi">Assurance</div><div class="score" style="font-size:24px">${escapeHtml(c.assuranceLevel||"—")}</div></div><div class="card"><div class="kpi">Snapshots</div><div class="score">${(r.snapshots||[]).length}</div></div></div>
      <div style="margin-top:12px">${block("Mapped rules",l.rules||[],x=>`<div class="small">${escapeHtml(x.rule_key||x.id)} · v${escapeHtml(String(x.version||""))} · ${escapeHtml(x.status||"")}</div>`)}
      ${block("Evidence",l.evidence||[],x=>`<div class="small">${escapeHtml(x.display_name||x.id)} · ${escapeHtml(x.review_status||"")} ${x.content_sha256?`· ${escapeHtml(x.content_sha256.slice(0,12))}…`:""}</div>`)}
      ${block("Risk events",l.risks||[],x=>`<div class="small">${escapeHtml(x.severity||"")} · ${escapeHtml(x.title||"")} · ${escapeHtml(x.status||"")}</div>`)}
      ${block("Remediation",l.remediation||[],x=>`<div class="small">${escapeHtml(x.severity||"")} · ${escapeHtml(x.title||"")} · ${escapeHtml(x.status||"")}</div>`)}
      ${block("Human reviews",l.reviews||[],x=>`<div class="small">${escapeHtml(x.event_type||"")} · ${new Date(x.occurred_at).toLocaleString()}</div>`)}
      ${block("Assurance tests",l.assuranceTests||[],x=>`<div class="small">${escapeHtml(x.result_status||"")} · ${escapeHtml(x.freshness||"")} · ${new Date(x.tested_at).toLocaleString()}</div>`)}</div>`;
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

async function renderPlatformRegulatoryGovernance(){let status=null;try{status=await apiJson("/api/platform/regulatory/status")}catch(e){platformRegulatoryAccess=false;document.querySelectorAll(".platformRegulatoryOnly").forEach(x=>x.style.display="none");document.querySelector(".nav-specialist-tools")?.setAttribute("hidden","");applyRoleUi();return}platformRegulatoryAccess=["editor","reviewer","admin"].includes(String(status?.role||""));document.querySelectorAll(".platformRegulatoryOnly").forEach(x=>x.style.display=platformRegulatoryAccess?"":"none");const specialist=document.querySelector(".nav-specialist-tools");if(specialist){if(platformRegulatoryAccess)specialist.removeAttribute("hidden");else specialist.setAttribute("hidden","")}const importBtn=document.getElementById("foundationPackImportBtn");if(importBtn)importBtn.hidden=!["editor","admin"].includes(String(status?.role||""));applyRoleUi();renderFoundationPackStatus();const box=document.getElementById("platformRegSourceList");if(!box)return;try{const [s,r,c,o,ready]=await Promise.all([apiJson("/api/platform/regulatory/sources"),apiJson("/api/platform/regulatory/rules"),apiJson("/api/platform/regulatory/conflicts"),apiJson("/api/platform/regulatory/rollouts"),apiJson("/api/platform/regulatory/readiness")]);const ss=s.items||[],rr=r.items||[],cc=c.items||[],oo=o.items||[];document.getElementById("platformRegRole").textContent=String(status.role||"—").toUpperCase();document.getElementById("platformRegPendingSources").textContent=ss.filter(x=>x.status==="pending").length;document.getElementById("platformRegReviewRules").textContent=rr.filter(x=>x.status==="review").length;document.getElementById("platformRegQueuedRollouts").textContent=oo.filter(x=>["queued","running"].includes(x.status)).length;const readiness=document.getElementById("platformRegReadiness");if(readiness){const blockers=ready.blockers||[],labels={maker_checker_principals_required:"Provision at least two distinct regulatory principals with editor/reviewer capability.",foundation_pack_not_imported:"Import the Botswana Foundation Pack as pending sources and draft rules.",no_verified_approved_sources:"Capture current source snapshots and complete independent source approval.",no_published_rules:"Move validated rules through independent review and publication.",open_source_conflicts:"Resolve or explicitly keep conflicted topics blocked before automation."};const state=ready.makerCheckerReady&&ready.foundationPack?.imported&&ready.sources?.verifiedApproved>0&&ready.rules?.published>0?"good":"warn";readiness.className=`notice ${state}`;readiness.safeHTML=`<b>Publishing readiness: ${state==="good"?"ready":"setup required"}</b><div class="small">${ready.principals?.active||0} active principal(s) · ${ready.sources?.verifiedApproved||0} verified/approved source(s) · ${ready.rules?.published||0} published rule(s) · ${ready.openConflicts||0} open conflict(s).</div>${blockers.length?`<ul class="small">${blockers.map(x=>`<li>${escapeHtml(labels[x]||x)}</li>`).join("")}</ul>`:""}`};box.safeHTML=ss.slice(0,25).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.authority)} · ${escapeHtml(x.status)} · snapshot ${x.latest_snapshot_version||0} · ${escapeHtml(x.verification_status||"unverified")}</div></div>`).join("")||'<div class="muted small">No sources.</div>';document.getElementById("platformRegRuleList").safeHTML=rr.slice(0,25).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">v${x.version} · ${escapeHtml(x.status)} · ${escapeHtml(x.confidence)}</div></div>`).join("")||'<div class="muted small">No rules.</div>';document.getElementById("platformRegConflictList").safeHTML=cc.filter(x=>x.status==="open").slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.topic_key)}</b><div class="small">${escapeHtml(x.description||"")}</div></div>`).join("")||'<div class="muted small">No open conflicts.</div>';document.getElementById("platformRegRolloutList").safeHTML=oo.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.rule_title)}</b><div class="muted small">${escapeHtml(x.status)} · ${x.tenants_evaluated||0} evaluated · ${x.obligations_created||0} obligations · ${x.tenants_failed||0} failures</div></div>`).join("")||'<div class="muted small">No rollouts.</div>';}catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}}

async function importFoundationPack(){
  const confirmed=await BW.dialog.confirm({title:"Import Botswana Foundation Pack?",message:"Import the Botswana Foundation Pack as PENDING sources, DRAFT rules and conflict records? Nothing will be approved or published automatically.",confirmLabel:"Import draft pack"});if(!confirmed)return;
  try{
    const r=await apiJson("/api/platform/regulatory/foundation-pack/import",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    document.getElementById("foundationPackStatus").textContent=`Imported v${r.version}: ${r.sourcesCreated} sources, ${r.rulesCreated} rules, ${r.conflictsCreated} conflicts`;
    await renderPlatformRegulatoryGovernance();
  }catch(e){notifyUser(e.message)}
}
async function renderFoundationPackStatus(){
  const el=document.getElementById("foundationPackStatus");if(!el)return;
  try{
    const r=await apiJson("/api/platform/regulatory/foundation-pack"),last=(r.imports||[])[0];
    el.textContent=last?`Imported v${r.pack.version} · ${new Date(last.created_at).toLocaleString()}`:`Ready to import v${r.pack.version}`;
  }catch(e){el.textContent="Unavailable"}
}

async function recalculateStatutoryCalendar(){try{await apiJson("/api/statutory-calendar/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderStatutoryCalendar();await renderComplianceObligations();await renderUnifiedNextActions()}catch(e){notifyUser(e.message)}}
async function renderStatutoryCalendar(){const list=document.getElementById("statCalendarList"),setup=document.getElementById("statCalendarSetup");if(!list||!setup)return;try{const r=await apiJson("/api/statutory-calendar"),items=r.obligations||[],schedules=r.schedules||[],now=Date.now(),active=items.filter(x=>x.due_at),within30=active.filter(x=>{const d=(new Date(x.due_at+"T23:59:59Z").getTime()-now)/86400000;return d>=0&&d<=30}),need=schedules.filter(x=>x.config_status==="needs_input");document.getElementById("statCalUpcoming").textContent=active.length;document.getElementById("statCal30").textContent=within30.length;document.getElementById("statCalNeeds").textContent=need.length;document.getElementById("statCalNext").textContent=active.length?new Date(active[0].due_at+"T00:00:00Z").toLocaleDateString():"—";list.safeHTML=active.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.rule_title)} · due ${new Date(x.due_at+"T00:00:00Z").toLocaleDateString()} · ${escapeHtml(x.schedule_type||"")}</div></div>`).join("")||'<div class="muted small">No recurring statutory obligations generated yet. Published rules are required.</div>';setup.safeHTML=need.map(x=>{let miss=[];try{miss=JSON.parse(x.missing_fields_json||"[]")}catch{}return `<div class="item"><b>${escapeHtml(x.rule_title)}</b><div class="small">Missing: ${escapeHtml(miss.join(", ")||"company information")}</div></div>`}).join("")||'<div class="notice good">No statutory schedule setup gaps detected.</div>'}catch(e){list.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}}

let latestInspectionPackId=null;
async function runInspectionScenario(key){
  if(currentWorkspaceRole()==="auditor"){notifyUser("Auditor access is read-only for inspection simulations.");return false}
  const detail=document.getElementById("inspectionSimulationDetail");
  try{
    const pack=await apiJson("/api/inspection-packs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scenarioKey:key})});
    const r=pack.simulation;latestInspectionPackId=pack.id;
    detail.safeHTML=`<div class="item"><b>${escapeHtml(r.scenario.name)}</b><div class="score" style="font-size:36px">${r.coverageStatus==="insufficient"?"N/A":r.readinessScore}</div><div class="muted small">${escapeHtml(r.readinessBand)} · coverage ${escapeHtml(r.coverageStatus)}</div><div class="small">${escapeHtml(r.scenario.disclaimer)}</div></div>`+
      (r.findings||[]).slice(0,12).map(f=>`<div class="item"><b>${escapeHtml(f.severity)} · ${escapeHtml(f.title)}</b><div class="small">${escapeHtml(f.rationale)}</div><div class="muted small">Action: ${escapeHtml(f.recommendedAction)}</div></div>`).join("");
    await renderInspectionReadiness();
  }catch(e){detail.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

async function createEmploymentDefensePack(caseId){
  try{
    const r=await apiJson("/api/defense-packs/employment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({caseId})});
    notifyUser(`Defense Pack ${r.status}. Approved evidence: ${r.evidenceCount}. Gaps: ${r.gapCount}.`);
    await renderDefensePacks();
  }catch(e){notifyUser(e.message)}
}
async function renderDefensePacks(){
  const box=document.getElementById("defensePackList");if(!box)return;
  try{
    const r=await apiJson("/api/defense-packs");
    box.safeHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.label)}</b><div class="muted small">${escapeHtml(x.status)} · ${x.evidence_count} approved evidence item(s) · ${x.gap_count} gap(s) · ${new Date(x.created_at).toLocaleString()}</div><div class="audit">${escapeHtml(String(x.content_hash||"").slice(0,24))}…</div></div>`).join("")||'<div class="muted small">No defense packs yet.</div>';
  }catch(e){box.safeHTML=`<div class="muted small">${escapeHtml(e.message)}</div>`}
}


async function linkDefenseEvidence(){
  const caseId=document.getElementById("defenseCaseSelect")?.value,evidenceId=document.getElementById("defenseEvidenceSelect")?.value,relationship=document.getElementById("defenseEvidenceRelationship")?.value||"supporting";
  if(!caseId||!evidenceId){notifyUser("Choose an open HR case and approved evidence.");return}
  try{
    await apiJson(`/api/hr/cases/${caseId}/evidence-link`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({evidenceId,relationship})});
    notifyUser("Evidence linked to HR case.");await renderDefensePacks();
  }catch(e){notifyUser(e.message)}
}


async function renderBusinessEvents(){
  const box=document.getElementById("businessEventList");if(!box)return;
  try{
    const r=await apiJson("/api/business-events"),items=r.items||[];
    document.getElementById("businessEventCount").textContent=items.length;
    document.getElementById("businessEventProcessing").textContent=items.filter(x=>x.status==="processing"||x.status==="queued").length;
    document.getElementById("businessEventPartial").textContent=items.filter(x=>x.status==="partial").length;
    document.getElementById("businessEventFailed").textContent=items.filter(x=>x.status==="failed").length;
    box.safeHTML=items.slice(0,50).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.event_type.replaceAll("_"," "))}</b><div class="muted small">${escapeHtml(x.event_category)} · ${escapeHtml(x.status)} · ${new Date(x.occurred_at).toLocaleString()}</div></div><div><button class="btn alt" data-bw-onclick="viewBusinessEvent('${x.id}')">Impact Map</button>${x.status==="failed"?`<button class="btn alt" data-bw-onclick="retryBusinessEvent('${x.id}')">Retry</button>`:""}</div></div></div>`).join("")||'<div class="muted small">No business events yet.</div>';
  }catch(e){box.safeHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}

async function viewBusinessEvent(id){
  const box=document.getElementById("businessEventImpactDetail");if(!box)return;
  try{
    const r=await apiJson(`/api/business-events/${id}`),impacts=r.impacts||[],effects=r.effects||[];
    box.safeHTML=`<div class="notice"><b>Impact Map</b><div class="small">Shows what the event caused the protection engine to re-evaluate; it is not proof that every external legal consequence has been identified.</div></div>`+
      impacts.map(x=>`<div class="item"><b>${escapeHtml(x.impact_level)} · ${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.impact_type)}</div><div class="small">${escapeHtml(x.explanation)}</div></div>`).join("")+
      `<div class="item"><b>Processing effects</b>${effects.map(e=>`<div class="small">${e.sequence_no}. ${escapeHtml(e.effect_type)} · ${escapeHtml(e.status)}${e.last_error?` · ${escapeHtml(e.last_error)}`:""}</div>`).join("")}</div>`;
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

async function retryBusinessEvent(id){
  try{await apiJson(`/api/business-events/${id}/retry`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderBusinessEvents()}catch(e){notifyUser(e.message)}
}
async function reportBusinessEvent(){
  const eventType=document.getElementById("manualBusinessEventType")?.value,reason=document.getElementById("manualBusinessEventReason")?.value||"";
  try{
    await apiJson("/api/business-events/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventType,reason})});
    document.getElementById("manualBusinessEventReason").value="";await renderBusinessEvents();await renderRiskEvents();await renderStatutoryCalendar();
  }catch(e){notifyUser(e.message)}
}


async function renderPartnerActionCenter(){
  const feed=document.getElementById("partnerActionFeed");if(!feed)return;
  try{
    const r=await apiJson("/api/partner/action-center"),actions=r.actions||[],tasks=r.tasks||[];
    document.getElementById("partnerActionUrgent").textContent=actions.filter(x=>x.urgency==="urgent").length;
    document.getElementById("partnerActionAction").textContent=actions.filter(x=>x.urgency==="action").length;
    document.getElementById("partnerActionReview").textContent=actions.filter(x=>x.urgency==="review").length;
    const clients=[...new Map(actions.map(x=>[x.clientTenantId,x.clientName])).entries()];
    document.getElementById("partnerActionClients").textContent=clients.length;
    const sel=document.getElementById("partnerImpactClient");if(sel)sel.safeHTML=clients.map(([id,name])=>`<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
    feed.safeHTML=actions.slice(0,100).map(x=>`<div class="item"><b>${escapeHtml(x.urgency)} · ${escapeHtml(x.clientName)}</b><div class="small">${escapeHtml(x.title)}</div><div class="muted small">${escapeHtml(x.explanation||"")} ${x.dueAt?`· Due ${new Date(x.dueAt).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No active portfolio actions.</div>';
    document.getElementById("partnerTaskQueue").safeHTML=tasks.slice(0,100).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.client_name||x.client_tenant_id)} · ${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.status)} · source ${escapeHtml(x.source_status||"unknown")} · priority ${x.priority}</div></div><select data-bw-onchange="setPartnerTaskStatus('${x.id}',this.value)"><option value="open" ${x.status==="open"?"selected":""}>Open</option><option value="review" ${x.status==="review"?"selected":""}>Review</option><option value="blocked" ${x.status==="blocked"?"selected":""}>Blocked</option><option value="done" ${x.status==="done"?"selected":""}>Done</option></select></div></div>`).join("")||'<div class="muted small">Refresh to create the partner work queue.</div>';
  }catch(e){feed.safeHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}
async function refreshPartnerActionCenter(){
  try{await apiJson("/api/partner/action-center/refresh",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderPartnerActionCenter()}catch(e){notifyUser(e.message)}
}
async function setPartnerTaskStatus(id,status){
  try{await apiJson(`/api/partner/tasks/${id}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderPartnerActionCenter()}catch(e){notifyUser(e.message)}
}
async function loadPartnerClientImpact(){
  const clientId=document.getElementById("partnerImpactClient")?.value,box=document.getElementById("partnerClientImpactDetail");if(!clientId||!box)return;
  try{
    const r=await apiJson(`/api/partner/action-center/clients/${encodeURIComponent(clientId)}`),score=r.score||{};
    box.safeHTML=`<div class="grid g3"><div class="card"><div class="kpi">Protection score</div><div class="score">${score.score??"—"}</div></div><div class="card"><div class="kpi">Grade</div><div class="score">${escapeHtml(score.grade||"—")}</div></div><div class="card"><div class="kpi">Actions</div><div class="score">${(r.actions||[]).length}</div></div></div>`+
      (r.actions||[]).slice(0,30).map(x=>`<div class="item"><b>${escapeHtml(x.urgency)} · ${escapeHtml(x.title)}</b><div class="small">${escapeHtml(x.explanation||"")}</div></div>`).join("")+
      `<div class="item"><b>Recent regulatory impacts</b>${(r.regulatoryImpacts||[]).slice(0,20).map(x=>`<div class="small">${escapeHtml(x.impact_level)} · ${escapeHtml(x.rule_title)} · ${escapeHtml(x.status)}</div>`).join("")||'<div class="muted small">None.</div>'}</div>`+
      `<div class="item"><b>Recent inspection readiness</b>${(r.inspections||[]).slice(0,10).map(x=>`<div class="small">${escapeHtml(x.name)} · ${x.coverage_status==="insufficient"?"N/A":x.readiness_score} · ${escapeHtml(x.readiness_band)}</div>`).join("")||'<div class="muted small">None.</div>'}</div>`;
  }catch(e){box.safeHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


function publicPassportHashToken(){
  const raw=String(location.hash||"");
  if(!raw.startsWith("#passport="))return null;
  try{return decodeURIComponent(raw.slice("#passport=".length))}catch{return null}
}
async function handlePublicPassportFragment(){
  const token=publicPassportHashToken();if(!token)return false;
  history.replaceState(null,"",location.pathname+location.search);
  marketingGate.classList.add("hidden");authGate.classList.add("hidden");concealWorkspaceShell();syncMobileRoleNav("");
  const gate=document.getElementById("publicPassportGate"),box=document.getElementById("publicPassportResult");
  if(!gate||!box){console.error("Public passport verification surface is unavailable.");showMarketing();return true}
  gate.classList.remove("hidden");
  try{
    const r=await publicApiClient.request("/public/passport/verify",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",referrerPolicy:"no-referrer",body:JSON.stringify({shareToken:token})});
    const controls=r.controls||[],receipt=r.receipt||{};
    box.safeHTML=`<div class="notice"><b>Verification receipt ${escapeHtml(receipt.code||"")}</b><div class="small">Status recorded at ${escapeHtml(r.generatedAt||"")}. Snapshot SHA-256: <span class="audit">${escapeHtml(receipt.snapshotHash||"")}</span></div></div>`+
      `${r.companyName?`<h2 style="margin-top:14px">${escapeHtml(r.companyName)}</h2>`:""}`+
      `${r.score?`<div class="card" style="margin-top:12px"><div class="kpi">Passport score</div><div class="score">${r.score.score}%</div><div class="muted small">${r.score.verified}/${r.score.total} current verified controls</div></div>`:""}`+
      `<div style="margin-top:12px">${controls.map(c=>`<div class="item"><b>${escapeHtml(c.controlKey)}</b><div class="muted small">${escapeHtml(c.status)}${c.verifiedAt?` · verified ${new Date(c.verifiedAt).toLocaleString()}`:""}${c.expiresAt?` · review/expiry ${new Date(c.expiresAt).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No controls were included.</div>'}</div>`+
      `<div class="muted small" style="margin-top:12px">${escapeHtml(r.disclaimer||"")}</div>`;
  }catch(e){box.safeHTML=`<div class="notice bad"><b>Passport could not be verified.</b><div class="small">${escapeHtml(e.message)}</div></div>`}
  return true;
}
function leavePublicPassport(){document.getElementById("publicPassportGate")?.classList.add("hidden");showMarketing()}


const WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT=12;
const WORKSPACE_VIEW_FRAGMENT_PREFIX="/assets/workspace-view-fragments-20260923f-";
const workspaceViewShardPromises=new Map();
let workspaceViewNavigationEpoch=0;
function workspaceViewShard(id){
  let hash=0;
  const value=String(id||"");
  for(let i=0;i<value.length;i++)hash=(Math.imul(hash,31)+value.charCodeAt(i))>>>0;
  return hash%WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT;
}
const workspaceFragmentClient=window.BW?.api?.createClient?.({timeoutMs:6000,retries:1})||null;
async function fetchWorkspaceViewShard(asset,shard){
  if(!workspaceFragmentClient)throw new Error("Workspace fragment transport is unavailable.");
  const payload=await workspaceFragmentClient.request(asset,{method:"GET"});
  if(!payload||payload.schema!==2||payload.shard!==shard||!payload.views||typeof payload.views!=="object")throw new Error("Workspace view shard is invalid.");
  return payload.views;
}
async function workspaceViewFragments(id){
  const shard=workspaceViewShard(id);
  if(workspaceViewShardPromises.has(shard))return workspaceViewShardPromises.get(shard);
  const asset=WORKSPACE_VIEW_FRAGMENT_PREFIX+shard+".json";
  const promise=fetchWorkspaceViewShard(asset,shard).catch(error=>{workspaceViewShardPromises.delete(shard);throw error});
  workspaceViewShardPromises.set(shard,promise);
  return promise;
}
function lazyWorkspaceViewLabel(id){
  const meta=typeof COMMAND_META!=="undefined"?COMMAND_META[id]:null;
  const nav=document.querySelector('[data-view="'+String(id||"")+'"]');
  return String(meta?.[0]||nav?.textContent?.trim()||"Workspace");
}
function setLazyWorkspaceMessage(target,title,detail,bad=false){
  if(!target)return;
  target.replaceChildren();
  const card=document.createElement("div");
  card.className=bad?"notice bad":"card";
  const heading=document.createElement("h2");
  heading.textContent=String(title||"");
  const copy=document.createElement("div");
  copy.className="muted small";
  copy.textContent=String(detail||"");
  card.append(heading,copy);
  target.append(card);
}
function activateLazyWorkspacePlaceholder(id,target){
  lastWorkspaceView=id;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  target.classList.add("active");
  document.querySelectorAll(".nav button").forEach(b=>{
    const active=b.dataset.view===id;
    b.classList.toggle("active",active);
    if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
  });
  const label=lazyWorkspaceViewLabel(id);
  const pageTitle=document.getElementById("pageTitle");
  if(pageTitle)pageTitle.textContent=label;
  updateMobileNav(id);
  const status=document.getElementById("srStatus");
  if(status)status.textContent="Loading "+label+"…";
  setLazyWorkspaceMessage(target,"Loading "+label+"…","Fetching this workspace area.");
  window.scrollTo({top:0,behavior:prefersReducedMotion()?"auto":"smooth"});
}
async function hydrateLazyWorkspaceView(id,target,options={}){
  if(!target||target.dataset.lazyView!=="1")return false;
  if(target.dataset.lazyLoading==="1")return true;
  target.dataset.lazyLoading="1";
  delete target.dataset.lazyError;
  target.setAttribute("aria-busy","true");
  const status=document.getElementById("srStatus");
  if(status)status.textContent="Loading "+String(id||"workspace")+"…";
  try{
    const views=await workspaceViewFragments(id);
    const markup=Object.prototype.hasOwnProperty.call(views,id)?views[id]:null;
    if(typeof markup!=="string")throw new Error("Workspace view is unavailable.");
    if(!window.BW?.dom?.renderMarkup)throw new Error("Workspace DOM safety layer is unavailable.");
    window.BW.dom.renderMarkup(target,markup);
    target.dataset.lazyHydrated="1";
    delete target.dataset.lazyError;
    target.removeAttribute("data-lazy-view");
    target.removeAttribute("data-lazy-view-id");
    target.setAttribute("aria-busy","false");
    delete target.dataset.lazyLoading;
    const requestedEpoch=Number(target.dataset.lazyNavigationEpoch||0);
    delete target.dataset.lazyNavigationEpoch;
    if(requestedEpoch!==workspaceViewNavigationEpoch)return true;
    return showView(id,{...options,lazyHydrated:true,preserveNavigationEpoch:true});
  }catch(error){
    target.setAttribute("aria-busy","false");
    delete target.dataset.lazyLoading;
    console.error("workspace_lazy_view_hydration_failed",{view:id,error});
    if(Number(target.dataset.lazyNavigationEpoch||0)===workspaceViewNavigationEpoch){
      target.dataset.lazyError="1";
      const label=lazyWorkspaceViewLabel(id);
      setLazyWorkspaceMessage(target,label+" could not be loaded","Try this section again. The previous workspace view is no longer being shown.",true);
      if(status)status.textContent="This workspace area could not be loaded. Try again.";
    }
    return false;
  }
}

let lastWorkspaceView="dashboard";
function showView(id,options={}){if(!roleCanView(id)){console.warn("Role denied view",id,currentWorkspaceRole());if(!options?.silent){let sr=document.getElementById("srStatus");if(sr)sr.textContent="This area is not available for your role."}return false}const target=document.getElementById(id);if(!target){console.warn("Unknown view",id);return false}const workspaceNavigationEpoch=options?.preserveNavigationEpoch===true?workspaceViewNavigationEpoch:++workspaceViewNavigationEpoch;if(target.dataset.lazyView==="1"&&options?.lazyHydrated!==true){target.dataset.lazyNavigationEpoch=String(workspaceNavigationEpoch);activateLazyWorkspacePlaceholder(id,target);void hydrateLazyWorkspaceView(id,target,options);return true}lastWorkspaceView=id;document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));target.classList.add("active");document.querySelectorAll(".nav button").forEach(b=>{let active=b.dataset.view===id;b.classList.toggle("active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});const nb=document.querySelector(`[data-view="${id}"]`),meta=(typeof COMMAND_META!=="undefined"?COMMAND_META[id]:null);document.getElementById("pageTitle").textContent=meta?.[0]||nb?.textContent?.trim()||"BW Compliance OS";updateMobileNav(id);let sr=document.getElementById("srStatus");if(sr)sr.textContent="Opened "+document.getElementById("pageTitle").textContent;window.scrollTo({top:0,behavior:prefersReducedMotion()?"auto":"smooth"});setTimeout(animateViewItems,20);if(!options?.skipDataRefresh&&!options?.roleRedirect)queueMicrotask(()=>renderAll());if(!STANDALONE_PREVIEW&&!options?.skipDataRefresh&&!options?.roleRedirect){if(id==="billing")queueMicrotask(()=>void loadBilling());if(id==="audit")queueMicrotask(()=>void hydrateWorkspaceAudit())}return true}

let wizardStep=0;
let firstValueTopTarget="workhub";
function scheduleOwnerOnboarding(){
 const eligible=()=>currentUser?.role==="owner"&&currentUser?.onboardingComplete===false&&safeSessionGet("bw_onboarding_dismissed")!=="1";
 if(!eligible())return false;
 const afterReady=()=>{
  const openWhenIdle=()=>{
   if(!eligible()||window.__THEBE_WORKSPACE_READY__!==true)return;
   openOnboarding();
  };
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(typeof requestIdleCallback==="function")requestIdleCallback(openWhenIdle,{timeout:1500});
   else setTimeout(openWhenIdle,600);
  }));
 };
 window.whenThebeWorkspaceReady(afterReady);
 return true;
}
function openOnboarding(){
 if(currentWorkspaceRole()!=="owner"){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Only the account owner can complete initial business setup.";return false}
 wizardStep=0;loadWizard();if(wizardInlineError){wizardInlineError.textContent="";wizardInlineError.classList.remove("show")}renderWizard();openModal("onboardModal")
}
function dismissOnboarding(){safeSessionSet("bw_onboarding_dismissed","1");closeModal("onboardModal")}
function loadWizard(){
 let p=state.profile||{};
 wName.value=p.name||currentUser?.tenantName||"My Business";const d=document.getElementById("wizardCompanyNameDisplay");if(d)d.textContent=wName.value;
 wIncorporationDate.value=p.incorporationDate||"";wEntityType.value=p.entityType||"";wIndustry.value=p.industry&&p.industry!=="Other"?p.industry:"Retail";wTown.value=p.town||"";wEmployees.value=p.employees??0;wTurnover.value=p.turnover??"";
 wPaye.value=confirmedStatus(p,"paye");wVat.value=confirmedStatus(p,"vat");wTrade.value=confirmedStatus(p,"trade");wVatCategory.value=p.vatCategory||"";wCitizen.value=String(p.citizenOwned!==false);
 wPremises.checked=!!p.premises;wTradeAnniversary.value=p.tradeAnniversary||"";wManufacturing.checked=!!p.manufacturing;wData.checked=!!p.data;wTender.checked=!!p.tender;wCipaMonth.value=p.cipaMonth||"";
}
function renderWizard(){
 document.querySelectorAll("#onboardModal .wizardstep").forEach((x,i)=>x.classList.toggle("active",i===wizardStep));
 wizardProgress.querySelector("span").style.width=((wizardStep+1)/2*100)+"%";
 wizardBack.disabled=wizardStep===0;wizardNext.textContent=wizardStep===1?"Show my first check":"Next";
 if(wizardStep===1&&wizardReview){
  const facts=[wPremises.checked?"premises":null,wManufacturing.checked?"manufacturing":null,wData.checked?"customer data":null,wTender.checked?"tenders":null].filter(Boolean);
  wizardReview.safeHTML=`<b>Ready for your first protection check</b><div class="small">${escapeHtml(wName.value||"Your business")} · ${escapeHtml(wIndustry.value||"Industry not set")} · ${Number(wEmployees.value||0)} employee(s)${facts.length?` · ${escapeHtml(facts.join(", "))}`:""}. VAT, PAYE and trade/licence status will remain “Not confirmed” until you explicitly confirm them.</div>`;
 }
}
function wizardMove(dir){
 if(wizardInlineError){wizardInlineError.textContent="";wizardInlineError.classList.remove("show")}
 if(dir>0&&wizardStep===0&&!wEntityType.value){if(wizardInlineError){wizardInlineError.textContent="Choose the legal entity type so BW can select entity-specific work without guessing.";wizardInlineError.classList.add("show")}return}
 if(dir>0&&wizardStep===0&&(!String(wIndustry.value||"").trim()||Number(wEmployees.value)<0)){if(wizardInlineError){wizardInlineError.textContent="Add the industry and a valid employee count.";wizardInlineError.classList.add("show")}return}
 if(dir>0&&wizardStep===1){saveWizard();return}
 wizardStep=Math.max(0,Math.min(1,wizardStep+dir));renderWizard()
}
function firstValueFactRows(){
 const p=state?.profile||{},rows=[];
 if(confirmedStatus(p,"vat")==="unknown")rows.push(["VAT registration","Confirm the business's actual BURS VAT registration status before VAT filing actions are enabled.","taxprofile"]);
 if(Number(p.employees||0)>0&&confirmedStatus(p,"paye")==="unknown")rows.push(["PAYE registration","You have employees recorded. Confirm actual PAYE registration/status; BW will not infer it from headcount or salary thresholds.","taxprofile"]);
 if(confirmedStatus(p,"trade")==="unknown")rows.push(["Trade / business licence","Confirm whether an authority-issued licence or registration is held or needs tracking. BW will not infer legal applicability from industry alone.","licenceos"]);
 if(!p.cipaMonth&&["company","business_name"].includes(String(p.entityType||"")))rows.push(["CIPA timing","Add the authority-confirmed annual-return or renewal month when known.","corporate"]);
 return rows;
}
function renderFirstValueResult(items=[],meta={}){
 const panel=document.getElementById("firstValuePanel"),box=document.getElementById("firstValueActions"),confirm=document.getElementById("firstValueConfirmations"),status=document.getElementById("firstValueStatus"),title=document.getElementById("firstValueTitle"),intro=document.getElementById("firstValueIntro");if(!panel||!box||!confirm)return;
 panel.classList.add("show");const rows=Array.isArray(items)?items:[];const first=rows[0];firstValueTopTarget=first?(HOME_ACTION_META[first.source]?.target||"workhub"):"workhub";
 if(status){status.className="badge good first-value-status";status.textContent="Ready"}if(title)title.textContent=rows.length?`${rows.length} current action${rows.length===1?"":"s"} surfaced`:`No server action surfaced yet`;
 if(intro)intro.textContent=rows.length?"Start with the highest-priority server-backed work below. Unknown facts remain confirmation tasks, not compliance conclusions.":"An empty action queue is not a legal all-clear. Confirm the unresolved facts below and add dates/evidence as they become known.";
 box.safeHTML=rows.slice(0,3).map(x=>{const m=HOME_ACTION_META[x.source]||{target:"workhub",label:"Open work"},proofMissing=Number(x.proofMissing||0),proofDirect=x.source==="regulatory"&&proofMissing>0;return `<div class="first-value-item"><span><b>${escapeHtml(x.title||"Action")}</b><small>${escapeHtml((x.status||"Open")+(x.dueAt?` · due ${new Date(x.dueAt).toLocaleDateString()}`:""))}${proofDirect?` · ${proofMissing} proof gap${proofMissing===1?"":"s"}`:""}</small></span><span>${x.source==="regulatory"?`<button class="btn proof-direct" type="button" data-bw-onclick="openActionProof('regulatory','${safeId(x.id)}')">${proofDirect?"Add proof":"Work action"}</button>`:""}<button class="btn soft" type="button" data-bw-onclick="showView('${m.target}')">${escapeHtml(m.label)}</button></span></div>`}).join("")||'<div class="notice"><b>No generated action yet</b><div class="small">Do not treat this as all clear. Confirm the facts on the right and review Work & deadlines after adding authoritative dates or evidence.</div></div>';
 const facts=firstValueFactRows();confirm.safeHTML=facts.length?facts.slice(0,4).map(x=>`<div class="first-value-item"><span><b>${escapeHtml(x[0])}</b><small>${escapeHtml(x[1])}</small></span><button class="btn soft" type="button" data-bw-onclick="showView('${x[2]}')">Confirm</button></div>`).join(""):'<div class="notice good"><b>Quick-start facts confirmed</b><div class="small">Continue adding authority-confirmed dates and evidence as needed.</div></div>';
}
function renderFirstValueFailure(message){const panel=document.getElementById("firstValuePanel"),box=document.getElementById("firstValueActions"),confirm=document.getElementById("firstValueConfirmations"),status=document.getElementById("firstValueStatus"),title=document.getElementById("firstValueTitle");if(panel)panel.classList.add("show");if(status){status.className="badge bad first-value-status";status.textContent="Needs retry"}if(title)title.textContent="Your business facts are saved; the first check did not finish";if(box)box.safeHTML=`<div class="notice bad"><b>Protection check unavailable</b><div class="small">${escapeHtml(message||"The server check could not complete.")} No compliance conclusion has been assumed. Retry when connectivity is stable.</div></div>`;const facts=firstValueFactRows();if(confirm)confirm.safeHTML=facts.length?facts.map(x=>`<div class="first-value-item"><span><b>${escapeHtml(x[0])}</b><small>${escapeHtml(x[1])}</small></span><button class="btn soft" type="button" data-bw-onclick="showView('${x[2]}')">Confirm</button></div>`).join(""):'<div class="muted small">No additional quick-start fact is currently flagged.</div>'}
function openFirstValueTopAction(){showView(firstValueTopTarget||"workhub")}
async function runFirstProtectionCheck(){
 if(currentWorkspaceRole()!=="owner")return false;const panel=document.getElementById("firstValuePanel"),box=document.getElementById("firstValueActions"),status=document.getElementById("firstValueStatus"),title=document.getElementById("firstValueTitle");if(panel)panel.classList.add("show");if(status){status.className="badge warn first-value-status";status.textContent="Checking"}if(title)title.textContent="Turning your business facts into the first actions";if(box)box.safeHTML='<div class="muted small">Checking current published rules and statutory schedules. This does not invent obligations from unknown facts…</div>';
 try{
  if(STANDALONE_PREVIEW){const local=applicable().filter(r=>/Action required|gaps|due|verify|review/i.test(r.status())).slice(0,4).map(r=>({source:"regulatory",title:r.title,status:r.status()}));renderFirstValueResult(local,{preview:true});return true}
  const rulesResponse=await apiJson("/api/regulatory/rules"),published=(rulesResponse.items||[]).filter(x=>x.status==="published").slice(0,200);let failed=0;
  for(let i=0;i<published.length;i+=4){const results=await Promise.allSettled(published.slice(i,i+4).map(r=>apiJson(`/api/regulatory/rules/${encodeURIComponent(r.id)}/evaluate`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"})));failed+=results.filter(x=>x.status==="rejected").length}
  try{await apiJson("/api/statutory-calendar/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})}catch(_){failed++}
  const next=await apiJson("/api/next-actions"),items=next.items||[];renderFirstValueResult(items,{failed});const now=new Date().toISOString();updateActiveCompany(c=>{c.profile={...c.profile,firstProtectionCheckStatus:failed?"pending":"complete",firstProtectionCheckAt:failed?null:now}});
  try{await persistWorkspaceState()}catch(e){console.warn("First check metadata save failed",e)}
  await Promise.allSettled([renderUnifiedNextActions(),renderHomeDecisionSignals(),renderWorkHub(),renderOnboardingBanner()]);return failed===0
 }catch(e){updateActiveCompany(c=>{c.profile={...c.profile,firstProtectionCheckStatus:"pending"}});renderFirstValueFailure(e.message||String(e));renderOnboardingBanner();return false}
}
async function saveWizard(){
 if(currentWorkspaceRole()!=="owner")return false;if(wizardInlineError){wizardInlineError.textContent="";wizardInlineError.classList.remove("show")};const btn=document.getElementById("wizardNext");if(btn){btn.disabled=true;btn.textContent="Saving…"}
 const prior=state.profile||{},payeStatus=String(wPaye.value||confirmedStatus(prior,"paye")),vatStatus=String(wVat.value||confirmedStatus(prior,"vat")),tradeStatus=String(wTrade.value||confirmedStatus(prior,"trade"));
 const profile={...prior,name:wName.value.trim()||"Unnamed Business",incorporationDate:wIncorporationDate.value||"",entityType:wEntityType.value||"",industry:wIndustry.value,town:wTown.value.trim(),employees:+wEmployees.value||0,turnover:optionalNonNegativeNumber(wTurnover),paye:statusBoolean(payeStatus),payeStatus,vat:statusBoolean(vatStatus),vatStatus,vatCategory:wVatCategory.value||"",trade:statusBoolean(tradeStatus),tradeStatus,citizenOwned:wCitizen.value==="true",premises:!!wPremises.checked,tradeAnniversary:wTradeAnniversary.value,manufacturing:!!wManufacturing.checked,mfgActivity:prior.mfgActivity||"",mfgFactory:!!prior.mfgFactory,mfgAnniversary:prior.mfgAnniversary||"",data:!!wData.checked,tender:!!wTender.checked,cipaMonth:wCipaMonth.value,cipaUin:prior.cipaUin||"",cipaStatus:prior.cipaStatus||"",registeredOffice:prior.registeredOffice||"",firstProtectionCheckStatus:"pending",firstProtectionCheckAt:null};updateActiveCompany(c=>{c.profile=profile});
 try{await persistWorkspaceState();await apiJson("/api/account/onboarding/complete",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});if(currentUser)currentUser.onboardingComplete=true;safeSessionSet("bw_onboarding_dismissed","0");logEvent("GUIDED_SETUP_COMPLETED",{industry:state.profile.industry,employees:state.profile.employees});closeModal("onboardModal");renderAll();showView("dashboard",{skipDataRefresh:true});await runFirstProtectionCheck()}
 catch(e){if(wizardInlineError){wizardInlineError.textContent=`Your setup was not marked complete: ${e.message||e}. Your answers remain on screen so you can retry safely.`;wizardInlineError.classList.add("show")}}
 finally{if(btn){btn.disabled=false;btn.textContent="Show my first check"}}
}


function showSyncError(msg){let el=document.getElementById("globalConflictBanner");if(el){el.style.display="block";el.safeHTML=`<b>Sync problem</b><div class="small">${escapeHtml(msg)}. Changes remain in memory until this page is closed; retry after connectivity returns.</div>`}}
async function apiFetch(url,opts={}){return apiJson(url,opts)}

function syncMarketingSessionActions(){
 const canResume=isWorkspaceRole(currentUser?.role);
 document.querySelectorAll('#marketingGate [data-guest-action]').forEach(el=>{el.hidden=canResume});
 document.querySelectorAll('#marketingGate .marketing-session-action').forEach(el=>{el.hidden=!canResume});
}
function showMarketing(){const rp=document.getElementById("roleAccessPortal");if(rp)rp.style.display="none";marketingGate.classList.remove("hidden");authGate.classList.add("hidden");concealWorkspaceShell();syncMobileRoleNav("");syncMarketingSessionActions()}
function hideMarketing(){marketingGate.classList.add("hidden")}
function returnToPublicWebsite(){
 const active=document.querySelector('.view.active')?.id;if(active&&roleCanView(active))lastWorkspaceView=active;
 closeCommandPalette?.();showMarketing();
 const gate=document.getElementById('marketingGate');if(gate)gate.scrollTop=0;
 let sr=document.getElementById('srStatus');if(sr)sr.textContent='Opened the public website. Your workspace session is still signed in.';
}
function returnToWorkspace(){
 const role=currentWorkspaceRole();if(!isWorkspaceRole(role)){openAuthFromMarketing('login');return false}
 marketingGate.classList.add('hidden');authGate.classList.add('hidden');const rp=document.getElementById('roleAccessPortal');if(rp)rp.style.display='none';revealWorkspaceShell();syncMobileRoleNav(role);applyRoleUi();
 const target=roleCanView(lastWorkspaceView,role)?lastWorkspaceView:roleLandingView(role);if(target)showView(target,{roleRedirect:true});
 return true;
}
function openAuthFromMarketing(mode="register"){hideMarketing();showAuth();setAuthMode(mode);if(mode==="register")setTimeout(()=>authCompany.focus(),50);else setTimeout(()=>authEmail.focus(),50)}
function backToMarketing(){authGate.classList.add("hidden");showMarketing()}
function scrollToPricing(){
 const gate=document.getElementById("marketingGate"),target=document.getElementById("pricing");
 if(!target)return false;
 if(gate&&!gate.classList.contains("hidden")){
  const gateRect=gate.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
  const sticky=document.querySelector("#marketingGate .marketingnav");
  const offset=Math.max(0,Number(sticky?.offsetHeight||0)+8);
  const top=Math.max(0,gate.scrollTop+(targetRect.top-gateRect.top)-offset);
  gate.scrollTo({top,behavior:"auto"});
  return true;
 }
 target.scrollIntoView({behavior:"auto",block:"start"});
 return true;
}
function safeSessionGet(key){try{return sessionStorage.getItem(key)}catch(_){return null}}
function safeSessionSet(key,value){try{sessionStorage.setItem(key,value);return true}catch(_){return false}}
function startFreeFromMarketing(plan=null){
 const role=currentWorkspaceRole();
 if(isWorkspaceRole(role)){
  if(role!=="owner"){
   const msg=document.getElementById("planAccessMessage");if(msg)msg.textContent=`You are signed in as ${role}. Only the account owner can start or change a plan and manage billing for this workspace.`;
   openModal("planAccessModal");return false;
  }
  if(plan){selectedPublicPlan=plan;safeSessionSet("bwcos_selected_plan",plan)}
  returnToWorkspace();
  if(roleCanView("billing",role))showView("billing");
  return false;
 }
 if(plan){selectedPublicPlan=plan;safeSessionSet("bwcos_selected_plan",plan)}
 openAuthFromMarketing("register");
 return false;
}
function planLabel(p){return p==="starter"?"Monitor":p==="business"?"Protect":p==="pro"?"Control":p==="network"?"Network":p==="partner"?"Partner":"Protect"}
function moneyPlan(p){return p==="starter"?"P149":p==="business"?"P349":p==="pro"?"P699":p==="network"?"P1,299":p==="partner"?"P2,499":"P349"}
async function loadBilling(){
 if(currentWorkspaceRole()!=="owner"){billingInfo=null;const banner=document.getElementById("billingBanner");if(banner)banner.style.display="none";return}
 try{billingInfo=await apiFetch("/api/billing/status");renderBilling()}catch{}
}
function renderBilling(){
 let b=billingInfo||{},status=b.status||"unknown",trial=b.trial_ends_at?new Date(b.trial_ends_at):null,renew=b.current_period_ends_at?new Date(b.current_period_ends_at):null,plan=b.plan||safeSessionGet("bwcos_selected_plan")||"business";
 let fmt=d=>d&&!isNaN(d)?d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"—";
 const statusEl=document.getElementById("billingStatus"),dateEl=document.getElementById("billingDate"),planEl=document.getElementById("billingPlanName");if(statusEl)statusEl.textContent=status.charAt(0).toUpperCase()+status.slice(1);if(dateEl)dateEl.textContent=fmt(status==="trialing"?trial:renew);if(planEl)planEl.textContent=planLabel(plan);
 document.querySelectorAll("[data-plan-card]").forEach(c=>c.classList.toggle("current",c.dataset.planCard===plan));
 let banner=document.getElementById("billingBanner");if(banner){let days=trial?Math.max(0,Math.ceil((trial-Date.now())/86400000)):null;if(status==="trialing"){banner.style.display="flex";banner.safeHTML=`<div><b>${days} day${days===1?"":"s"} left in your free trial</b><div class="muted small">Current selection: ${planLabel(plan)} · ${moneyPlan(plan)}/month after trial when billing is activated.</div></div><button class="btn soft" data-bw-onclick="showView('billing')">View plans</button>`}else if(status==="active"){banner.style.display="flex";banner.safeHTML=`<div><b>${planLabel(plan)} plan active</b><div class="muted small">Renewal ${fmt(renew)}</div></div><button class="btn soft" data-bw-onclick="showView('billing')">Manage plan</button>`}else{banner.style.display="none"}}
}
async function submitManualBankPayment(paymentOrderId){
 const input=document.getElementById("manualBankReference"),out=document.getElementById("manualBankSubmitResult"),bankReference=String(input?.value||"").trim();
 if(!bankReference){if(out)out.safeHTML='<div class="autherror show">Enter the bank transaction reference first.</div>';return}
 try{
   const r=await apiJson("/api/payments/manual-bank/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentOrderId,bankReference}),idempotencyKey:true});
   if(out)out.safeHTML=`<div class="upgradeSuccess"><b>Payment submitted for verification.</b><br>${escapeHtml(r.message||"Your plan will activate after the funds are confirmed in the Thebe Desk bank account.")}</div>`;
   await renderPayments();
 }catch(e){if(out)out.safeHTML=`<div class="autherror show">${escapeHtml(e.message)}</div>`}
}
async function requestPlan(plan){
 const upgradeResult=document.getElementById("upgradeResult"),billingCycle=document.getElementById("billingCycleSelect")?.value||"monthly";
 if(upgradeResult)upgradeResult.safeHTML='<div class="muted small">Preparing your bank-transfer reference…</div>';
 try{
   if(STANDALONE_PREVIEW){billingInfo={...(billingInfo||{}),plan,status:"preview"};renderBilling();if(upgradeResult)upgradeResult.safeHTML=`<div class="upgradeSuccess"><b>${planLabel(plan)} manual-payment preview.</b><br>Production will show the Thebe Desk company bank details and a unique payment reference. No plan activates until staff verify reflected funds.</div>`;return}
   const data=await apiJson("/api/payments/subscription-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({plan,billingCycle}),idempotencyKey:true});
   if(!data?.paymentOrder?.id||data.checkoutMode!=="manual_bank_transfer")throw new Error("Manual payment order was not created.");
   billingInfo={...(billingInfo||{}),plan};renderBilling();
   const b=data.bankTransfer||{},details=[b.bankName,b.accountName,b.accountNumber,b.accountType,b.branchCode].filter(Boolean);
   if(upgradeResult)upgradeResult.safeHTML=`<div class="upgradeSuccess"><b>Transfer P${Number(b.amountBwp||data.paymentOrder.amountBwp).toLocaleString()} to Thebe Desk.</b>
     <div class="small" style="margin-top:8px"><b>Bank:</b> ${escapeHtml(b.bankName||"—")}<br><b>Account number:</b> ${escapeHtml(b.accountNumber||"—")}${b.accountType?`<br><b>Account type:</b> ${escapeHtml(b.accountType)}`:""}${b.branchName?`<br><b>Branch:</b> ${escapeHtml(b.branchName)}`:""}${b.branchCode?`<br><b>Branch code:</b> ${escapeHtml(b.branchCode)}`:""}${b.swiftCode?`<br><b>SWIFT:</b> ${escapeHtml(b.swiftCode)}`:""}<br><b>Payment reference:</b> ${escapeHtml(b.reference||data.paymentOrder.reference||"")}</div>
     <div class="small" style="margin-top:8px">Use the payment reference above on the bank transfer. After paying, enter your bank transaction reference below. Submission does not activate the plan.</div>
     <label style="display:block;margin-top:10px">Bank transaction reference<input id="manualBankReference" maxlength="100" autocomplete="off" placeholder="e.g. transfer confirmation/reference"></label>
     <button type="button" class="btn" style="margin-top:10px" data-bw-onclick="submitManualBankPayment('${escapeHtml(data.paymentOrder.id)}')">I have paid</button>
     <div id="manualBankSubmitResult" style="margin-top:10px" role="status" aria-live="polite"></div></div>`;
 }catch(e){if(upgradeResult)upgradeResult.safeHTML=`<div class="autherror show">${escapeHtml(e.message)}</div>`}
}

let turnstileWidgetId=null,turnstileToken="",turnstileConfig=null,turnstileLoadPromise=null,turnstileExecutionResolve=null,turnstileExecutionReject=null;
function loadTurnstileScript(){if(window.turnstile)return Promise.resolve(window.turnstile);if(turnstileLoadPromise)return turnstileLoadPromise;turnstileLoadPromise=new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";s.async=true;s.defer=true;s.onload=()=>resolve(window.turnstile);s.onerror=()=>reject(new Error("Human verification could not load."));document.head.appendChild(s)});return turnstileLoadPromise}
function settleTurnstileExecution(token,error=null){
 const resolve=turnstileExecutionResolve,reject=turnstileExecutionReject;turnstileExecutionResolve=null;turnstileExecutionReject=null;
 if(error){if(reject)reject(error);return}
 turnstileToken=String(token||"");if(resolve)resolve(turnstileToken)
}
async function ensureRegistrationChallenge(){
 if(STANDALONE_PREVIEW)return;const field=document.getElementById("turnstileField");if(authMode!=="register"){field.hidden=true;turnstileToken="";return}
 try{
  turnstileConfig=await productionApiClient.request("/api/auth/anti-bot-config");
  if(!turnstileConfig?.siteKey){field.hidden=!turnstileConfig?.required;if(turnstileConfig?.required)throw new Error("Human verification is not configured.");return}
  field.hidden=false;const api=await loadTurnstileScript();
  if(turnstileWidgetId!==null){try{api.remove(turnstileWidgetId)}catch{}turnstileWidgetId=null}
  turnstileToken="";
  turnstileWidgetId=api.render("#turnstileWidget",{
   sitekey:turnstileConfig.siteKey,
   action:"register",
   execution:"execute",
   callback:t=>settleTurnstileExecution(t),
   "expired-callback":()=>{turnstileToken="";settleTurnstileExecution("",new Error("Human verification expired. Try again."))},
   "timeout-callback":()=>{turnstileToken="";settleTurnstileExecution("",new Error("Human verification timed out. Try again."))},
   "error-callback":()=>{turnstileToken="";settleTurnstileExecution("",new Error("Human verification could not complete. Try again."))}
  })
 }catch(e){authError.textContent=e.message||"Human verification unavailable.";authError.classList.add("show")}
}
async function freshRegistrationTurnstileToken(){
 if(!turnstileConfig?.required)return "";
 if(!window.turnstile||turnstileWidgetId===null)await ensureRegistrationChallenge();
 if(!window.turnstile||turnstileWidgetId===null)throw new Error("Human verification is not ready. Try again.");
 turnstileToken="";
 return await new Promise((resolve,reject)=>{
  let settled=false;
  const finishResolve=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)};
  const finishReject=error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error)};
  const timer=setTimeout(()=>{turnstileExecutionResolve=null;turnstileExecutionReject=null;finishReject(new Error("Human verification timed out. Try again."))},15000);
  turnstileExecutionResolve=finishResolve;turnstileExecutionReject=finishReject;
  try{window.turnstile.reset(turnstileWidgetId);window.turnstile.execute("#turnstileWidget")}catch(error){turnstileExecutionResolve=null;turnstileExecutionReject=null;finishReject(new Error("Human verification could not start. Try again."))}
 })
}
function clearWorkspaceChoice(){
 const field=document.getElementById("workspaceChoiceField"),select=document.getElementById("authWorkspace");
 if(field)field.hidden=true;if(select)select.replaceChildren()
}
function showWorkspaceChoices(items){
 const field=document.getElementById("workspaceChoiceField"),select=document.getElementById("authWorkspace");
 if(!field||!select)return false;
 const rows=Array.isArray(items)?items.filter(x=>x&&x.tenantId&&x.tenantName&&x.role):[];
 if(!rows.length){clearWorkspaceChoice();return false}
 select.replaceChildren(...rows.map(x=>{const option=document.createElement("option");option.value=String(x.tenantId);option.textContent=`${x.tenantName} · ${String(x.role).replace(/^./,c=>c.toUpperCase())}`;return option}));
 field.hidden=false;select.focus();return true
}
function setAuthMode(mode){
 authMode=mode;const registering=mode==="register";
 loginTab.classList.toggle("active",!registering);registerTab.classList.toggle("active",registering);
 companyNameField.style.display=registering?"block":"none";
 authTitle.textContent=registering?"Create your business account":"Sign in to your workspace";
 authIntro.textContent=STANDALONE_PREVIEW?(registering?"Standalone preview: create a demo Owner workspace with any valid email and an 8+ character password.":"Standalone preview roles: owner@preview.local, manager@preview.local, reviewer@preview.local or auditor@preview.local. Use any 8+ character password."):(registering?"Create the account now. Quick start asks only a few business facts before your first protection check.":"Use your account email and password to continue.");
 trialNote.hidden=!registering;
 authSubmit.textContent=registering?"Create account & workspace":"Sign in";
 googleAuthText.textContent=registering?"Create account with Google":"Continue with Google";
 facebookAuthText.textContent=registering?"Create account with Facebook":"Continue with Facebook";
 authPassword.autocomplete=registering?"new-password":"current-password";
 clearWorkspaceChoice();authError.classList.remove("show");ensureRegistrationChallenge()
}
function showAuth(){marketingGate.classList.add("hidden");authGate.classList.remove("hidden");concealWorkspaceShell();syncMobileRoleNav("")}
function hideAuth(){marketingGate.classList.add("hidden");authGate.classList.add("hidden");revealWorkspaceShell();syncMobileRoleNav(currentWorkspaceRole())}
let authSubmissionInFlight=false;
async function submitAuth(){
 if(authSubmissionInFlight)return;
 authError.classList.remove("show");const submittingMode=authMode;let payload={email:authEmail.value.trim(),password:authPassword.value};
 if(submittingMode==="register"){payload.companyName=authCompany.value.trim();payload.plan=safeSessionGet("bwcos_selected_plan")||selectedPublicPlan||"business"}
 else{const selectedWorkspace=document.getElementById("authWorkspace")?.value||"";if(selectedWorkspace)payload.tenantId=selectedWorkspace}
 authSubmissionInFlight=true;authSubmit.disabled=true;const originalSubmitText=authSubmit.textContent;authSubmit.textContent=submittingMode==="register"?"Creating account…":"Signing in…";
 try{
  if(submittingMode==="register"){
   if(!turnstileConfig)await ensureRegistrationChallenge();
   if(turnstileConfig?.required)payload.turnstileToken=await freshRegistrationTurnstileToken()
  }
  const data=await runtimeApiClient.request(`/api/auth/${submittingMode}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  if(submittingMode==="register"){
   turnstileToken="";
   try{
    const loginData=await runtimeApiClient.request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:payload.email,password:payload.password})});
    csrfToken=loginData.csrfToken||"";currentUser=loginData.user;await loadServerState();return
   }catch(loginErr){
    setAuthMode("login");authPassword.value=payload.password;
    if(loginErr?.code==="workspace_selection_required"&&showWorkspaceChoices(loginErr?.data?.workspaces)){authIntro.textContent="Your account is ready. Choose the workspace you want to open, then sign in.";return}
    authIntro.textContent=data.message||"Registration received. Sign in with this email to continue if the account is ready.";authEmail.focus();return
   }
  }
  csrfToken=data.csrfToken||"";currentUser=data.user;clearWorkspaceChoice();await loadServerState()
 }catch(err){
  if(submittingMode==="register"){turnstileToken="";try{if(window.turnstile&&turnstileWidgetId!==null)window.turnstile.reset(turnstileWidgetId)}catch{}}
  if(submittingMode==="login"&&err?.code==="workspace_selection_required"&&showWorkspaceChoices(err?.data?.workspaces)){authIntro.textContent="Choose the workspace you want to open with these credentials.";authError.classList.remove("show");return}
  authError.textContent=err.message||"Authentication failed";authError.classList.add("show")
 }finally{
  authSubmissionInFlight=false;authSubmit.disabled=false;
  if(authMode===submittingMode)authSubmit.textContent=originalSubmitText;else authSubmit.textContent=authMode==="register"?"Create account & workspace":"Sign in"
 }
}
async function logoutUser(){platformRegulatoryAccess=false;try{await apiFetch("/api/auth/logout",{method:"POST",body:"{}"})}catch{}csrfToken="";currentUser=null;lastWorkspaceView="dashboard";replaceWorkspaceStore({activeCompanyId:null,activeRole:"",companies:[],audit:[]});authPassword.value="";document.querySelectorAll(".modal.open").forEach(m=>m.classList.remove("open"));showMarketing()}
function consumeInitialWorkspaceState(){
 const node=document.getElementById("thebe-initial-workspace-state");
 if(!node)return null;
 const raw=node.textContent||"";node.remove();
 try{
  const data=JSON.parse(raw),version=Number(data?.version);
  if(!Number.isSafeInteger(version)||version<1||!data?.state||typeof data.state!=="object"||Array.isArray(data.state))return null;
  return {version,state:data.state};
 }catch{return null}
}
async function hydrateWorkspaceAudit(){
 try{
  const a=await apiFetch("/api/audit"),items=Array.isArray(a?.items)?a.items:[];
  updateWorkspaceMeta({audit:items});
  if(document.getElementById("audit")?.classList.contains("active"))renderAudit();
 }catch{}
}
async function loadServerState(){
 if(STANDALONE_PREVIEW){
  const role=isWorkspaceRole(currentUser?.role)?currentUser.role:"owner";currentUser={id:currentUser?.id||"preview-user",email:currentUser?.email||"owner@preview.local",displayName:currentUser?.displayName||"Preview user",role,tenantId:currentUser?.tenantId||"preview-tenant",tenantName:currentUser?.tenantName||"Preview Business",onboardingComplete:true};csrfToken="preview-csrf";serverStateVersion=1;const nextStore=structuredClone(DEFAULT_STATE);nextStore.activeRole=role;replaceWorkspaceStore(nextStore);renderAll();applyRoleUi();hideAuth();const landing=roleLandingView(role);if(landing&&roleCanView(landing))showView(landing,{roleRedirect:true});else showView("dashboard",{roleRedirect:true});const chip=document.querySelector(".prodchip");if(chip)chip.textContent=`PREVIEW · ${role.toUpperCase()}`;return
 }
 const info=await productionApiClient.request("/api/auth/me");currentUser={...(currentUser||{}),...(info.user||{})};csrfToken=info.csrfToken||csrfToken;if(!isWorkspaceRole(currentUser?.role)){showRestrictedRolePortal(currentUser?.role);return}
 const st=consumeInitialWorkspaceState()||await apiFetch("/api/state");serverStateVersion=st.version||1;let nextStore;
 if(st.state&&st.state.companies?.length){nextStore=structuredClone(st.state)}else if(currentUser.role==="owner"){nextStore=blankWorkspaceState(currentUser.tenantName||"My Business",currentUser.role)}else{throw new Error("The account owner must finish initial workspace setup before this role can enter.")}
 nextStore.activeRole=currentUser.role;nextStore.audit=[];replaceWorkspaceStore(nextStore);
 renderAll();applyRoleUi();hideAuth();logEvent("APP_OPENED",{ruleset:"BW-2026.08.30-launch"});const landing=roleLandingView(currentUser.role);if(landing&&roleCanView(landing))showView(landing,{roleRedirect:true});handleOAuthResult();handleResetLink();
 if(currentUser.role==="owner"&&currentUser.onboardingComplete===false)scheduleOwnerOnboarding();
 if(currentUser.role==="owner"&&currentUser.onboardingComplete===true&&state?.profile?.firstProtectionCheckStatus==="pending")setTimeout(()=>{document.getElementById("firstValuePanel")?.classList.add("show");renderFirstValueFailure("The previous first protection check did not finish. Run it again to generate server-backed actions.")},220);
}

let lastModalFocus=null;
function modalFocusable(modal){return [...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.offsetParent!==null)}
function openModal(id){const modal=document.getElementById(id);if(!modal)return;lastModalFocus=document.activeElement;modal.classList.add("open");modal.setAttribute("aria-hidden","false");requestAnimationFrame(()=>modalFocusable(modal)[0]?.focus())}
function closeModal(id){const modal=document.getElementById(id);if(!modal)return;modal.classList.remove("open");modal.setAttribute("aria-hidden","true");if(lastModalFocus?.focus)lastModalFocus.focus();lastModalFocus=null}
document.addEventListener("keydown",e=>{const modal=document.querySelector(".modal.open");if(!modal)return;if(e.key==="Escape"){e.preventDefault();closeModal(modal.id);return}if(e.key!=="Tab")return;const items=modalFocusable(modal);if(!items.length){e.preventDefault();return}const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
document.getElementById("nav").addEventListener("click",e=>{let b=e.target.closest("button[data-view]");if(b)showView(b.dataset.view)});
function concealWorkspaceShell(){appShell.style.display="none";appShell.style.visibility="hidden"}
function revealWorkspaceShell(){appShell.style.display="";appShell.style.visibility="visible"}
window.__THEBE_WORKSPACE_READY__=false;
window.whenThebeWorkspaceReady=function(callback){
 if(typeof callback!=="function")return;
 if(window.__THEBE_WORKSPACE_READY__===true){queueMicrotask(callback);return}
 window.addEventListener("thebe:workspace-ready",callback,{once:true});
};
function markWorkspaceReady(){
 if(window.__THEBE_WORKSPACE_READY__===true)return;
 marketingGate.classList.add("hidden");
 authGate.classList.add("hidden");
 revealWorkspaceShell();
 syncMobileRoleNav(currentWorkspaceRole());
 window.__THEBE_WORKSPACE_READY__=true;
 window.dispatchEvent(new Event("thebe:workspace-ready"));
}
async function bootstrap(){marketingGate.classList.add("hidden");authGate.classList.add("hidden");concealWorkspaceShell();syncMobileRoleNav("");if(await handleDailyReporterPortal())return;if(await handlePublicPassportFragment())return;if(STANDALONE_PREVIEW){showMarketing();return}try{await loadServerState();if(isWorkspaceRole(currentUser?.role))markWorkspaceReady()}catch(err){csrfToken="";currentUser=null;showMarketing()}}

document.getElementById("authPassword").addEventListener("keydown",e=>{if(e.key==="Enter")submitAuth()});
document.getElementById("authEmail").addEventListener("input",clearWorkspaceChoice);
document.getElementById("authPassword").addEventListener("input",clearWorkspaceChoice);

function syncMetricRing(ring){
 const target=document.getElementById(ring.dataset.ringTarget||"");if(!target)return;
 const raw=(target.textContent||"").replace(/[^0-9.]/g,"");const value=raw===""?0:Math.max(0,Math.min(100,Number(raw)||0));
 ring.style.setProperty("--ring-value",String(value));
 const label=ring.getAttribute("aria-label")||"Metric";ring.setAttribute("aria-label",`${label.split(":")[0]}: ${Math.round(value)} percent`);
}
function initMetricRings(){
 document.querySelectorAll(".metric-ring[data-ring-target]").forEach(ring=>{const target=document.getElementById(ring.dataset.ringTarget);if(!target)return;syncMetricRing(ring);new MutationObserver(()=>syncMetricRing(ring)).observe(target,{childList:true,characterData:true,subtree:true})});
}
initMetricRings();
bootstrap();
