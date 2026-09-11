
const DEFAULT_COMPANY={
 id:"co_demo_1",
 profile:{name:"Kgetsi Trading (Pty) Ltd",incorporationDate:"2024-05-14",entityType:"company",industry:"Retail",employees:8,town:"Gaborone",vat:true,vatCategory:"C",paye:true,trade:true,data:true,tender:true,premises:true,tradeAnniversary:"2027-02-28",cipaMonth:"May",citizenOwned:true,turnover:1800000,annualTaxableSupplies:null,highestMonthlyEmployeePay:null,manufacturing:false,mfgActivity:"",mfgFactory:false,mfgAnniversary:""},
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
let store=structuredClone(DEFAULT_STATE);
let state=store.companies[0];
let csrfToken="";
let currentUser=null;
let authMode="login";let selectedPublicPlan="business";let billingInfo=null;
let serverStateVersion=1;
let saveTimer=null;

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
 return (state.profile.turnover||0)>5000000?"Department of Industrial Affairs":"District / Town / City Council";
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
 let el=document.getElementById("opsDiagnostics");if(!el)return;el.innerHTML='<div class="muted small">Checking database, migrations, storage and process health…</div>';
 try{let d=await apiFetch("/api/ops/diagnostics");let storage=d.objectStorage||{};el.innerHTML=`<div class="statusgrid"><div class="metricmini"><div class="kpi">Version</div><b>${escapeHtml(d.version||"—")}</b></div><div class="metricmini"><div class="kpi">Uptime</div><b>${Math.floor((d.uptimeSec||0)/60)} min</b></div><div class="metricmini"><div class="kpi">Memory RSS</div><b>${d.memoryMb?.rss||0} MB</b></div><div class="metricmini"><div class="kpi">Object storage</div><b>${storage.configured?(storage.reachable===false?"Configured / check failed":"Configured") : "Missing"}</b></div></div><div class="small muted" style="margin-top:10px">Latest migration: ${escapeHtml(d.latestMigration?.version||"none")} · Requests since start: ${d.metrics?.requests||0} · Server errors: ${d.metrics?.errors||0} · Auth failures: ${d.metrics?.authFailures||0}</div>`}catch(err){el.innerHTML=`<div class="rulebad"><b>Diagnostics failed</b><div class="small">${escapeHtml(err.message)}</div></div>`}
}
function renderSecurity(){
 let q=id=>document.getElementById(id);if(!q("securityScore"))return;
 let proto=securityControls.filter(c=>c.prototype).length,score=Math.round(proto/securityControls.length*100),blockers=securityControls.length-proto;
 q("securityScore").textContent=score;q("securityBlockers").textContent=blockers;
 q("securityControls").innerHTML=securityControls.map(c=>`<div class="securityrow"><div><b>${c.name}</b></div><span class="badge ${c.prototype?"good":"warn"}">${c.prototype?"Prototype partial":"Production required"}</span><span class="small muted">${c.production?"Required":"Optional"}</span></div>`).join("")
}


function renderGlobalConflict(){
 let el=document.getElementById("globalConflictBanner");if(!el)return;
 if(!sourceConflicts.length){el.style.display="none";return}
 el.style.display="block";el.innerHTML=`<div class="between row"><div><b>Source validation in progress</b><div class="small">${sourceConflicts.length} rule conflict(s) are safely blocked from automation.</div></div><button class="btn alt" onclick="showView('sources')">Review sources</button></div>`;
}


const commandSections=[
 ["dashboard","Dashboard","Workspace"],["obligations","Obligations","Workspace"],["calendar","Calendar","Workspace"],["changes","Law Changes","Workspace"],
 ["employer","Employer Shield","People & risk"],["employees","Employees","People & risk"],["employmentcontrols","Employment Controls","People & risk"],["privacy","Privacy","People & risk"],
 ["taxprofile","Tax Profile","Business"],["corporate","Corporate Changes","Business"],["tender","Tender Readiness","Business"],["manufacturing","Manufacturing","Business"],["events","Business Events","Business"],
 ["vault","Evidence Vault","Evidence"],["documents","Documents","Evidence"],["expert","Expert Review","Evidence"],
 ["sources","Source Registry","Governance"],["rules","Rule Library","Governance"],["publishing","Rule Publishing","Governance"],["audit","Audit Log","Governance"],
 ["integrations","Integrations","Administration"],["security","Security Center","Administration"],["profile","Settings","Administration"]
];
function openCommandPalette(){let sh=document.getElementById("commandShade");if(!sh)return;sh.classList.add("open");renderCommandResults("");setTimeout(()=>document.getElementById("commandInput")?.focus(),20)}
function closeCommandPalette(){document.getElementById("commandShade")?.classList.remove("open")}
function renderCommandResults(q=""){
 let role=store.activeRole||"owner";let allowed=[...document.querySelectorAll('.nav button[data-view]')].filter(b=>b.style.display!=="none").map(b=>b.dataset.view);
 let query=q.trim().toLowerCase();let rows=commandSections.filter(x=>allowed.includes(x[0])&&(!query||x[1].toLowerCase().includes(query)||x[2].toLowerCase().includes(query))).slice(0,12);
 commandResults.innerHTML=rows.length?rows.map((x,i)=>`<button class="commanditem" data-command-index="${i}" onclick="commandGo('${x[0]}')"><span><b>${x[1]}</b><small style="display:block">${x[2]}</small></span><span class="kbd">Enter</span></button>`).join(""):`<div class="empty"><b>No matching section</b><span class="muted small">Try another word.</span></div>`;
}
function commandGo(id){closeCommandPalette();showView(id)}
function commandKey(e){if(e.key==="Escape")closeCommandPalette();if(e.key==="Enter"){let first=document.querySelector('#commandResults .commanditem');if(first)first.click()}}
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommandPalette()}else if(e.key==="/"&&!/input|textarea|select/i.test(document.activeElement?.tagName||"")){e.preventDefault();openCommandPalette()}else if(e.key==="Escape")closeCommandPalette()});
function mobileGo(id){showView(id);updateMobileNav(id)}
function updateMobileNav(id){document.querySelectorAll('[data-mobile-view]').forEach(b=>b.classList.toggle('active',b.dataset.mobileView===id))}
function setupProgress(){
 let p=state.profile||{};let items=[!!p.name,!!p.industry,!!p.town,Number.isFinite(+p.employees),!!p.cipaMonth,(!p.trade||!!p.tradeAnniversary),(state.evidence||[]).some(e=>e.verified)];
 let done=items.filter(Boolean).length,pct=Math.round(done/items.length*100);let bar=document.getElementById('setupBar');if(bar)bar.style.width=pct+'%';if(document.getElementById('setupPercent'))setupPercent.textContent=pct+'%';
 if(document.getElementById('setupHint'))setupHint.textContent=pct===100?'Core workspace setup is complete.':'Complete '+(items.length-done)+' setup item'+(items.length-done===1?'':'s')+' to improve recommendations.';
}
function renderNextAction(){
 let a=applicable().filter(r=>/Action required|gaps|verify|Professional review required/i.test(r.status())).sort((x,y)=>({High:0,Medium:1,Low:2}[x.risk]-{High:0,Medium:1,Low:2}[y.risk]))[0];
 let title=document.getElementById('nextActionTitle'),text=document.getElementById('nextActionText'),btn=document.getElementById('nextActionBtn');if(!title||!text||!btn)return;
 if(!a){title.textContent='No urgent compliance action';text.textContent='Your current rule set has no unresolved priority controls. Review upcoming deadlines next.';btn.textContent='View calendar';btn.dataset.target='calendar';return}
 title.textContent=a.title;text.textContent=`${a.area} · ${a.risk} risk · ${a.status()}`;btn.textContent='Review now';btn.dataset.target='obligations';
}
function openNextAction(){showView(document.getElementById('nextActionBtn')?.dataset.target||'obligations')}

function renderAll(){
 const s=scoreData(),a=applicable();
 document.getElementById("companyHero").textContent=state.profile.name;
 ["complianceScore","protectionScore"].forEach((id,i)=>{let v=i?s.prot:s.comp;let el=document.getElementById(id);el.textContent=v;el.className="score "+(v>=85?"good":v>=70?"warn":"bad")});
 document.getElementById("complianceBar").style.width=s.comp+"%";document.getElementById("protectionBar").style.width=s.prot+"%";
 animateNumber(document.getElementById("openActions"),s.open);document.getElementById("navAlerts").textContent=s.open;let ac=document.getElementById("attentionCount");if(ac)ac.textContent=s.open?`${s.open} to review`:"All clear";
 document.getElementById("evidenceCoverage").textContent=Math.min(100,Math.round(state.evidence.length/(a.length||1)*100))+"%";
 let priority=a.filter(r=>/Action required|gaps|due|verify/i.test(r.status())).slice(0,5);
 document.getElementById("priorityList").innerHTML=priority.length?priority.map(r=>`<div class="item"><div class="between row"><b>${r.title}</b><span class="badge ${riskClass(r.risk)}">${r.risk}</span></div><div class="muted small">${r.status()}</div></div>`).join(""):`<div class="notice good">No urgent actions detected in this demo rule pack.</div>`;
 let areas=[...new Set(a.map(x=>x.area))];
 document.getElementById("areaScores").innerHTML=areas.map(area=>{let ar=a.filter(x=>x.area===area), issues=ar.filter(x=>/Action required|gaps|due|verify/i.test(x.status())).length;let sc=Math.max(55,100-issues*18);return `<div class="item riskbar"><div><b>${area}</b><div class="progress"><span style="width:${sc}%"></span></div></div><b>${sc}%</b></div>`}).join("");
 renderGlobalConflict();renderSecurity();applyRoleUi();renderNextAction();setupProgress();renderDeadlines();renderObligations();renderCalendar();renderVault();renderEmployees();renderEmployeeRegister();renderPrivacy();renderTender();renderManufacturing();renderSourceRegistry();renderTaxProfile();renderCorporate();renderEmploymentControls();renderPublishing();renderDocs();renderChanges();renderCompanies();renderAudit();renderRuleLibrary();renderCases();renderExpert();fillProfile();renderSocialAccounts();renderAccountSecurity();renderOnboardingBanner();renderDeletionStatus();renderAiCredits();renderAiCostControls();renderTenderReady();renderEmployeesForHr();renderHrCases();renderCompanyActions();renderLicences();renderUnifiedNextActions();renderPartnerPortal();renderPassport();renderPassportShares();renderWorkflowRules();renderNotifications();renderNotificationDeadLetters();renderSchedules();renderPartnerInvites();renderPartnerAccess();renderProfessionalServices();renderPayments();renderPaymentProviders();renderPaymentReconciliation();renderEntitlements();renderRegulatoryIntelligence();renderPlatformRegulatoryGovernance();renderComplianceObligations();renderInspectionReadiness();renderDeletion();renderEvidenceIntegrity();renderProtectionEngine();renderControlCenter();renderRiskEvents();renderPortfolioRisk();renderPartnerActionCenter();setTimeout(animateViewItems,30);
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
 let m=monthNum(state.profile.cipaMonth);if(m<0)return null;let now=new Date(), y=now.getFullYear(), d=endOfMonth(y,m);if(d<now)d=endOfMonth(y+1,m);return d
}
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
 let emp=ftEmployee.value.trim();if(!emp||!ftStart.value||!ftEnd.value)return alert("Enter employee/reference and both dates.");
 state.fixedTerms=state.fixedTerms||[];
 let rec={id:"ft_"+Date.now(),employee:emp,start:ftStart.value,end:ftEnd.value,justified:ftJustified.value==="true"};
 state.fixedTerms.push(rec);logEvent("FIXED_TERM_CONTROL_ADDED",{contractId:rec.id,months:monthsBetween(rec.start,rec.end),justified:rec.justified});
 ftEmployee.value="";ftStart.value=ftEnd.value="";save();renderAll()
}
function removeFixedTerm(id){state.fixedTerms=(state.fixedTerms||[]).filter(x=>x.id!==id);logEvent("FIXED_TERM_CONTROL_REMOVED",{contractId:id});save();renderAll()}
function renderEmploymentControls(){
 let arr=state.fixedTerms||[],flags=fixedTermFlags(),q=id=>document.getElementById(id);if(!q("ftCount"))return;
 q("ftCount").textContent=arr.length;q("ftFlags").textContent=flags;q("empHighRisk").textContent=(state.cases||[]).filter(c=>c.status==="Open"&&c.risk==="High").length;
 q("fixedTermList").innerHTML=arr.length?arr.map(x=>{let m=monthsBetween(x.start,x.end),flag=m>12&&!x.justified;return `<div class="item ${flag?"rulewarn":""}"><div class="between row"><div><b>${escapeHtml(x.employee)}</b><div class="muted small">${x.start} → ${x.end} · approx. ${m} months</div></div><span class="badge ${flag?"warn":"good"}">${flag?"Review":"OK metadata"}</span></div><div class="source">Objective justification: ${x.justified?"documented":"not documented"}</div><button class="btn alt" style="margin-top:8px" onclick="removeFixedTerm('${safeId(x.id)}')">Remove</button></div>`}).join(""):'<div class="muted small">No fixed-term contract metadata.</div>'
}
function runTerminationGuard(){
 let checks={evidence:termEvidence.value==="true",response:termResponse.value==="true",review:termReview.value==="true"},reason=termReason.value;
 let missing=[];if(!checks.evidence)missing.push("evidence completeness");if(!checks.response)missing.push("employee response / process record");if(!checks.review)missing.push("professional review");
 let block=missing.length>0;
 terminationGuardOutput.innerHTML=`<div class="${block?"rulebad":"verifiedsrc"}"><b>${block?"BLOCK AUTOMATED TERMINATION":"Readiness controls completed"}</b><div class="small" style="margin-top:6px">Reason: ${escapeHtml(reason)}</div>${block?`<div class="small">Missing/uncertain: ${missing.join(", ")}.</div><div class="source">The app will not generate a final dismissal instruction while these controls are unresolved.</div>`:`<div class="small">This still does not certify that termination is lawful. Final documents and calculations must match the applicable facts, contract, legislation and regulations.</div>`}</div>`;
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
 q("publishingList").innerHTML=rows.map(r=>`<div class="item"><div class="between row"><div><b>${r.title}</b><div class="muted small">${r.area} · ${r.authority}</div></div><span class="publishstate ${r.publish}">${r.publish==="live"?"Executable":r.publish==="review"?"Review-gated":"Blocked"}</span></div><div class="rulemeta"><span>Effective ${r.effectiveFrom}</span><span>${r.review}</span><span>${r.source}</span></div></div>`).join("")
}

function renderTaxProfile(){
 let p=state.profile,q=id=>document.getElementById(id);if(!q("taxPayeStatus"))return;
 q("taxPayeStatus").textContent=p.paye?"Registered / tracked":"Not selected";
 let cycle=!p.vat?"Not VAT registered":((p.turnover||0)>=12000000?"Monthly (Category C guidance)":"Two-month category guidance");
 q("taxVatCycle").textContent=cycle;
 q("taxConflictCount").textContent=sourceConflicts.filter(c=>c.area==="Tax").length;
 let nextP=nextMonthlyDeadline(15),nextV=nextVatDeadline();
 q("taxProfileSummary").innerHTML=`<div class="matrix"><b>Turnover profile</b><span>P${Number(p.turnover||0).toLocaleString()}</span><b>PAYE</b><span>${p.paye?"Enabled · next payment target "+fmtDate(nextP):"Not enabled"}</span><b>VAT</b><span>${p.vat?"Enabled · "+cycle+" · next generic payment date "+fmtDate(nextV):"Not enabled"}</span><b>Company return</b><span>Income-tax return timing depends on financial year / tax-year rules; configure in production.</span></div>`;
 q("taxConflicts").innerHTML=sourceConflicts.filter(c=>c.area==="Tax").map(c=>`<div class="conflict item"><b>${c.topic}</b><div class="small" style="margin-top:6px"><b>${c.sourceA.label}:</b> ${c.sourceA.claim}</div><div class="small"><b>${c.sourceB.label}:</b> ${c.sourceB.claim}</div><div class="source">System handling: ${c.handling}</div><div class="rulemeta"><a href="${c.sourceA.url}" target="_blank">Source A</a><a href="${c.sourceB.url}" target="_blank">Source B</a></div></div>`).join("")
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
 corpChangeOutput.innerHTML=`<div class="${k==="nominee"?"rulebad":"notice"}"><b>${c.title}</b><ol>${c.checks.map(x=>`<li>${x}</li>`).join("")}</ol><div class="source">Workflow identifies re-checks; exact filing deadline/form must be validated for the company type and change.</div></div>`;
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
 q("corpEvidence").innerHTML=req.map(x=>`<div class="checkline"><span class="dot ${x[1]?"good":"warn"}"></span><div><b>${x[0]}</b><div class="muted small">${x[1]?"Verified evidence found":"Add/verify evidence"}</div></div></div>`).join("")
}

function saveManufacturingProfile(){
 state.profile.manufacturing=true;state.profile.mfgActivity=mfgActivity.value;state.profile.mfgFactory=mfgFactory.value==="true";state.profile.mfgAnniversary=mfgAnniversary.value;
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
 q("mfgChecklist").innerHTML=items.length?items.map(x=>`<div class="checkline"><span class="dot ${x[2]?"good":"warn"}"></span><div><b>${x[0]}</b><div class="muted small">${x[1]}</div></div></div>`).join(""):'<div class="notice good">Manufacturing is not enabled for this company.</div>'
}
function renderSourceRegistry(){
 let el=document.getElementById("sourceRegistry");if(!el)return;
 let cards=sourceRegistry.map(s=>`<div class="sourcebox item"><strong>${s.authority}</strong><div class="small">${s.coverage}</div><div class="pillrow" style="margin-top:8px"><span class="pill">${s.domain}</span><span class="pill">${s.confidence}</span><span class="pill">Review ${s.review}</span></div></div>`).join("");
 let conflicts=sourceConflicts.map(c=>`<div class="conflict item"><strong>Source conflict: ${c.topic}</strong><div class="small">${c.handling}</div></div>`).join("");
 el.innerHTML=`<div class="rulewarn"><b>${sourceConflicts.length} source conflict(s) currently block automatic rule execution.</b><div class="small">The platform should prefer no automated conclusion over a potentially wrong legal/tax conclusion.</div></div><div style="margin-top:12px">${conflicts}${cards}</div>`
}

function renderDeadlines(){
 let rows=[];
 if(state.profile.paye){let d=nextMonthlyDeadline(15);rows.push(["PAYE",fmtDate(d),"High",d])}
 if(state.profile.vat){let d=nextVatDeadline();rows.push(["VAT",fmtDate(d),"High",d])}
 let cd=nextCipaDeadline();rows.push(["CIPA annual return",cd?fmtDate(cd):(state.profile.cipaMonth||"Due month not set"),"High",cd]);
 if(state.profile.trade){let td=nextAnniversary();rows.push(["Trade annual fee",td?fmtDate(td):"Anniversary not set","Medium",td])}
 if(state.profile.manufacturing){let md=state.profile.mfgAnniversary?new Date(state.profile.mfgAnniversary+"T00:00:00"):null;if(md){let now=new Date(),x=new Date(now.getFullYear(),md.getMonth(),md.getDate());if(x<now)x=new Date(now.getFullYear()+1,md.getMonth(),md.getDate());md=x}rows.push(["Industrial licence renewal",md?fmtDate(md):"Anniversary not set","High",md])}
 document.getElementById("deadlineTable").innerHTML=`<table><tr><th>Obligation</th><th>Next due</th><th>Risk</th></tr>${rows.map(x=>`<tr class="${deadlineClass(x[3])}"><td>${x[0]}</td><td>${x[1]}${x[3]&&daysUntil(x[3])<=30?` <span class="tag">${Math.max(0,daysUntil(x[3]))} days</span>`:""}</td><td><span class="badge ${riskClass(x[2])}">${x[2]}</span></td></tr>`).join("")}</table>`;
}
function renderObligations(){
 let f=document.getElementById("obligationFilter")?.value||"All";let a=applicable().filter(r=>f==="All"||r.risk===f);
 document.getElementById("obligationList").innerHTML=a.map(r=>`<div class="item"><div class="between row"><div><b>${r.title}</b><div class="muted small">${r.area} · ${r.status()}</div></div><span class="badge ${riskClass(r.risk)}">${r.risk}</span></div><p class="small">${r.why}</p><div class="source">Source: <a href="${r.url}" target="_blank">${r.source}</a></div><div class="rulemeta"><span>${r.authority}</span><span>Effective ${r.effectiveFrom}</span>${r.requiresExpert?'<span>Professional validation gate</span>':''}</div><div class="actions" style="margin-top:9px"><button class="btn soft" onclick="markDone('${r.id}')">Mark evidence verified</button></div></div>`).join("");
}
function markDone(id){state.completed[id]=true;logEvent("CONTROL_VERIFIED",{rule:id});save();renderAll()}
function renderCalendar(){
 let arr=[
  state.profile.paye&&["PAYE","Monthly",fmtDate(nextMonthlyDeadline(15)),"BURS",nextMonthlyDeadline(15)],
  state.profile.vat&&["VAT","Tax period",fmtDate(nextVatDeadline()),"BURS",nextVatDeadline()],
  ["Annual return","Annual",nextCipaDeadline()?fmtDate(nextCipaDeadline()):(state.profile.cipaMonth?state.profile.cipaMonth+" due month":"Set CIPA due month"),"CIPA",nextCipaDeadline()],
  state.profile.trade&&["Trade annual fee","Annual",nextAnniversary()?fmtDate(nextAnniversary()):"Set licence anniversary","Council / Trade",nextAnniversary()],
  state.profile.manufacturing&&["Industrial licence renewal","Annual",state.profile.mfgAnniversary||"Set first-issue anniversary","Industrial Affairs / Council",null],
  state.profile.employees>0&&["Employment file audit","Quarterly","Internal recurring control","Employer Shield",null],
  state.profile.data&&["Privacy/data review","Quarterly","Internal recurring control","Data protection",null]
 ].filter(Boolean);
 document.getElementById("calendarList").innerHTML=`<table><tr><th>Item</th><th>Frequency</th><th>Next timing</th><th>Owner</th></tr>${arr.map(x=>`<tr class="${deadlineClass(x[4])}"><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td></tr>`).join("")}</table>`;
}
function renderVault(){document.getElementById("vaultList").innerHTML=state.evidence.length?state.evidence.map((e,i)=>`<div class="item"><div class="between row"><div><b>${escapeHtml(e.name)}</b><div class="muted small">${escapeHtml(e.cat)}${e.date?" · review "+escapeHtml(e.date):""} · ${e.verified?"verified":"unverified"}</div></div><div class="actions"><button class="btn soft" onclick="verifyEvidence(${i})">${e.verified?"Verified ✓":"Verify"}</button><button class="btn alt" onclick="removeEvidence(${i})">Remove</button></div></div></div>`).join(""):`<div class="empty"><b>No evidence yet</b><span class="muted small">Add your first verified document to improve evidence coverage.</span></div>`}
async function addEvidence(){
 let n=document.getElementById("evName").value.trim();if(!n)return;
 let ev={id:"ev_"+Date.now(),name:n,cat:document.getElementById("evCat").value,date:document.getElementById("evDate").value,verified:false,fileUploaded:false};
 const file=document.getElementById("evFile")?.files?.[0];
 if(file){
   try{
     const pre=await apiFetch("/api/evidence/presign",{method:"POST",body:JSON.stringify({companyId:state.id,filename:file.name,contentType:file.type||"application/octet-stream",size:file.size,displayName:n,category:ev.cat,reviewDate:ev.date||null})});
     const up=await fetch(pre.uploadUrl,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":file.type||"application/octet-stream","X-CSRF-Token":csrfToken},body:file});
     if(!up.ok)throw new Error("Secure file upload failed");
     await apiFetch(`/api/evidence/${pre.evidenceId}/complete`,{method:"POST",body:JSON.stringify({size:file.size})});
     ev.serverEvidenceId=pre.evidenceId;ev.fileUploaded=true;ev.objectKey=pre.objectKey;
   }catch(err){
     alert("Evidence metadata will be saved, but the file was not uploaded: "+err.message);
   }
 }
 state.evidence.push(ev);logEvent("EVIDENCE_ADDED",{evidenceId:ev.id,name:n,category:ev.cat,fileUploaded:ev.fileUploaded});document.getElementById("evName").value="";if(document.getElementById("evFile"))document.getElementById("evFile").value="";save();renderAll()
};
function runEvent(k){
 let ev=businessEvents[k];if(!ev)return;
 document.getElementById("eventOutput").innerHTML=`<div class="notice"><b>${ev.title}</b><div class="small" style="margin-top:7px">Re-check these areas:</div><ol>${ev.actions.map(a=>`<li><b>${a[0]}:</b> ${a[1]}</li>`).join("")}</ol><div class="source">This event workflow identifies review areas. It does not assume a filing is legally required without validating the exact business activity and facts.</div></div>`;
 logEvent("BUSINESS_EVENT_REVIEWED",{event:k});
}

function addEmployeeRecord(){
 let name=eName.value.trim();if(!name)return;
 state.employees=state.employees||[];
 let rec={id:"emp_"+Date.now(),name,role:eRole.value.trim(),start:eStart.value,contract:eContract.value==="true",asset:eAsset.value==="true"};
 state.employees.push(rec);state.profile.employees=Math.max(state.profile.employees,state.employees.length);
 logEvent("EMPLOYEE_RECORD_ADDED",{employeeId:rec.id,role:rec.role,contract:rec.contract,asset:rec.asset});
 eName.value="";eRole.value="";eStart.value="";save();renderAll()
}
function removeEmployeeRecord(id){
 let rec=(state.employees||[]).find(e=>e.id===id);state.employees=(state.employees||[]).filter(e=>e.id!==id);
 logEvent("EMPLOYEE_RECORD_REMOVED",{employeeId:id,employeeRef:rec?.name});save();renderAll()
}
function toggleEmployeeControl(id,field){
 let rec=(state.employees||[]).find(e=>e.id===id);if(!rec)return;rec[field]=!rec[field];
 logEvent("EMPLOYEE_CONTROL_UPDATED",{employeeId:id,control:field,value:rec[field]});save();renderAll()
}
function renderEmployeeRegister(){
 let arr=state.employees||[], total=arr.length, contracts=arr.filter(e=>e.contract).length, assets=arr.filter(e=>e.asset).length;
 let by=id=>document.getElementById(id);
 if(by("empRecordsCount"))by("empRecordsCount").textContent=total;
 if(by("contractCoverage"))by("contractCoverage").textContent=(total?Math.round(contracts/total*100):0)+"%";
 if(by("assetCoverage"))by("assetCoverage").textContent=(total?Math.round(assets/total*100):0)+"%";
 let el=by("employeeRegister");if(!el)return;
 el.innerHTML=arr.length?arr.map(e=>`<div class="item"><div class="between row"><div><b>${escapeHtml(e.name)}</b><div class="muted small">${escapeHtml(e.role||"Role not set")} · ${e.start||"Start date not set"}</div></div><button class="btn alt" onclick="removeEmployeeRecord('${safeId(e.id)}')">Remove</button></div><div class="rulemeta"><button class="btn ${e.contract?"soft":"alt"}" onclick="toggleEmployeeControl('${safeId(e.id)}','contract')">Contract ${e.contract?"✓":"missing"}</button><button class="btn ${e.asset?"soft":"alt"}" onclick="toggleEmployeeControl('${safeId(e.id)}','asset')">Asset form ${e.asset?"✓":"missing"}</button></div></div>`).join(""):`<div class="muted small">No employee records yet.</div>`
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
 if(q("tenderChecklist"))q("tenderChecklist").innerHTML=tenderRequirements.map(r=>`<div class="checkline"><span class="dot ${evidenceMatches(r)?"good":"warn"}"></span><div><b>${r.name}</b><div class="muted small">${r.area} · ${evidenceMatches(r)?"Verified evidence found":"Evidence missing/unverified"}</div></div></div>`).join("");
 if(q("tenderPackPreview"))q("tenderPackPreview").innerHTML=`<b>${escapeHtml(state.profile.name)}</b><div class="muted small">Tender readiness ${score}%</div><hr style="border:0;border-top:1px solid var(--line);margin:10px 0">${tenderRequirements.map(r=>`<div class="small">${evidenceMatches(r)?"✓":"○"} ${r.name}</div>`).join("")}`;
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
 state.privacy=state.privacy||{controls:{},activities:[]};state.privacy.controls[k]=!state.privacy.controls[k];
 logEvent("PRIVACY_CONTROL_UPDATED",{control:k,value:state.privacy.controls[k]});save();renderAll()
}
function addDataActivity(){
 let a=dpActivity.value.trim();if(!a)return;state.privacy=state.privacy||{controls:{},activities:[]};
 let rec={id:"dp_"+Date.now(),activity:a,category:dpCategory.value.trim(),purpose:dpPurpose.value.trim(),access:dpAccess.value.trim()};
 state.privacy.activities.push(rec);logEvent("DATA_ACTIVITY_ADDED",{activityId:rec.id,activity:rec.activity});
 dpActivity.value=dpCategory.value=dpPurpose.value=dpAccess.value="";save();renderAll()
}
function removeDataActivity(id){state.privacy.activities=state.privacy.activities.filter(a=>a.id!==id);logEvent("DATA_ACTIVITY_REMOVED",{activityId:id});save();renderAll()}
function renderPrivacy(){
 state.privacy=state.privacy||{controls:{},activities:[]};let c=state.privacy.controls||{},done=privacyControls.filter(x=>c[x[0]]).length,score=Math.round(done/privacyControls.length*100),gaps=privacyControls.length-done;
 let q=id=>document.getElementById(id);if(q("privacyScore")){q("privacyScore").textContent=score;q("privacyScore").className="score "+(score>=80?"good":score>=55?"warn":"bad")}
 if(q("dataActivityCount"))q("dataActivityCount").textContent=(state.privacy.activities||[]).length;if(q("privacyGaps"))q("privacyGaps").textContent=gaps;
 if(q("privacyChecklist"))q("privacyChecklist").innerHTML=privacyControls.map(x=>`<div class="checkline"><input type="checkbox" ${c[x[0]]?"checked":""} onchange="togglePrivacyControl('${x[0]}')"><div><b>${x[1]}</b><div class="muted small">${x[2]}</div></div></div>`).join("");
 if(q("dataActivityList"))q("dataActivityList").innerHTML=(state.privacy.activities||[]).map(a=>`<div class="item"><div class="between row"><div><b>${escapeHtml(a.activity)}</b><div class="muted small">${escapeHtml(a.category)} · ${escapeHtml(a.purpose)}</div><div class="source">Access: ${escapeHtml(a.access||"Not specified")}</div></div><button class="btn alt" onclick="removeDataActivity('${safeId(a.id)}')">Remove</button></div></div>`).join("")||'<div class="muted small">No processing activities recorded.</div>';
}

function renderEmployees(){
 document.getElementById("employeeCount").textContent=state.profile.employees;
 let gaps=Math.min(6,Math.max(0,Math.ceil(state.profile.employees*.35)));document.getElementById("employeeGaps").textContent=gaps;
 let arr=[["Employment contracts","Verified",true],["Job descriptions","Needs review",false],["Leave records","Verified",true],["Asset acknowledgements","Missing for some staff",false],["Disciplinary/performance evidence","Needs review",false]];
 document.getElementById("employeeFiles").innerHTML=arr.map(x=>`<div class="item"><span class="dot ${x[2]?"good":"warn"}"></span><b>${x[0]}</b><div class="muted small" style="margin-left:17px">${x[1]}</div></div>`).join("");
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
 document.getElementById("workflowOutput").innerHTML=`<div class="notice"><b>${name}</b><ol>${steps.map(s=>`<li>${s}</li>`).join("")}</ol><div class="small"><b>Control:</b> This is a risk-management workflow, not an automatic legal decision. High-risk employment actions must be checked against the effective law and facts.</div><div class="actions" style="margin-top:10px"><button class="btn" onclick="openCase('${name.replaceAll("'","")}')">Open protected case</button></div></div>`;
}
function renderDocs(){
 let docs=["Beneficial ownership declaration pack","Corporate change evidence pack","Employment contract","Job description","Warning notice","Disciplinary meeting record","Performance improvement plan","Leave form","Salary advance agreement","Asset issue acknowledgement","Privacy notice","Board resolution","Company constitution checklist","CIPA annual-return preparation pack","Trade-licence annual-fee pack","Tender compliance pack","Compliance evidence report","Tender readiness pack","Data-processing register"];
 document.getElementById("docGrid").innerHTML=docs.map(d=>`<div class="card" style="box-shadow:none"><h3>${d}</h3><div class="muted small">Profile-aware controlled template</div><button class="btn soft" style="margin-top:10px" onclick="generateDoc('${d}')">Generate draft</button></div>`).join("");
}
function generateDoc(name){
 let high=/Warning|Disciplinary|Salary advance/.test(name);
 logEvent("DOCUMENT_DRAFT_REQUESTED",{name,professionalReview:high});
 alert(`${name} draft workflow started.\n\n${high?"Professional review flag: ON":"Professional review flag: as required"}\n\nProduction version must generate from a versioned Botswana legal template library and retain the ruleset/effective date used.`);
}
function renderChanges(){document.getElementById("lawChanges").innerHTML=lawChanges.map(c=>`<div class="item"><div class="between row"><div><b>${c.title}</b><div class="muted small">${c.date}</div></div><span class="badge ${riskClass(c.impact)}">${c.impact}</span></div><p class="small">${c.text}</p><div class="source">Source: <a href="${c.url}" target="_blank">${c.source}</a></div></div>`).join("")}
function fillProfile(){
 let p=state.profile;
 document.getElementById("pName").value=p.name;document.getElementById("pIncorporationDate").value=p.incorporationDate||"";document.getElementById("pEntityType").value=p.entityType||"";document.getElementById("pIndustry").value=p.industry;document.getElementById("pEmployees").value=p.employees;document.getElementById("pTown").value=p.town;
 ["Vat","Paye","Trade","Data","Tender","Premises"].forEach(k=>document.getElementById("p"+k).value=String(p[k.toLowerCase()]));
 document.getElementById("pTradeAnniversary").value=p.tradeAnniversary||"";
 document.getElementById("pCipaMonth").value=p.cipaMonth||"";
 document.getElementById("pCitizenOwned").value=String(p.citizenOwned!==false);
 document.getElementById("pTurnover").value=p.turnover||0;document.getElementById("pAnnualTaxableSupplies").value=p.annualTaxableSupplies??"";document.getElementById("pHighestMonthlyEmployeePay").value=p.highestMonthlyEmployeePay??"";document.getElementById("pManufacturing").value=String(!!p.manufacturing);
}
function saveProfile(){
 state.profile={name:pName.value.trim()||"Unnamed Business",incorporationDate:pIncorporationDate.value||"",entityType:pEntityType.value||"",industry:pIndustry.value,employees:+pEmployees.value||0,town:pTown.value.trim(),vat:pVat.value==="true",vatCategory:pVatCategory.value||"",paye:pPaye.value==="true",trade:pTrade.value==="true",data:pData.value==="true",tender:pTender.value==="true",premises:pPremises.value==="true",tradeAnniversary:pTradeAnniversary.value,cipaMonth:pCipaMonth.value,citizenOwned:pCitizenOwned.value==="true",turnover:+pTurnover.value||0,annualTaxableSupplies:pAnnualTaxableSupplies.value===""?null:+pAnnualTaxableSupplies.value,highestMonthlyEmployeePay:pHighestMonthlyEmployeePay.value===""?null:+pHighestMonthlyEmployeePay.value,manufacturing:pManufacturing.value==="true",mfgActivity:state.profile.mfgActivity||"",mfgFactory:!!state.profile.mfgFactory,mfgAnniversary:state.profile.mfgAnniversary||""};
 logEvent("PROFILE_UPDATED",{name:state.profile.name,industry:state.profile.industry,employees:state.profile.employees});
 save();renderAll();showView("dashboard")
}
function resetDemo(){if(!confirm("Reset this workspace to demo data?"))return;store=structuredClone(DEFAULT_STATE);store.activeRole=currentUser?.role||"owner";state=store.companies[0];save();renderAll();logEvent("DEMO_RESET",{})}
function save(){
 let i=store.companies.findIndex(c=>c.id===state.id);if(i>=0)store.companies[i]=state;store.activeCompanyId=state.id;
 clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{let persisted={...store,audit:[]};let result=await apiFetch("/api/state",{method:"PUT",body:JSON.stringify({state:persisted,version:serverStateVersion})});serverStateVersion=result.version||serverStateVersion}catch(err){console.error("Save failed",err);showSyncError(err.message)}},180)
}
function logEvent(type,data={}){
 /* UI activity is not authoritative audit history. Server mutation endpoints write the sealed ledger. */
}
function switchRole(role){/* Production role is derived from authenticated membership. */}
function applyRoleUi(){
 let role=currentUser?.role||store.activeRole||"owner";store.activeRole=role;let label=document.getElementById("roleLabel");if(label)label.textContent=role.charAt(0).toUpperCase()+role.slice(1);
 let rules={owner:["dashboard","obligations","employer","employees","privacy","tender","events","manufacturing","sources","taxprofile","corporate","employmentcontrols","calendar","vault","documents","changes","audit","rules","expert","publishing","security","integrations","billing","profile"],manager:["dashboard","obligations","employer","employees","privacy","tender","events","manufacturing","taxprofile","corporate","employmentcontrols","calendar","vault","documents","changes"],reviewer:["dashboard","obligations","sources","changes","rules","expert","publishing","audit","documents"],auditor:["dashboard","obligations","calendar","vault","changes","audit","rules","sources"]};
 document.querySelectorAll(".nav button[data-view]").forEach(b=>{b.style.display=(rules[role]||rules.owner).includes(b.dataset.view)?"":"none"});
 let add=document.getElementById("addCompanyBtn");if(add)add.style.display=role==="owner"?"":"none";
}
function renderCompanies(){
 let sel=document.getElementById("companySelect");if(!sel)return;sel.replaceChildren();
 (store.companies||[]).forEach(c=>{let o=document.createElement("option");o.value=safeId(c.id);o.textContent=String(c.profile?.name||"Unnamed Business");o.selected=c.id===state.id;sel.appendChild(o)});
}
function switchCompany(id){
 let next=store.companies.find(c=>c.id===id);if(!next)return;
 state=next;store.activeCompanyId=id;save();logEvent("COMPANY_SWITCHED",{companyId:id});renderAll()
}
function addCompany(){
 let name=prompt("New company name");if(!name)return;
 let c=structuredClone(DEFAULT_COMPANY);c.id="co_"+Date.now();c.profile.name=name;c.profile.employees=0;c.profile.vat=false;c.profile.paye=false;c.profile.trade=false;c.profile.manufacturing=false;c.profile.mfgActivity="";c.profile.mfgFactory=false;c.profile.mfgAnniversary="";c.profile.data=false;c.profile.tender=false;c.evidence=[];c.completed={};c.employees=[];c.cases=[];c.reviews=[];c.fixedTerms=[];c.privacy={controls:{},activities:[]};
 store.companies.push(c);state=c;store.activeCompanyId=c.id;logEvent("COMPANY_CREATED",{companyId:c.id,name});save();renderAll();showView("profile")
}
function renderAudit(){
 let el=document.getElementById("auditList");if(!el)return;
 let rows=store.audit.filter(x=>!x.companyId||x.companyId===state.id).slice(0,100);
 el.innerHTML=rows.length?rows.map(x=>`<div class="item audit"><b>${escapeHtml(x.type)}</b> · ${new Date(x.at).toLocaleString()}<div class="muted">${escapeHtml(JSON.stringify(x.data))}</div></div>`).join(""):`<div class="muted">No audit events yet.</div>`
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

</head><body><div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div><h1>${escapeHtml(state.profile.name)} — Compliance Report</h1><div>Generated ${today}</div><div>Ruleset BW-2026.08.30-launch</div><div class="scores"><div class="scorebox"><b>Compliance</b><div>${s.comp}/100</div></div><div class="scorebox"><b>Protection</b><div>${s.prot}/100</div></div></div><h2>Applicable Controls</h2><table><tr><th>Area</th><th>Control</th><th>Status</th><th>Risk</th><th>Authority</th></tr>${rows}</table><h2>Evidence Register</h2><table><tr><th>Evidence</th><th>Category</th><th>Status</th><th>Review date</th></tr>${ev||'<tr><td colspan="4">No evidence metadata recorded</td></tr>'}</table><h2>Important</h2><p>This report is a compliance-management output, not a legal opinion. Underlying evidence, business facts, statutory text and effective dates should be validated before relying on it for a regulatory, tax, employment or litigation decision.</p>
<div class="modal" id="passwordResetModal"><div class="modalbox">
  <div class="between row"><h2>Set a new password</h2><button class="btn alt" onclick="closeModal('passwordResetModal')">Close</button></div>
  <div class="stack">
    <div><label>New password</label><input id="newResetPassword" type="password" minlength="10" autocomplete="new-password"></div>
    <button class="btn" onclick="completePasswordReset()">Update password</button>
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
 state.reviews=state.reviews||[];
 let existingKeys=new Set(state.reviews.filter(r=>r.autoKey).map(r=>r.autoKey));
 applicable().filter(r=>r.requiresExpert && /Action required|review|Professional review required/i.test(r.status())).forEach(rule=>{
  let key="rule:"+rule.id;
  if(!existingKeys.has(key)){
   state.reviews.push({id:"rv_"+Date.now()+"_"+rule.id,autoKey:key,type:rule.area,issue:rule.title,risk:rule.risk,status:"Open",note:"Automatically queued from applicable control requiring professional validation.",createdAt:new Date().toISOString()})
  }
 });
 (state.cases||[]).filter(c=>c.expertReview&&c.status==="Open").forEach(c=>{
  let key="case:"+c.id;
  if(!existingKeys.has(key)){
   state.reviews.push({id:"rv_"+Date.now()+"_"+c.id,autoKey:key,type:"Employment",issue:c.type+" — "+c.employee,risk:c.risk,status:"Open",note:"Automatically queued from Employer Shield case.",createdAt:new Date().toISOString()})
  }
 });
}
function addReviewRequest(){
 let issue=rvIssue.value.trim();if(!issue)return;
 state.reviews=state.reviews||[];
 let r={id:"rv_"+Date.now(),type:rvType.value,issue,risk:rvRisk.value,status:"Open",note:rvNote.value.trim(),createdAt:new Date().toISOString()};
 state.reviews.unshift(r);logEvent("EXPERT_REVIEW_REQUESTED",{reviewId:r.id,type:r.type,risk:r.risk});rvIssue.value=rvNote.value="";save();renderAll()
}
function setReviewStatus(id,status){
 let r=(state.reviews||[]).find(x=>x.id===id);if(!r)return;r.status=status;r.updatedAt=new Date().toISOString();
 logEvent("EXPERT_REVIEW_STATUS",{reviewId:id,status});save();renderAll()
}
function renderExpert(){
 seedAutoReviews();
 let arr=state.reviews||[],open=arr.filter(r=>r.status==="Open"),high=open.filter(r=>r.risk==="High");
 let q=id=>document.getElementById(id);
 if(q("reviewCount"))q("reviewCount").textContent=open.length;if(q("highReviewCount"))q("highReviewCount").textContent=high.length;
 if(q("ruleValidationCount"))q("ruleValidationCount").textContent=rules.filter(r=>r.requiresExpert).length;
 if(q("reviewQueue"))q("reviewQueue").innerHTML=open.length?open.map(r=>`<div class="item"><div class="between row"><div><b>${escapeHtml(r.issue)}</b><div class="muted small">${escapeHtml(r.type)} · ${new Date(r.createdAt).toLocaleDateString()}</div></div><span class="badge ${riskClass(r.risk)}">${r.risk}</span></div><div class="small" style="margin-top:7px">${escapeHtml(r.note||"")}</div><div class="actions" style="margin-top:9px"><button class="btn soft" onclick="setReviewStatus('${safeId(r.id)}','Resolved')">Mark reviewed</button></div></div>`).join(""):'<div class="notice good">No open professional-review items.</div>';
}

function renderRuleLibrary(){
 let el=document.getElementById("ruleLibrary");if(!el)return;
 el.innerHTML=rules.map(r=>`<div class="item"><div class="between row"><div><b>${r.title}</b><div class="muted small">${r.area} · ${r.authority}</div></div><span class="badge ${riskClass(r.risk)}">${r.risk}</span></div><div class="rulemeta"><span>Effective: ${r.effectiveFrom}</span><span>Review: ${r.review}</span><span>Source linked</span>${r.requiresExpert?'<span>Expert validation required</span>':''}</div><p class="small">${r.why}</p><div class="source"><a href="${r.url}" target="_blank">${r.source}</a></div></div>`).join("")
}
function openCase(type){caseType.value=type;caseEmployee.value="";caseFacts.value="";caseRisk.value=/Termination|Misconduct|deduction/i.test(type)?"High":"Medium";openModal("caseModal")}
function saveCase(){
 let employee=caseEmployee.value.trim();if(!employee)return alert("Enter an employee or staff reference.");
 let c={id:"case_"+Date.now(),employee,type:caseType.value,facts:caseFacts.value.trim(),risk:caseRisk.value,status:"Open",openedAt:new Date().toISOString(),expertReview:/High/.test(caseRisk.value)||/Termination|Misconduct|deduction/i.test(caseType.value)};
 state.cases=state.cases||[];state.cases.unshift(c);logEvent("HR_CASE_OPENED",{caseId:c.id,type:c.type,risk:c.risk,expertReview:c.expertReview});save();renderCases();closeModal("caseModal")
}
function renderCases(){
 let el=document.getElementById("caseList");if(!el)return;let arr=state.cases||[];
 el.innerHTML=arr.length?arr.map(c=>`<div class="item"><div class="between row"><div><b>${escapeHtml(c.employee)}</b><div class="muted small">${escapeHtml(c.type)} · ${escapeHtml(c.status)}</div></div><span class="badge ${riskClass(c.risk)}">${c.risk}</span></div>${c.expertReview?'<div class="source">Professional review gate: ON</div>':''}</div>`).join(""):`<div class="muted small">No active cases.</div>`
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function safeId(s){return String(s??"").replace(/[^A-Za-z0-9_-]/g,"")}

function quickNavigate(value){
  const q=String(value||'').trim().toLowerCase();
  if(!q)return;
  const buttons=[...document.querySelectorAll('.nav button[data-view]')].filter(b=>b.style.display!=='none');
  const match=buttons.find(b=>b.textContent.trim().toLowerCase().includes(q)||b.dataset.view.toLowerCase().includes(q));
  if(match&&q.length>=2){showView(match.dataset.view);document.getElementById('quickNav').value=''}
}


function animateViewItems(){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const view=document.querySelector(".view.active");
  if(!view)return;
  const els=[...view.querySelectorAll(".card,.item,.eventcard,.sourcebox,.notice,.callout")].slice(0,20);
  els.forEach((el,i)=>{
    el.animate(
      [{opacity:.001,transform:"translateY(8px)"},{opacity:1,transform:"translateY(0)"}],
      {duration:240,delay:Math.min(i*22,220),easing:"cubic-bezier(.22,1,.36,1)",fill:"both"}
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


function startOAuth(provider){if(!["google","facebook"].includes(provider))return;if(location.protocol==="file:"){alert("Social sign-in requires the deployed OAuth backend. Use Preview workspace for the standalone HTML.");return}const next=encodeURIComponent(window.location.pathname+window.location.search);window.location.assign(`/api/auth/oauth/${provider}/start?next=${next}`)}


const STANDALONE_PREVIEW=location.protocol==="file:";
const PREVIEW_API={
"/api/account/social":{google:{linked:false},facebook:{linked:false}},
"/api/account/sessions":{items:[{id:"preview",created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()}]},
"/api/account/onboarding":{complete:true},"/api/account/deletion-status":{legalHold:false,latest:null},
"/api/ai/credits":{wallet:{balance:75,monthly_allowance:75,lifetime_purchased:150,lifetime_used:42},plan:{plan:"pro"},packs:[{sku:"AI50",credits:50,price_bwp:49},{sku:"AI150",credits:150,price_bwp:129}],ledger:[]},
"/api/ai/cost-control":{control:{monthly_credit_cap:300,monthly_cost_cap_bwp:120,low_balance_threshold:25},usage:{creditsUsed:42,providerCostBwp:11.8}},
"/api/tenders":{items:[{id:"td1",title:"Office Supplies Framework",issuer:"Demo procuring entity",closing_at:new Date(Date.now()+864000000).toISOString(),status:"watching"}]},
"/api/employees":{items:[{id:"emp1",full_name:"Demo Employee",role_title:"Operations Assistant",employment_type:"permanent",status:"active"}]},
"/api/hr/cases":{items:[{id:"hr1",case_type:"performance",risk_level:"medium",status:"evidence",summary:"Demo case",professional_review_required:0}]},
"/api/company-actions":{items:[{id:"ca1",action_type:"annual-return",status:"ready",due_at:new Date(Date.now()+1728000000).toISOString()}]},
"/api/licences":{items:[{id:"lic1",licence_type:"Trade licence",authority:"Local authority",renewal_due_at:new Date(Date.now()+3456000000).toISOString(),status:"active"}]},
"/api/next-actions":{items:[{source:"tender",priority:1,title:"Tender: Office Supplies Framework",status:"watching",dueAt:new Date(Date.now()+864000000).toISOString()}]},
"/api/partner/clients":{items:[{client_tenant_id:"Demo Client SME",relationship_type:"advisor",status:"active"}]},
"/api/partner/tasks":{items:[{title:"Review annual return evidence",priority:1,status:"open",due_at:new Date(Date.now()+432000000).toISOString()}]},
"/api/passport":{score:{score:75,verified:6,total:8},controls:[{control_key:"CIPA annual return",status:"verified"},{control_key:"Trade licence",status:"verified"}],shares:[]},
"/api/workflow-rules":{items:[{trigger_type:"deadline",action_type:"create-task",enabled:1}]},
"/api/notifications":{items:[{channel:"in_app",template_key:"compliance_schedule_due",subject:"Compliance review due",status:"queued",scheduled_at:new Date().toISOString()}]},
"/api/notification-preferences":{item:{email_enabled:1,whatsapp_enabled:0,sms_enabled:0,in_app_enabled:1}},
"/api/compliance-schedules":{items:[{schedule_type:"weekly-compliance-review",cadence:"weekly",next_run_at:new Date(Date.now()+604800000).toISOString(),enabled:1}]},
"/api/partner/invites":{items:[]},
"/api/services/catalog":{items:[{sku:"TENDER_REVIEW",name:"Tender Review",description:"Human review of tender readiness and submission risks.",base_price_bwp:500},{sku:"TENDER_PACK",name:"Assisted Tender Pack",description:"Assisted assembly and submission-readiness check.",base_price_bwp:1500},{sku:"HR_CASE_REVIEW",name:"HR Case Review",description:"Professional review of a high-risk HR case.",base_price_bwp:750},{sku:"COMPANY_CHANGE",name:"Company Change Assistance",description:"Assisted company-secretary change workflow.",base_price_bwp:450},{sku:"COMPLIANCE_AUDIT",name:"SME Compliance Audit",description:"Structured compliance review.",base_price_bwp:1200},{sku:"LICENCE_ASSIST",name:"Licence Assistance",description:"Assisted licence preparation.",base_price_bwp:600}]},"/api/services/orders":{items:[]}};
function previewResponse(url,opts={}){if(String(opts.method||"GET").toUpperCase()!=="GET")return {ok:true,id:"preview-"+Date.now(),status:"preview",priceBwp:500,message:"Preview only"};return structuredClone(PREVIEW_API[url]||{items:[]})}
async function apiJson(url,opts={}){if(STANDALONE_PREVIEW)return previewResponse(url,opts);const headers={...(opts.headers||{})};if(opts.method&&!['GET','HEAD'].includes(String(opts.method).toUpperCase())&&csrfToken)headers["X-CSRF-Token"]=csrfToken;const r=await fetch(url,{credentials:"same-origin",...opts,headers});let data={};try{data=await r.json()}catch{}if(!r.ok)throw Object.assign(new Error(data.message||data.error||"Request failed"),{status:r.status,data});return data}
function enterStandalonePreview(){document.body.classList.add("standalone-preview");store=structuredClone(DEFAULT_STATE);state=store.companies[0];store.activeRole="owner";currentUser={id:"preview-user",email:"preview@local",role:"owner"};marketingGate.classList.add("hidden");authGate.classList.add("hidden");appShell.style.visibility="visible";renderAll();applyRoleUi();showView("dashboard");const chip=document.querySelector(".prodchip");if(chip)chip.textContent="PREVIEW MODE"}

async function renderSocialAccounts(){
  const list=document.getElementById("socialAccountList");if(!list)return;
  try{
    const s=await apiJson("/api/account/social");
    const providers=[["google","Google",s.google],["facebook","Facebook",s.facebook]];
    document.getElementById("googleLinkStatus").textContent=s.google.linked?"Linked ✓":"Not linked";
    document.getElementById("facebookLinkStatus").textContent=s.facebook.linked?"Linked ✓":"Not linked";
    list.innerHTML=providers.map(([key,label,val])=>`<div class="item"><div class="between row"><div><b>${label}</b><div class="muted small">${val.linked?`Linked${val.email?` · ${escapeHtml(val.email)}`:""}`:"Use this account to sign in faster."}</div></div>${val.linked?`<button class="btn alt" onclick="unlinkSocial('${key}')">Disconnect</button>`:`<button class="btn soft" onclick="window.location.assign('/api/account/social/${key}/link')">Connect</button>`}</div></div>`).join("");
  }catch(e){
    list.innerHTML=`<div class="notice bad"><b>Could not load linked accounts.</b><div class="small">${escapeHtml(e.message)}</div></div>`;
  }
}
async function unlinkSocial(provider){
  if(!confirm(`Disconnect ${provider}?`))return;
  try{
    await apiJson(`/api/account/social/${provider}`,{method:"DELETE",headers:{"content-type":"application/json"}});
    renderSocialAccounts();
  }catch(e){alert(e.message)}
}
function handleOAuthResult(){
  const q=new URLSearchParams(location.search);
  if(q.get("oauth_error")){
    const msg=q.get("oauth_error");
    setTimeout(()=>alert(`Social sign-in was not completed: ${msg}`),50);
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
    sl.innerHTML=data.items.length?data.items.map((x,i)=>`<div class="item"><b>Session ${i+1}</b><div class="muted small">Created ${new Date(x.created_at).toLocaleString()} · expires ${new Date(x.expires_at).toLocaleString()}</div></div>`).join(""):'<div class="muted small">No active sessions found.</div>';
  }catch(e){sl.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function signOutEverywhere(){
  if(!confirm("Sign out all sessions on all devices?"))return;
  try{await apiJson("/api/account/sessions",{method:"DELETE"});location.reload()}catch(e){alert(e.message)}
}
async function requestPasswordReset(){
  const email=(document.getElementById("recoveryEmail")?.value||"").trim();
  if(!email)return;
  try{
    const r=await apiJson("/api/auth/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
    alert(r.message||"If the account exists, reset instructions have been sent.")
  }catch(e){alert(e.message)}
}
async function completePasswordReset(){
  const password=document.getElementById("newResetPassword").value;
  if(!pendingResetToken||password.length<10){alert("Use a password of at least 10 characters.");return}
  try{
    const r=await apiJson("/api/auth/password-reset/complete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:pendingResetToken,password})});
    alert(r.message||"Password updated.");
    pendingResetToken=null;closeModal("passwordResetModal");
  }catch(e){alert(e.message)}
}
function handleResetLink(){
  const q=new URLSearchParams(location.search);
  const token=q.get("reset_token");
  if(token){
    pendingResetToken=token;
    history.replaceState({},document.title,location.pathname);
    setTimeout(()=>openModal("passwordResetModal"),30);
  }
}


async function renderOnboardingBanner(){
  const el=document.getElementById("welcomeSetupBanner");if(!el)return;
  try{
    const r=await apiJson("/api/account/onboarding");
    el.style.display=r.complete?"none":"block";
  }catch{el.style.display="none"}
}
async function exportMyAccount(){
  try{
    const data=await apiJson("/api/account/export");
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bw-compliance-account-export.json";a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }catch(e){alert(e.message)}
}
async function requestAccountDeletion(){
  const confirmation=(document.getElementById("deleteAccountConfirmation")?.value||"").trim();
  if(confirmation!=="DELETE MY ACCOUNT"){alert("Type DELETE MY ACCOUNT exactly.");return}
  if(!confirm("Submit an account deletion request?"))return;
  try{
    const r=await apiJson("/api/account/delete-request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmation})});
    alert(r.message||"Deletion request recorded.");
  }catch(e){alert(e.message)}
}


async function renderDeletionStatus(){
  const box=document.getElementById("deletionStatusBox");if(!box)return;
  try{
    const r=await apiJson("/api/account/deletion-status");
    const latest=r.latest;
    box.innerHTML=`<div class="checkline"><span class="dot ${r.legalHold?"bad":"good"}"></span><div><b>${r.legalHold?"Legal hold active":"No active legal hold"}</b><div class="muted small">${r.legalHold?"Deletion cannot be approved or completed until the hold is released.":"Deletion requests move through requested → approved → completed states."}</div></div></div>`+
      (latest?`<div class="item"><b>Latest deletion request</b><div class="muted small">Status: ${escapeHtml(latest.status)} · ${new Date(latest.requested_at).toLocaleString()}</div>${latest.reason?`<div class="small">${escapeHtml(latest.reason)}</div>`:""}</div>`:"");
  }catch(e){box.textContent="Could not load deletion status."}
}


async function createAiCreditOrder(sku){
  try{
    const r=await apiJson("/api/payments/ai-credit-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sku})});
    if(r.pack) console.info(`AI credit checkout: ${r.pack.credits} credits for P${r.pack.price_bwp}`);
    await renderPayments();
    await openHostedCheckout(r.paymentOrder.id);
  }catch(e){alert(e.message)}
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
    box.innerHTML=`<div class="item"><b>${Number(w.balance||0)} credits available</b><div class="muted small">${escapeHtml(p.plan||"starter")} plan · ${Number(w.monthly_allowance||0)} monthly credits · ${Number(w.lifetime_purchased||0)} purchased lifetime</div></div>`;
    const packs=document.getElementById("aiCreditPacks");
    if(packs)packs.innerHTML=(r.packs||[]).map(x=>`<button class="eventcard" onclick="createAiCreditOrder('${escapeHtml(x.sku)}')"><b>${x.credits} credits</b><div class="muted small">P${x.price_bwp}</div></button>`).join("");
    const hist=document.getElementById("aiCreditHistory");
    if(hist)hist.innerHTML=(r.ledger||[]).slice(0,12).map(x=>`<div class="item"><b>${escapeHtml(x.entry_type)}</b><div class="muted small">${x.credits>0?"+":""}${x.credits} credits${x.feature?` · ${escapeHtml(x.feature)}`:""} · ${new Date(x.occurred_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No activity yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
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
  }catch(e){}
}
async function saveAiCostControls(){
  const credit=document.getElementById("aiMonthlyCreditCapInput").value;
  const cost=document.getElementById("aiMonthlyCostCapInput").value;
  const low=document.getElementById("aiLowBalanceInput").value;
  try{
    await apiJson("/api/ai/cost-control",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
      monthlyCreditCap:credit===""?null:Number(credit),
      monthlyCostCapBwp:cost===""?null:Number(cost),
      lowBalanceThreshold:Number(low||25)
    })});
    await renderAiCostControls();alert("AI cost controls saved.");
  }catch(e){alert(e.message)}
}


async function createTender(){
  const title=(document.getElementById("newTenderTitle").value||"").trim();
  if(!title)return alert("Enter a tender title.");
  try{
    await apiJson("/api/tenders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      title,issuer:document.getElementById("newTenderIssuer").value,
      closingAt:document.getElementById("newTenderClosing").value||null
    })});
    document.getElementById("newTenderTitle").value="";
    await renderTenderReady();
  }catch(e){alert(e.message)}
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
    list.innerHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.issuer||"")} ${x.closing_at?`· closes ${new Date(x.closing_at).toLocaleDateString()}`:""} · ${escapeHtml(x.status||"watching")}</div></div>`).join("")||'<div class="muted small">No tenders yet.</div>';
  }catch(e){list.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderEmployeesForHr(){
  const sel=document.getElementById("hrCaseEmployee");if(!sel)return;
  try{
    const r=await apiJson("/api/employees");
    const items=r.items||[];
    document.getElementById("employeeCount").textContent=items.length;
    sel.innerHTML='<option value="">General / not assigned</option>'+items.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.full_name)}</option>`).join("");
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
  }catch(e){alert(e.message)}
}
async function advanceHrCase(id,status){
  try{
    await apiJson(`/api/hr/cases/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    await renderHrCases();
  }catch(e){alert(e.message)}
}
async function renderHrCases(){
  const list=document.getElementById("hrCaseList");if(!list)return;
  try{
    const r=await apiJson("/api/hr/cases");
    const items=r.items||[];
    document.getElementById("openHrCases").textContent=items.filter(x=>x.status!=="closed").length;
    document.getElementById("highRiskHrCases").textContent=items.filter(x=>["high","critical"].includes(x.risk_level)).length;
    document.getElementById("reviewHrCases").textContent=items.filter(x=>Number(x.professional_review_required)===1&&x.status!=="closed").length;
    list.innerHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.case_type)}</b><div class="muted small">${escapeHtml(x.risk_level)} risk · ${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.summary||"")}</div></div><div>${x.status==="open"?`<button class="btn alt" onclick="advanceHrCase('${x.id}','evidence')">Evidence</button>`:""}${x.status==="evidence"?`<button class="btn alt" onclick="advanceHrCase('${x.id}','review')">Review</button>`:""}${x.status==="review"?`<button class="btn soft" onclick="advanceHrCase('${x.id}','approved')">Approve</button>`:""}${x.status==="approved"?`<button class="btn" onclick="advanceHrCase('${x.id}','closed')">Close</button>`:""}<button class="btn alt" onclick="createEmploymentDefensePack('${x.id}')">Defense Pack</button></div></div></div>`).join("")||'<div class="muted small">No HR cases yet.</div>';
  }catch(e){list.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function createCompanyAction(){
  try{
    await apiJson("/api/company-actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      actionType:document.getElementById("companyActionType").value,
      dueAt:document.getElementById("companyActionDue").value||null
    })});
    await renderCompanyActions();await renderUnifiedNextActions();
  }catch(e){alert(e.message)}
}
async function advanceCompanyAction(id,status){
  try{
    await apiJson(`/api/company-actions/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    await renderCompanyActions();await renderUnifiedNextActions();
  }catch(e){alert(e.message)}
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
    list.innerHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.action_type)}</b><div class="muted small">${escapeHtml(x.status)}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}</div></div><div>${x.status==="draft"?`<button class="btn alt" onclick="advanceCompanyAction('${x.id}','ready')">Ready</button>`:""}${x.status==="ready"?`<button class="btn alt" onclick="advanceCompanyAction('${x.id}','review')">Review</button>`:""}${x.status==="review"?`<button class="btn soft" onclick="advanceCompanyAction('${x.id}','approved')">Approve</button>`:""}${x.status==="approved"?`<button class="btn" onclick="advanceCompanyAction('${x.id}','completed')">Complete</button>`:""}</div></div></div>`).join("")||'<div class="muted small">No actions yet.</div>';
  }catch(e){list.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function createLicence(){
  const type=(document.getElementById("newLicenceType").value||"").trim();if(!type)return alert("Enter a licence type.");
  try{
    await apiJson("/api/licences",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      licenceType:type,authority:document.getElementById("newLicenceAuthority").value,
      issuedAt:document.getElementById("newLicenceIssued").value||null,
      renewalDueAt:document.getElementById("newLicenceRenewal").value||null
    })});
    document.getElementById("newLicenceType").value="";
    await renderLicences();await renderUnifiedNextActions();
  }catch(e){alert(e.message)}
}
async function renderLicences(){
  const list=document.getElementById("licenceList");if(!list)return;
  try{
    const r=await apiJson("/api/licences");const items=r.items||[];
    document.getElementById("activeLicenceCount").textContent=items.filter(x=>x.status==="active").length;
    const now=new Date();
    const due=items.filter(x=>x.renewal_due_at&&new Date(x.renewal_due_at)>now&&new Date(x.renewal_due_at)-now<30*86400000).length;
    const risk=items.filter(x=>x.renewal_due_at&&new Date(x.renewal_due_at)<now).length;
    document.getElementById("licenceRenewalsDue").textContent=due;
    document.getElementById("licenceAtRisk").textContent=risk;
    list.innerHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.licence_type)}</b><div class="muted small">${escapeHtml(x.authority||"")}${x.renewal_due_at?` · renew ${new Date(x.renewal_due_at).toLocaleDateString()}`:""} · ${escapeHtml(x.status||"active")}</div></div>`).join("")||'<div class="muted small">No licences yet.</div>';
  }catch(e){list.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderUnifiedNextActions(){
  const box=document.getElementById("unifiedNextActions");if(!box)return;
  try{
    const r=await apiJson("/api/next-actions");
    const items=r.items||[];
    box.innerHTML=items.slice(0,12).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.source)} · ${escapeHtml(x.status||"")}${x.dueAt?` · ${new Date(x.dueAt).toLocaleDateString()}`:""}</div></div><span class="badge">${x.priority===1?"High":x.priority===2?"Normal":"Low"}</span></div></div>`).join("")||'<div class="muted small">No urgent actions. Your workspace is clear.</div>';
  }catch(e){box.innerHTML='<div class="muted small">Could not load unified actions.</div>'}
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
    clients.innerHTML=ci.map(x=>`<div class="item"><b>${escapeHtml(x.client_tenant_id)}</b><div class="muted small">${escapeHtml(x.relationship_type)} · ${escapeHtml(x.status)}</div></div>`).join("")||'<div class="muted small">No linked clients yet.</div>';
    document.getElementById("partnerTaskList").innerHTML=ti.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">Priority ${x.priority} · ${escapeHtml(x.status)}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No partner tasks.</div>';
  }catch(e){}
}
async function renderPassport(){
  const list=document.getElementById("passportControlList");if(!list)return;
  try{
    const r=await apiJson("/api/passport"),shares=r.shares||[];
    document.getElementById("passportScore").textContent=`${r.score.score}%`;
    document.getElementById("passportVerified").textContent=r.score.verified;
    document.getElementById("passportTotal").textContent=r.score.total;
    document.getElementById("passportShares").textContent=shares.filter(x=>!x.revoked_at&&!x.invalidated_at&&(!x.expires_at||new Date(x.expires_at)>new Date())).length;
    list.innerHTML=(r.controls||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.control_key)}</b><div class="muted small">${escapeHtml(x.status)}${x.expires_at?` · review/expiry ${new Date(x.expires_at).toLocaleDateString()}`:""}</div></div><label class="small"><input class="passportControlSelect" type="checkbox" value="${escapeHtml(x.control_key)}" ${x.status==="verified"?"checked":""}> Share</label></div></div>`).join("")||'<div class="muted small">No Passport controls yet. Refresh controls from the Control Center first.</div>';
    document.getElementById("passportShareList").innerHTML=shares.map(x=>{
      const status=x.revoked_at?"Revoked":x.invalidated_at?"Reissue required":(x.expires_at&&new Date(x.expires_at)<new Date()?"Expired":"Active");
      return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.label||"Passport share")}</b><div class="muted small">${escapeHtml(status)} · revision ${x.issued_revision??0}${x.expires_at?` · expires ${new Date(x.expires_at).toLocaleDateString()}`:""}</div>${x.invalidation_reason?`<div class="small">Reason: ${escapeHtml(x.invalidation_reason)}</div>`:""}</div>${!x.revoked_at&&!x.invalidated_at?`<button class="btn alt" onclick="revokePassportShare('${x.id}')">Revoke</button>`:""}</div></div>`;
    }).join("")||'<div class="muted small">No shares yet.</div>';
  }catch(e){list.innerHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}
async function createPassportShare(){
  try{
    const selected=[...document.querySelectorAll(".passportControlSelect:checked")].map(x=>x.value);
    if(!selected.length){alert("Select at least one control to share.");return}
    const scopes=["controls"];
    if(document.getElementById("passportScopeScore")?.checked)scopes.push("score");
    if(document.getElementById("passportScopeCompany")?.checked)scopes.push("company_name");
    if(document.getElementById("passportScopeVerifiedAt")?.checked)scopes.push("verified_at");
    const r=await apiJson("/api/passport/share",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      label:document.getElementById("passportShareLabel")?.value||"Compliance verification",
      maxViews:Number(document.getElementById("passportMaxViews")?.value||25),selectedControls:selected,scopes
    })});
    const box=document.getElementById("passportShareCreated");
    box.innerHTML=`<div class="notice"><b>Secure link created.</b><div class="small">The bearer token is placed after # so it is not sent in the HTTP request URL. Copy this link now; the raw token is not stored for later display.</div><input id="createdPassportShareUrl" readonly value="${escapeHtml(r.shareUrl)}" style="margin-top:8px"><button class="btn alt" style="margin-top:8px" onclick="navigator.clipboard?.writeText(document.getElementById('createdPassportShareUrl').value)">Copy link</button></div>`;
    await renderPassport();await renderPassportShares();
  }catch(e){alert(e.message)}
}
async function createWorkflowRule(){
  try{
    await apiJson("/api/workflow-rules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      triggerType:document.getElementById("workflowTrigger").value,
      actionType:document.getElementById("workflowAction").value
    })});
    await renderWorkflowRules();
  }catch(e){alert(e.message)}
}
async function renderWorkflowRules(){
  const list=document.getElementById("workflowRuleList");if(!list)return;
  try{
    const r=await apiJson("/api/workflow-rules");const items=r.items||[];
    document.getElementById("workflowRuleCount").textContent=items.length;
    document.getElementById("workflowEnabledCount").textContent=items.filter(x=>Number(x.enabled)===1).length;
    list.innerHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.trigger_type)}</b><div class="muted small">→ ${escapeHtml(x.action_type)} · ${Number(x.enabled)===1?"enabled":"disabled"}</div></div>`).join("")||'<div class="muted small">No automation rules yet.</div>';
  }catch(e){}
}


async function renderNotifications(){
  const list=document.getElementById("notificationList");if(!list)return;
  try{
    const [n,p]=await Promise.all([apiJson("/api/notifications"),apiJson("/api/notification-preferences")]);
    const items=n.items||[];
    document.getElementById("notifQueued").textContent=items.filter(x=>x.status==="queued").length;
    document.getElementById("notifSent").textContent=items.filter(x=>x.status==="sent").length;
    document.getElementById("notifFailed").textContent=items.filter(x=>x.status==="failed").length;
    list.innerHTML=items.slice(0,50).map(x=>`<div class="item"><b>${escapeHtml(x.subject||x.template_key)}</b><div class="muted small">${escapeHtml(x.channel)} · ${escapeHtml(x.status)} · ${new Date(x.scheduled_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No notifications yet.</div>';
    const pref=p.item||{};
    document.getElementById("prefEmail").checked=Number(pref.email_enabled)===1;
    document.getElementById("prefWhatsapp").checked=Number(pref.whatsapp_enabled)===1;
    document.getElementById("prefSms").checked=Number(pref.sms_enabled)===1;
    document.getElementById("prefInApp").checked=Number(pref.in_app_enabled)!==0;
  }catch(e){}
}
async function saveNotificationPreferences(){
  try{
    await apiJson("/api/notification-preferences",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
      emailEnabled:document.getElementById("prefEmail").checked,
      whatsappEnabled:document.getElementById("prefWhatsapp").checked,
      smsEnabled:document.getElementById("prefSms").checked,
      inAppEnabled:document.getElementById("prefInApp").checked
    })});
    alert("Notification preferences saved.");
  }catch(e){alert(e.message)}
}
async function createComplianceSchedule(){
  try{
    await apiJson("/api/compliance-schedules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      scheduleType:document.getElementById("scheduleType").value,
      cadence:document.getElementById("scheduleCadence").value
    })});
    await renderSchedules();
  }catch(e){alert(e.message)}
}
async function renderSchedules(){
  const list=document.getElementById("scheduleList");if(!list)return;
  try{
    const r=await apiJson("/api/compliance-schedules");const items=r.items||[];
    document.getElementById("scheduleCount").textContent=items.length;
    document.getElementById("scheduleEnabled").textContent=items.filter(x=>Number(x.enabled)===1).length;
    const dates=items.filter(x=>x.next_run_at).map(x=>new Date(x.next_run_at)).sort((a,b)=>a-b);
    document.getElementById("scheduleNext").textContent=dates.length?dates[0].toLocaleDateString():"—";
    list.innerHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.schedule_type)}</b><div class="muted small">${escapeHtml(x.cadence)} · ${Number(x.enabled)===1?"enabled":"disabled"}${x.next_run_at?` · next ${new Date(x.next_run_at).toLocaleString()}`:""}</div></div>`).join("")||'<div class="muted small">No schedules yet.</div>';
  }catch(e){}
}
async function createPartnerInvite(){
  const email=(document.getElementById("partnerInviteEmail").value||"").trim();if(!email)return;
  try{
    const r=await apiJson("/api/partner/invites",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
    alert(`Invite created for ${email}. Delivery will use the configured email provider.`);
    document.getElementById("partnerInviteEmail").value="";
    await renderPartnerInvites();
  }catch(e){alert(e.message)}
}
async function renderPartnerInvites(){
  const box=document.getElementById("partnerInviteList");if(!box)return;
  try{
    const r=await apiJson("/api/partner/invites");
    box.innerHTML=(r.items||[]).slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.email)}</b><div class="muted small">${escapeHtml(x.status)} · expires ${new Date(x.expires_at).toLocaleDateString()}</div></div>`).join("");
  }catch(e){}
}


async function orderProfessionalService(sku){
  try{
    const service=await apiJson("/api/services/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sku})});
    const payment=await apiJson("/api/payments/service-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serviceOrderId:service.id})});
    await renderProfessionalServices();await renderPayments();
    await openHostedCheckout(payment.paymentOrder.id);
  }catch(e){alert(e.message)}
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
    cat.innerHTML=ci.map(x=>`<button class="eventcard" onclick="orderProfessionalService('${escapeHtml(x.sku)}')"><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.description||"")}</div><div style="margin-top:8px;font-weight:800">From P${x.base_price_bwp}</div></button>`).join("");
    document.getElementById("serviceOrderList").innerHTML=oi.map(x=>`<div class="item"><b>${escapeHtml(x.name||x.sku)}</b><div class="muted small">P${x.price_bwp} · ${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleDateString()}</div></div>`).join("")||'<div class="muted small">No service orders yet.</div>';
  }catch(e){cat.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function renderPayments(){
  const list=document.getElementById("paymentOrderList");if(!list)return;
  try{
    const r=await apiJson("/api/payments/orders");const items=r.items||[];
    document.getElementById("paymentPending").textContent=items.filter(x=>["pending","processing"].includes(x.status)).length;
    document.getElementById("paymentPaid").textContent=items.filter(x=>x.status==="paid").length;
    document.getElementById("paymentFailed").textContent=items.filter(x=>x.status==="failed").length;
    document.getElementById("paymentRefunded").textContent=items.filter(x=>x.status==="refunded").length;
    list.innerHTML=items.map(x=>`<div class="item"><b>${escapeHtml(x.order_type)}</b><div class="muted small">P${x.amount_bwp} · ${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No payment orders yet.</div>';
  }catch(e){list.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function openHostedCheckout(paymentOrderId){
  const r=await apiJson("/api/payments/create-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentOrderId})});
  if(!r.ok||!r.checkoutUrl)throw new Error(r.error||"Checkout is not configured.");
  window.location.href=r.checkoutUrl;
}


async function renderPaymentProviders(){
  const box=document.getElementById("paymentProviderList");if(!box)return;
  try{
    const r=await apiJson("/api/payments/providers");
    box.innerHTML=(r.providers||[]).map(p=>`<div class="item"><div class="between row"><div><b>${escapeHtml(p.label)}</b><div class="muted small">${escapeHtml(p.mode)} · ${escapeHtml(p.settlementCurrency)} · ${escapeHtml(p.merchantStatus)}</div><div class="muted small">${(p.capabilities||[]).map(escapeHtml).join(" · ")}</div></div><span class="badge">${p.configured?"Configured":"Setup required"}</span></div></div>`).join("");
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderPaymentReconciliation(){
  const box=document.getElementById("paymentReconciliationList");if(!box)return;
  try{
    const r=await apiJson("/api/payments/reconciliation");
    box.innerHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.provider)} · ${escapeHtml(x.reconciliation_status)}</b><div class="muted small">Internal: ${escapeHtml(x.internal_status||"")} ${x.provider_status?`· Provider: ${escapeHtml(x.provider_status)}`:""} · ${new Date(x.checked_at).toLocaleString()}</div>${x.notes?`<div class="small">${escapeHtml(x.notes)}</div>`:""}</div>`).join("")||'<div class="muted small">No reconciliation events yet.</div>';
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
    box.innerHTML=es.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.feature_key)}</b><div class="muted small">${Number(x.enabled)===1?"Enabled":"Not included"}${x.limit_value!=null?` · limit ${x.limit_value}`:""}</div></div><span class="badge">${Number(x.enabled)===1?"On":"Off"}</span></div></div>`).join("");
    document.getElementById("entitlementUsage").innerHTML=us.map(x=>`<div class="item"><b>${escapeHtml(x.counter_key)}</b><div class="muted small">${x.value} · ${escapeHtml(x.period_key)}</div></div>`).join("")||'<div class="muted small">No usage yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
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
    src.innerHTML=ss.slice(0,30).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.authority)} · ${escapeHtml(x.status)}${x.effective_date?` · effective ${new Date(x.effective_date).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No sources loaded.</div>';
    document.getElementById("regulatoryRuleList").innerHTML=rr.slice(0,30).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">v${x.version} · ${escapeHtml(x.status)} · ${escapeHtml(x.confidence)} confidence</div></div>`).join("")||'<div class="muted small">No rules loaded.</div>';
    document.getElementById("regulatoryConflictList").innerHTML=cc.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.topic_key)}</b><div class="muted small">${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.description||"")}</div></div>`).join("")||'<div class="muted small">No open conflicts.</div>';
    document.getElementById("regulatoryImpactList").innerHTML=ii.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.rule_title)}</b><div class="muted small">${escapeHtml(x.impact_level)} · ${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.explanation||"")}</div></div>`).join("")||'<div class="muted small">No current impacts.</div>';
  }catch(e){src.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function advanceObligation(id,status){
  try{
    await apiJson(`/api/obligations/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    await renderComplianceObligations();await renderUnifiedNextActions();
  }catch(e){alert(e.message)}
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
    box.innerHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.status)} · priority ${x.priority}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}${x.superseded_at?" · superseded — review current rule":""}</div><div class="small">${escapeHtml(x.description||"")}</div></div><div>${x.status==="open"?`<button class="btn alt" onclick="advanceObligation('${x.id}','in_progress')">Start</button>`:""}${x.status==="in_progress"?`<button class="btn alt" onclick="advanceObligation('${x.id}','review')">Review</button>`:""}${x.status==="review"?`<button class="btn" onclick="advanceObligation('${x.id}','completed')">Complete</button>`:""}</div></div></div>`).join("")||'<div class="muted small">No obligations yet.</div>';
    document.getElementById("regApplicabilityList").innerHTML=apps.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.applicability_status)} · evaluated ${new Date(x.evaluated_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No rule evaluations yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}



async function acknowledgeEscalation(id){
  try{
    await apiJson(`/api/obligation-escalations/${id}/acknowledge`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    await renderInspectionReadiness();
  }catch(e){alert(e.message)}
}
async function renderInspectionReadiness(){
  const scenarios=document.getElementById("inspectionScenarioList");if(!scenarios)return;
  try{
    const [s,r,p]=await Promise.all([apiJson("/api/inspection-scenarios"),apiJson("/api/inspection-simulations"),apiJson("/api/inspection-packs")]);
    const ss=s.items||[],runs=r.items||[],packs=p.items||[],latest=runs[0]||null;
    scenarios.innerHTML=ss.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.authority_label)} · ${escapeHtml(x.description)}</div></div><button class="btn alt" onclick="runInspectionScenario('${x.scenario_key}')">Simulate</button></div></div>`).join("")||'<div class="muted small">No scenarios available on this plan.</div>';
    document.getElementById("inspectionReadinessScore").textContent=latest?.coverage_status==="insufficient"?"N/A":latest?.readiness_score??"—";
    document.getElementById("inspectionCritical").textContent=latest?.critical_findings??0;
    document.getElementById("inspectionHigh").textContent=latest?.high_findings??0;
    document.getElementById("inspectionPackCount").textContent=packs.length;
    document.getElementById("inspectionSimulationList").innerHTML=runs.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.scenario_name)}</b><div class="muted small">${x.coverage_status==="insufficient"?"Insufficient data":`Score ${x.readiness_score}`} · ${escapeHtml(x.readiness_band)} · coverage ${escapeHtml(x.coverage_status)} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No simulations yet.</div>';
    document.getElementById("inspectionPackList").innerHTML=packs.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.label)}</b><div class="muted small">${escapeHtml(x.status)} · ${new Date(x.generated_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No packs yet.</div>';
    if(packs[0])latestInspectionPackId=packs[0].id;
  }catch(e){scenarios.innerHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}


async function renderNotificationDeadLetters(){
  const box=document.getElementById("notificationDeadLetterList");if(!box)return;
  try{
    const r=await apiJson("/api/notifications/dead-letters");
    box.innerHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.channel)} · ${escapeHtml(x.reason)}</b><div class="muted small">${escapeHtml(x.subject||"")} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No dead letters.</div>';
  }catch(e){}
}
async function exportLatestInspectionPack(){
  if(!latestInspectionPackId){alert("Generate an inspection pack first.");return;}
  try{
    const r=await apiJson(`/api/inspection-packs/${latestInspectionPackId}/export`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({format:"json"})});
    const blob=new Blob([JSON.stringify(r.data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`inspection-pack-${latestInspectionPackId}.json`;a.click();URL.revokeObjectURL(url);
  }catch(e){alert(e.message)}
}


async function renderPartnerAccess(){
  const box=document.getElementById("partnerAccessList");if(!box)return;
  try{
    const r=await apiJson("/api/partner/access");
    box.innerHTML=(r.items||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.client_name||x.client_tenant_id)}</b><div class="muted small">${escapeHtml(x.status)} · ${(JSON.parse(x.scopes_json||"[]")).map(escapeHtml).join(" · ")}</div></div>${x.status==="active"?`<button class="btn alt" onclick="revokePartnerAccess('${x.client_tenant_id}')">Revoke</button>`:""}</div></div>`).join("")||'<div class="muted small">No authorized clients.</div>';
  }catch(e){}
}
async function revokePartnerAccess(clientTenantId){
  try{
    await apiJson(`/api/partner/access/${clientTenantId}/revoke`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    await renderPartnerAccess();await renderPartnerClients();
  }catch(e){alert(e.message)}
}


async function renderPassportShares(){
  const box=document.getElementById("passportShareList");if(!box)return;
  try{
    const r=await apiJson("/api/passport/shares");
    box.innerHTML=(r.items||[]).map(x=>{
      const status=x.revoked_at?"revoked":x.invalidated_at?"reissue required":(x.expires_at&&new Date(x.expires_at)<new Date()?"expired":"active");
      return `<div class="item"><div class="between row"><div><b>${escapeHtml(x.label||"Compliance Passport")}</b><div class="muted small">${escapeHtml(status)} · revision ${x.issued_revision??0} · ${x.view_count||0}${x.max_views!=null?`/${x.max_views}`:""} views · expires ${x.expires_at?new Date(x.expires_at).toLocaleString():"never"}</div>${x.invalidation_reason?`<div class="small">${escapeHtml(x.invalidation_reason)}</div>`:""}</div>${!x.revoked_at&&!x.invalidated_at?`<button class="btn alt" onclick="revokePassportShare('${x.id}')">Revoke</button>`:""}</div></div>`;
    }).join("")||'<div class="muted small">No shares.</div>';
  }catch(e){box.innerHTML=`<div class="muted small">${escapeHtml(e.message)}</div>`}
}
async function revokePassportShare(id){
  try{
    await apiJson(`/api/passport/shares/${id}/revoke`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    await renderPassportShares();await renderPassport();
  }catch(e){alert(e.message)}
}


async function requestDeletion(){
  try{
    await apiJson("/api/account/deletion-request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:"Customer requested account deletion"})});
    await renderDeletion();
  }catch(e){alert(e.message)}
}
async function renderDeletion(){
  const box=document.getElementById("deleteDetail");if(!box)return;
  try{
    const [d,h]=await Promise.all([apiJson("/api/account/deletion-status"),apiJson("/api/legal-holds")]);
    const item=d.item,holds=h.items||[];
    document.getElementById("deleteStatus").textContent=(item?.status||"none").toUpperCase();
    document.getElementById("deleteAttempts").textContent=item?.attempts||0;
    document.getElementById("deleteHolds").textContent=holds.filter(x=>x.status==="active").length;
    box.innerHTML=item?`<div><b>${escapeHtml(item.status)}</b><div class="muted small">Requested ${new Date(item.requested_at).toLocaleString()}${item.last_error?` · ${escapeHtml(item.last_error)}`:""}</div></div>`:'<div class="muted small">No deletion request.</div>';
    document.getElementById("legalHoldList").innerHTML=holds.map(x=>`<div class="item"><b>${escapeHtml(x.reason)}</b><div class="muted small">${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleString()}</div></div>`).join("")||'<div class="muted small">No holds.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function reviewEvidence(id,status){
  try{
    await apiJson(`/api/evidence/integrity/${id}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    await renderEvidenceIntegrity();
  }catch(e){alert(e.message)}
}
async function renderEvidenceIntegrity(){
  const box=document.getElementById("evidenceIntegrityList");if(!box)return;
  try{
    const r=await apiJson("/api/evidence/integrity");const items=r.items||[];
    document.getElementById("evidenceQuarantined").textContent=items.filter(x=>x.review_status==="quarantined").length;
    document.getElementById("evidenceApproved").textContent=items.filter(x=>x.review_status==="approved").length;
    document.getElementById("evidenceRejected").textContent=items.filter(x=>x.review_status==="rejected").length;
    document.getElementById("evidenceDuplicates").textContent=items.filter(x=>!!x.duplicate_of_evidence_id).length;
    box.innerHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.review_status)} · ${Math.round((x.size_bytes||0)/1024)} KB${x.duplicate_of_evidence_id?` · duplicate of ${escapeHtml(x.duplicate_of_evidence_id)}`:""}</div><div class="muted small">${x.content_sha256?escapeHtml(x.content_sha256.slice(0,16))+"…":""}</div></div><div>${x.review_status==="quarantined"?`<button class="btn alt" onclick="reviewEvidence('${x.id}','approved')">Approve</button><button class="btn alt" onclick="reviewEvidence('${x.id}','rejected')">Reject</button>`:""}</div></div></div>`).join("")||'<div class="muted small">No evidence yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


function boolFromSelect(id){return document.getElementById(id)?.value==="true"}
async function loadRiskEmployeeControls(){
  const eid=document.getElementById("riskEmployee")?.value;if(!eid)return;
  try{const r=await apiJson(`/api/employees/${eid}/risk-controls`);const x=r.item||{};
    riskContract.value=String(Number(x.contract_signed||0)===1);riskContractType.value=x.contract_type||"unknown";riskFixedEnd.value=x.fixed_term_end_date||"";riskFixedBasis.value=String(Number(x.fixed_term_justification_recorded||0)===1);riskProbationEnd.value=x.probation_end_date||"";riskProbationReviewed.value=String(Number(x.probation_review_recorded||0)===1);riskLeave.value=String(Number(x.leave_record_current||0)===1);riskAttendance.value=String(Number(x.attendance_record_current||0)===1);riskOvertime.value=String(Number(x.overtime_control||0)===1);riskAsset.value=String(Number(x.asset_acknowledgement||0)===1);riskDisciplinary.value=String(Number(x.disciplinary_process_open||0)===1);riskGrievance.value=String(Number(x.grievance_open||0)===1);riskNotes.value=x.notes||"";
  }catch(e){}
}
async function saveEmployeeRiskControls(){
  const employeeId=riskEmployee.value;if(!employeeId){alert("Choose an employee.");return;}
  try{await apiJson(`/api/employees/${employeeId}/risk-controls`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({contractSigned:boolFromSelect("riskContract"),contractType:riskContractType.value,fixedTermEndDate:riskFixedEnd.value||null,fixedTermJustificationRecorded:boolFromSelect("riskFixedBasis"),probationEndDate:riskProbationEnd.value||null,probationReviewRecorded:boolFromSelect("riskProbationReviewed"),leaveRecordCurrent:boolFromSelect("riskLeave"),attendanceRecordCurrent:boolFromSelect("riskAttendance"),overtimeControl:boolFromSelect("riskOvertime"),assetAcknowledgement:boolFromSelect("riskAsset"),disciplinaryProcessOpen:boolFromSelect("riskDisciplinary"),grievanceOpen:boolFromSelect("riskGrievance"),notes:riskNotes.value})});await renderProtectionEngine();}catch(e){alert(e.message)}
}
async function recalculateEmployerRisk(){try{await apiJson("/api/employer-risk/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderProtectionEngine();}catch(e){alert(e.message)}}
async function recalculateProtectionScore(){try{await apiJson("/api/business-protection-score/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderProtectionEngine();}catch(e){alert(e.message)}}
async function renderProtectionEngine(){
  const box=document.getElementById("employmentRiskFindings");if(!box)return;
  try{const [risk,bps,emps]=await Promise.all([apiJson("/api/employer-risk"),apiJson("/api/business-protection-score"),apiJson("/api/employees")]);
    bpsScore.textContent=bps.score??"—";bpsGrade.textContent=`Grade ${bps.grade||"—"}`;employmentProtection.textContent=risk.protectionScore??"—";employmentBand.textContent=(risk.riskBand||"—").toUpperCase();employmentHighFindings.textContent=(risk.findings||[]).filter(x=>["high","critical"].includes(x.severity)).length;employmentReviewed.textContent=`${risk.dimensions?.controlsReviewed??0}%`;
    protectionScore.textContent=bps.score??"—";protectionBar.style.width=`${bps.score||0}%`;protectionScore.className=`score ${bps.score>=80?"good":bps.score>=60?"warn":"bad"}`;
    const dims=bps.dimensions||{};bpsDimensions.innerHTML=Object.entries(dims).map(([k,v])=>`<div class="item"><div class="between row"><b>${escapeHtml(k.replaceAll("_"," "))}</b><span>${v.score}% · weight ${v.weight}%</span></div><div class="progress"><span style="width:${v.score}%"></span></div></div>`).join("");
    bpsDrivers.innerHTML=(bps.drivers||[]).map(x=>`<div class="item"><b>${escapeHtml(x.title||x.dimension)}</b><div class="muted small">${x.severity?escapeHtml(x.severity):`Score ${x.score}`}</div></div>`).join("")||'<div class="muted small">No material protection gaps.</div>';
    box.innerHTML=(risk.findings||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.severity)}${x.employeeId?` · employee ${escapeHtml(x.employeeId)}`:""}</div><div class="small">${escapeHtml(x.rationale)}</div><div class="muted small" style="margin-top:4px">Action: ${escapeHtml(x.recommendedAction)}</div></div></div></div>`).join("")||'<div class="muted small">No material employment-control findings.</div>';
    const sel=document.getElementById("riskEmployee"),old=sel.value;sel.innerHTML=(emps.items||[]).map(e=>`<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join("");if(old&&[...sel.options].some(o=>o.value===old))sel.value=old;sel.onchange=loadRiskEmployeeControls;if(sel.value)await loadRiskEmployeeControls();
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function recalculateRiskEvents(){
  try{await apiJson("/api/business-risk-events/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderRiskEvents();await renderProtectionEngine();await renderUnifiedNextActions()}
  catch(e){alert(e.message)}
}
async function acknowledgeRiskEvent(id){
  try{await apiJson(`/api/business-risk-events/${id}/acknowledge`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderRiskEvents()}
  catch(e){alert(e.message)}
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
    box.innerHTML=active.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.category)} · ${escapeHtml(x.severity)} · ${escapeHtml(x.status)}${x.due_at?` · ${new Date(x.due_at).toLocaleDateString()}`:""} · seen ${x.occurrence_count||1}×</div><div class="small">${escapeHtml(x.rationale||"")}</div><div class="small"><b>Action:</b> ${escapeHtml(x.recommended_action||"")}</div></div>${x.status==="open"?`<button class="btn alt" onclick="acknowledgeRiskEvent('${x.id}')">Acknowledge</button>`:""}</div></div>`).join("")||'<div class="notice good">No active business-risk events detected from current workspace records.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function renderPortfolioRisk(){
  const box=document.getElementById("portfolioRiskList");if(!box)return;
  try{
    const r=await apiJson("/api/partner/portfolio-risk");
    box.innerHTML=(r.items||[]).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.clientName)}</b><div class="muted small">Protection ${x.protectionScore??"—"}${x.grade?` (${escapeHtml(x.grade)})`:""} · ${x.openEvents} open risk event(s)</div></div><div><span class="badge ${x.criticalEvents?"bad":x.highEvents?"warn":"good"}">${x.criticalEvents} critical · ${x.highEvents} high</span></div></div></div>`).join("")||'<div class="muted small">No authorized client portfolio data yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function activateIndustryPack(packKey){try{await apiJson(`/api/industry/packs/${packKey}/activate`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderIndustryIntelligence();await renderRegulatoryIntelligence()}catch(e){alert(e.message)}}
async function dismissIndustryPack(packKey){try{await apiJson(`/api/industry/packs/${packKey}/dismiss`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderIndustryIntelligence()}catch(e){alert(e.message)}}
async function updateIndustryControl(packKey,controlKey,status){try{await apiJson(`/api/industry/controls/${packKey}/${controlKey}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderIndustryIntelligence()}catch(e){alert(e.message)}}
async function setIndustryBenchmarkOptIn(optIn){try{await apiJson("/api/industry/benchmark-preference",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({optIn})});await renderIndustryIntelligence()}catch(e){alert(e.message)}}
async function renderIndustryIntelligence(){
  const packBox=document.getElementById("industryPackList");if(!packBox)return;
  try{
    const [p,c,b]=await Promise.all([apiJson("/api/industry/packs"),apiJson("/api/industry/controls"),apiJson("/api/industry/benchmark")]);
    const packs=p.items||[],controls=c.items||[];document.getElementById("industryName").textContent=p.profile?.industry||"Not set";
    document.getElementById("industryActivePacks").textContent=packs.filter(x=>x.status==="active").length;
    document.getElementById("industryControlsReady").textContent=controls.filter(x=>x.status==="ready"||x.status==="not_applicable").length;
    document.getElementById("industryCohort").textContent=b.available?b.cohortSize:`<${b.minCohort||10}`;
    const opt=document.getElementById("industryBenchmarkOptIn");if(opt)opt.checked=!!b.optIn;
    packBox.innerHTML=packs.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.status)} · match ${x.match_confidence||0}% · pack v${x.version}</div><div class="small">${escapeHtml(x.description||"")}</div></div><div>${x.status==="recommended"?`<button class="btn" onclick="activateIndustryPack('${x.pack_key}')">Activate</button><button class="btn alt" onclick="dismissIndustryPack('${x.pack_key}')">Dismiss</button>`:x.status==="active"?'<span class="badge good">Active</span>':''}</div></div></div>`).join("")||'<div class="muted small">No pack matches the current industry profile. Update the company industry if needed.</div>';
    document.getElementById("industryControlList").innerHTML=controls.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.pack_name)} · ${escapeHtml(x.status)}</div><div class="small">${escapeHtml(x.description||"")}</div>${x.evidence_hint?`<div class="muted small">Evidence examples: ${escapeHtml(x.evidence_hint)}</div>`:""}</div><select onchange="updateIndustryControl('${x.pack_key}','${x.control_key}',this.value)"><option value="not_started" ${x.status==="not_started"?"selected":""}>Not started</option><option value="in_progress" ${x.status==="in_progress"?"selected":""}>In progress</option><option value="review" ${x.status==="review"?"selected":""}>Review</option><option value="ready" ${x.status==="ready"?"selected":""}>Ready</option><option value="not_applicable" ${x.status==="not_applicable"?"selected":""}>Not applicable</option></select></div></div>`).join("")||'<div class="muted small">Activate an industry pack to create controls.</div>';
    const bb=document.getElementById("industryBenchmark");
    bb.innerHTML=b.available?`<div class="item"><b>${escapeHtml(b.industryKey)}</b><div class="muted small">${b.cohortSize} opted-in businesses · updated ${new Date(b.asOf).toLocaleString()}</div><div class="small">Average Protection Score: <b>${b.metrics?.averageProtectionScore??"—"}</b> · Median: <b>${b.metrics?.medianProtectionScore??"—"}</b></div></div>`:`<div class="muted small">Benchmark withheld until at least ${b.minCohort||10} opted-in businesses exist in this industry. Current eligible cohort: ${b.cohortSize||0}.</div>`;
  }catch(e){packBox.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function recalculateControlCenter(){
  try{await apiJson("/api/control-center/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderControlCenter();await renderRiskEvents();await renderProtectionEngine()}
  catch(e){alert(e.message)}
}
async function advanceRemediation(id,status){
  try{await apiJson(`/api/remediation/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderControlCenter()}
  catch(e){alert(e.message)}
}
async function escalateRemediation(id){
  try{const r=await apiJson(`/api/remediation/${id}/escalate`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});alert(`Professional review order created: ${r.sku||""} · P${r.priceBwp??""}`);await renderControlCenter();await renderProfessionalServices()}
  catch(e){alert(e.message)}
}
async function advanceRegChange(id,status){
  try{await apiJson(`/api/regulatory-change-cases/${id}/advance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderControlCenter()}
  catch(e){alert(e.message)}
}
async function renderControlCenter(){
  const box=document.getElementById("controlCenterList");if(!box)return;
  try{
    const c=await apiJson("/api/control-center"),items=c.items||[],eh=c.evidenceHealth||{};
    document.getElementById("controlPassing").textContent=items.filter(x=>x.status==="passing").length;
    document.getElementById("controlAttention").textContent=items.filter(x=>["attention","review"].includes(x.status)).length;
    document.getElementById("controlFailed").textContent=items.filter(x=>x.status==="failed").length;
    document.getElementById("evidenceHealthScore").textContent=eh.health_score??"—";
    box.innerHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.category)} · ${escapeHtml(x.status)} · ${escapeHtml(x.assurance_level)} · evidence ${escapeHtml(x.evidence_health)}</div><div class="small">${escapeHtml(x.objective||"")}</div></div><span class="badge ${x.status==="failed"?"bad":x.status==="passing"?"good":"warn"}">${escapeHtml(x.status)}</span></div></div>`).join("")||'<div class="muted small">Recalculate to establish the control baseline.</div>';
    document.getElementById("evidenceHealthDetail").innerHTML=`<div class="grid g2"><div class="item"><b>${eh.approved_count||0}</b><div class="muted small">approved</div></div><div class="item"><b>${eh.missing_required_count||0}</b><div class="muted small">mandatory items missing</div></div><div class="item"><b>${eh.expiring_count||0}</b><div class="muted small">expiring ≤30 days</div></div><div class="item"><b>${eh.expired_count||0}</b><div class="muted small">expired</div></div></div>`;
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
  const regBox=document.getElementById("regChangeList");
  try{
    const r=await apiJson("/api/regulatory-change-cases");
    regBox.innerHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.applicability_status)} · ${escapeHtml(x.impact_level)} · ${escapeHtml(x.status)} · ${x.obligation_count} open obligation(s)</div><div class="small">${escapeHtml(x.explanation||"")}</div>${x.status==="assessing"?`<button class="btn alt" onclick="advanceRegChange('${x.id}','action_required')">Action required</button>`:""}${x.status==="action_required"&&Number(x.obligation_count||0)===0?`<button class="btn alt" onclick="advanceRegChange('${x.id}','implemented')">Mark implemented</button>`:""}</div>`).join("")||'<div class="muted small">No published regulatory changes currently require review.</div>';
  }catch(e){regBox.innerHTML='<div class="muted small">Regulatory Change Control is available on Protect and above.</div>'}
  const remBox=document.getElementById("remediationList");
  try{
    const r=await apiJson("/api/remediation");
    remBox.innerHTML=(r.items||[]).filter(x=>!["resolved","canceled"].includes(x.status)).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.severity)} · ${escapeHtml(x.status)}${x.due_at?` · due ${new Date(x.due_at).toLocaleDateString()}`:""}</div><div class="small">${escapeHtml(x.recommended_action||"")}</div></div><div>${x.status==="open"?`<button class="btn alt" onclick="advanceRemediation('${x.id}','in_progress')">Start</button>`:""}${x.requires_professional&&!x.service_order_id?`<button class="btn" onclick="escalateRemediation('${x.id}')">Professional review</button>`:""}</div></div></div>`).join("")||'<div class="notice good">No active remediation cases.</div>';
  }catch(e){remBox.innerHTML='<div class="muted small">Advanced remediation is available on Protect and above.</div>'}
}


async function runAssuranceTest(){
  try{await apiJson("/api/control-assurance/test",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderAssuranceFreshness();await renderControlCenter()}
  catch(e){alert(e.message)}
}
async function reviewControlFreshness(key,currentStatus){
  const notes=prompt("Add review notes (required):","Reviewed current control condition and supporting records.");
  if(!notes)return;
  try{
    await apiJson(`/api/controls/${key}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:currentStatus,notes})});
    await renderAssuranceFreshness();await renderControlCenter();
  }catch(e){alert(e.message)}
}
async function renderAssuranceFreshness(){
  const box=document.getElementById("freshnessList");if(!box)return;
  try{
    const r=await apiJson("/api/control-center"),items=r.items||[];
    document.getElementById("freshCurrent").textContent=items.filter(x=>x.assurance_freshness==="current").length;
    document.getElementById("freshDue").textContent=items.filter(x=>x.assurance_freshness==="due").length;
    document.getElementById("freshOverdue").textContent=items.filter(x=>x.assurance_freshness==="overdue").length;
    document.getElementById("freshStale").textContent=items.filter(x=>x.assurance_freshness==="stale").length;
    const rank={stale:1,overdue:2,due:3,unknown:4,current:5};
    items.sort((a,b)=>(rank[a.assurance_freshness]||9)-(rank[b.assurance_freshness]||9)||(b.risk_weight||0)-(a.risk_weight||0));
    box.innerHTML=items.map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.name)}</b><div class="muted small">${escapeHtml(x.category)} · ${escapeHtml(x.status)} · ${escapeHtml(x.assurance_level)} · freshness ${escapeHtml(x.assurance_freshness||"unknown")}</div><div class="small">${escapeHtml(x.stale_reason||"")}</div>${x.next_review_at?`<div class="muted small">Next human review: ${new Date(x.next_review_at).toLocaleDateString()}</div>`:""}</div><button class="btn alt" onclick="reviewControlFreshness('${x.control_key}','${x.status}')">Review</button></div></div>`).join("")||'<div class="muted small">No controls yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


async function verifyAuditIntegrity(){
  const box=document.getElementById("auditIntegrityDetail");if(!box)return;
  try{
    const [r,a]=await Promise.all([apiJson("/api/audit/integrity"),apiJson("/api/audit")]);
    document.getElementById("auditIntegrityStatus").textContent=String(r.status||"unknown").toUpperCase();
    document.getElementById("auditSealedCount").textContent=r.checkedEvents||0;
    document.getElementById("auditLegacyCount").textContent=r.legacyEvents||0;
    document.getElementById("auditFailureCount").textContent=a.unresolvedWriteFailures||0;
    box.innerHTML=`<div class="item"><b>${escapeHtml(r.status||"unknown")}</b><div class="muted small">${r.firstInvalidSeq?`First invalid sequence: ${r.firstInvalidSeq}`:"No chained-event mismatch detected."}</div>${r.lastHash?`<div class="audit">${escapeHtml(r.lastHash.slice(0,32))}…</div>`:""}</div>`;
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}
async function populateLineageControls(){
  const sel=document.getElementById("lineageControlSelect");if(!sel)return;
  try{
    const r=await apiJson("/api/control-center");sel.innerHTML=(r.items||[]).map(x=>`<option value="${escapeHtml(x.control_key)}">${escapeHtml(x.name)}</option>`).join("");
  }catch(e){}
}
async function loadControlLineage(){
  const sel=document.getElementById("lineageControlSelect"),box=document.getElementById("lineageDetail");if(!sel||!box||!sel.value)return;
  try{
    const r=await apiJson(`/api/control-lineage/${encodeURIComponent(sel.value)}`),l=r.lineage||{},c=l.control||{};
    const block=(title,items,render)=>`<div class="item"><b>${title}</b>${items.length?items.map(render).join(""):'<div class="muted small">None recorded.</div>'}</div>`;
    box.innerHTML=`<div class="grid g3"><div class="card"><div class="kpi">Status</div><div class="score" style="font-size:24px">${escapeHtml(c.status||"—")}</div></div><div class="card"><div class="kpi">Assurance</div><div class="score" style="font-size:24px">${escapeHtml(c.assuranceLevel||"—")}</div></div><div class="card"><div class="kpi">Snapshots</div><div class="score">${(r.snapshots||[]).length}</div></div></div>
      <div style="margin-top:12px">${block("Mapped rules",l.rules||[],x=>`<div class="small">${escapeHtml(x.rule_key||x.id)} · v${escapeHtml(String(x.version||""))} · ${escapeHtml(x.status||"")}</div>`)}
      ${block("Evidence",l.evidence||[],x=>`<div class="small">${escapeHtml(x.display_name||x.id)} · ${escapeHtml(x.review_status||"")} ${x.content_sha256?`· ${escapeHtml(x.content_sha256.slice(0,12))}…`:""}</div>`)}
      ${block("Risk events",l.risks||[],x=>`<div class="small">${escapeHtml(x.severity||"")} · ${escapeHtml(x.title||"")} · ${escapeHtml(x.status||"")}</div>`)}
      ${block("Remediation",l.remediation||[],x=>`<div class="small">${escapeHtml(x.severity||"")} · ${escapeHtml(x.title||"")} · ${escapeHtml(x.status||"")}</div>`)}
      ${block("Human reviews",l.reviews||[],x=>`<div class="small">${escapeHtml(x.event_type||"")} · ${new Date(x.occurred_at).toLocaleString()}</div>`)}
      ${block("Assurance tests",l.assuranceTests||[],x=>`<div class="small">${escapeHtml(x.result_status||"")} · ${escapeHtml(x.freshness||"")} · ${new Date(x.tested_at).toLocaleString()}</div>`)}</div>`;
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

async function renderPlatformRegulatoryGovernance(){let status=null;try{status=await apiJson("/api/platform/regulatory/status")}catch(e){document.querySelectorAll(".platformRegulatoryOnly").forEach(x=>x.style.display="none");return}document.querySelectorAll(".platformRegulatoryOnly").forEach(x=>x.style.display="");renderFoundationPackStatus();const box=document.getElementById("platformRegSourceList");if(!box)return;try{const [s,r,c,o]=await Promise.all([apiJson("/api/platform/regulatory/sources"),apiJson("/api/platform/regulatory/rules"),apiJson("/api/platform/regulatory/conflicts"),apiJson("/api/platform/regulatory/rollouts")]);const ss=s.items||[],rr=r.items||[],cc=c.items||[],oo=o.items||[];document.getElementById("platformRegRole").textContent=String(status.role||"—").toUpperCase();document.getElementById("platformRegPendingSources").textContent=ss.filter(x=>x.status==="pending").length;document.getElementById("platformRegReviewRules").textContent=rr.filter(x=>x.status==="review").length;document.getElementById("platformRegQueuedRollouts").textContent=oo.filter(x=>["queued","running"].includes(x.status)).length;box.innerHTML=ss.slice(0,25).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.authority)} · ${escapeHtml(x.status)} · snapshot ${x.latest_snapshot_version||0} · ${escapeHtml(x.verification_status||"unverified")}</div></div>`).join("")||'<div class="muted small">No sources.</div>';document.getElementById("platformRegRuleList").innerHTML=rr.slice(0,25).map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">v${x.version} · ${escapeHtml(x.status)} · ${escapeHtml(x.confidence)}</div></div>`).join("")||'<div class="muted small">No rules.</div>';document.getElementById("platformRegConflictList").innerHTML=cc.filter(x=>x.status==="open").slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.topic_key)}</b><div class="small">${escapeHtml(x.description||"")}</div></div>`).join("")||'<div class="muted small">No open conflicts.</div>';document.getElementById("platformRegRolloutList").innerHTML=oo.slice(0,20).map(x=>`<div class="item"><b>${escapeHtml(x.rule_title)}</b><div class="muted small">${escapeHtml(x.status)} · ${x.tenants_evaluated||0} evaluated · ${x.obligations_created||0} obligations · ${x.tenants_failed||0} failures</div></div>`).join("")||'<div class="muted small">No rollouts.</div>';}catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}}

async function importFoundationPack(){
  if(!confirm("Import the Botswana Foundation Pack as PENDING sources, DRAFT rules and conflict records? Nothing will be approved or published automatically."))return;
  try{
    const r=await apiJson("/api/platform/regulatory/foundation-pack/import",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    document.getElementById("foundationPackStatus").textContent=`Imported v${r.version}: ${r.sourcesCreated} sources, ${r.rulesCreated} rules, ${r.conflictsCreated} conflicts`;
    await renderPlatformRegulatoryGovernance();
  }catch(e){alert(e.message)}
}
async function renderFoundationPackStatus(){
  const el=document.getElementById("foundationPackStatus");if(!el)return;
  try{
    const r=await apiJson("/api/platform/regulatory/foundation-pack"),last=(r.imports||[])[0];
    el.textContent=last?`Imported v${r.pack.version} · ${new Date(last.created_at).toLocaleString()}`:`Ready to import v${r.pack.version}`;
  }catch(e){el.textContent="Unavailable"}
}

async function recalculateStatutoryCalendar(){try{await apiJson("/api/statutory-calendar/recalculate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderStatutoryCalendar();await renderComplianceObligations();await renderUnifiedNextActions()}catch(e){alert(e.message)}}
async function renderStatutoryCalendar(){const list=document.getElementById("statCalendarList"),setup=document.getElementById("statCalendarSetup");if(!list||!setup)return;try{const r=await apiJson("/api/statutory-calendar"),items=r.obligations||[],schedules=r.schedules||[],now=Date.now(),active=items.filter(x=>x.due_at),within30=active.filter(x=>{const d=(new Date(x.due_at+"T23:59:59Z").getTime()-now)/86400000;return d>=0&&d<=30}),need=schedules.filter(x=>x.config_status==="needs_input");document.getElementById("statCalUpcoming").textContent=active.length;document.getElementById("statCal30").textContent=within30.length;document.getElementById("statCalNeeds").textContent=need.length;document.getElementById("statCalNext").textContent=active.length?new Date(active[0].due_at+"T00:00:00Z").toLocaleDateString():"—";list.innerHTML=active.map(x=>`<div class="item"><b>${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.rule_title)} · due ${new Date(x.due_at+"T00:00:00Z").toLocaleDateString()} · ${escapeHtml(x.schedule_type||"")}</div></div>`).join("")||'<div class="muted small">No recurring statutory obligations generated yet. Published rules are required.</div>';setup.innerHTML=need.map(x=>{let miss=[];try{miss=JSON.parse(x.missing_fields_json||"[]")}catch{}return `<div class="item"><b>${escapeHtml(x.rule_title)}</b><div class="small">Missing: ${escapeHtml(miss.join(", ")||"company information")}</div></div>`}).join("")||'<div class="notice good">No statutory schedule setup gaps detected.</div>'}catch(e){list.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}}

let latestInspectionPackId=null;
async function runInspectionScenario(key){
  const detail=document.getElementById("inspectionSimulationDetail");
  try{
    const pack=await apiJson("/api/inspection-packs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scenarioKey:key})});
    const r=pack.simulation;latestInspectionPackId=pack.id;
    detail.innerHTML=`<div class="item"><b>${escapeHtml(r.scenario.name)}</b><div class="score" style="font-size:36px">${r.coverageStatus==="insufficient"?"N/A":r.readinessScore}</div><div class="muted small">${escapeHtml(r.readinessBand)} · coverage ${escapeHtml(r.coverageStatus)}</div><div class="small">${escapeHtml(r.scenario.disclaimer)}</div></div>`+
      (r.findings||[]).slice(0,12).map(f=>`<div class="item"><b>${escapeHtml(f.severity)} · ${escapeHtml(f.title)}</b><div class="small">${escapeHtml(f.rationale)}</div><div class="muted small">Action: ${escapeHtml(f.recommendedAction)}</div></div>`).join("");
    await renderInspectionReadiness();
  }catch(e){detail.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

async function createEmploymentDefensePack(caseId){
  try{
    const r=await apiJson("/api/defense-packs/employment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({caseId})});
    alert(`Defense Pack ${r.status}. Approved evidence: ${r.evidenceCount}. Gaps: ${r.gapCount}.`);
    await renderDefensePacks();
  }catch(e){alert(e.message)}
}
async function renderDefensePacks(){
  const box=document.getElementById("defensePackList");if(!box)return;
  try{
    const r=await apiJson("/api/defense-packs");
    box.innerHTML=(r.items||[]).map(x=>`<div class="item"><b>${escapeHtml(x.label)}</b><div class="muted small">${escapeHtml(x.status)} · ${x.evidence_count} approved evidence item(s) · ${x.gap_count} gap(s) · ${new Date(x.created_at).toLocaleString()}</div><div class="audit">${escapeHtml(String(x.content_hash||"").slice(0,24))}…</div></div>`).join("")||'<div class="muted small">No defense packs yet.</div>';
  }catch(e){box.innerHTML=`<div class="muted small">${escapeHtml(e.message)}</div>`}
}


async function populateDefenseEvidenceSelectors(){
  const cs=document.getElementById("defenseCaseSelect"),es=document.getElementById("defenseEvidenceSelect");if(!cs||!es)return;
  try{
    const [c,e]=await Promise.all([apiJson("/api/hr/cases"),apiJson("/api/evidence/integrity")]);
    cs.innerHTML=(c.items||[]).filter(x=>x.status!=="closed").map(x=>`<option value="${x.id}">${escapeHtml(x.case_type)} · ${escapeHtml(x.risk_level)} · ${escapeHtml(x.status)}</option>`).join("");
    es.innerHTML=(e.items||[]).filter(x=>x.review_status==="approved").map(x=>`<option value="${x.id}">${escapeHtml(x.name||x.id)}</option>`).join("");
  }catch(e){}
}
async function linkDefenseEvidence(){
  const caseId=document.getElementById("defenseCaseSelect")?.value,evidenceId=document.getElementById("defenseEvidenceSelect")?.value,relationship=document.getElementById("defenseEvidenceRelationship")?.value||"supporting";
  if(!caseId||!evidenceId){alert("Choose an open HR case and approved evidence.");return}
  try{
    await apiJson(`/api/hr/cases/${caseId}/evidence-link`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({evidenceId,relationship})});
    alert("Evidence linked to HR case.");await renderDefensePacks();
  }catch(e){alert(e.message)}
}


async function renderBusinessEvents(){
  const box=document.getElementById("businessEventList");if(!box)return;
  try{
    const r=await apiJson("/api/business-events"),items=r.items||[];
    document.getElementById("businessEventCount").textContent=items.length;
    document.getElementById("businessEventProcessing").textContent=items.filter(x=>x.status==="processing"||x.status==="queued").length;
    document.getElementById("businessEventPartial").textContent=items.filter(x=>x.status==="partial").length;
    document.getElementById("businessEventFailed").textContent=items.filter(x=>x.status==="failed").length;
    box.innerHTML=items.slice(0,50).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.event_type.replaceAll("_"," "))}</b><div class="muted small">${escapeHtml(x.event_category)} · ${escapeHtml(x.status)} · ${new Date(x.occurred_at).toLocaleString()}</div></div><div><button class="btn alt" onclick="viewBusinessEvent('${x.id}')">Impact Map</button>${x.status==="failed"?`<button class="btn alt" onclick="retryBusinessEvent('${x.id}')">Retry</button>`:""}</div></div></div>`).join("")||'<div class="muted small">No business events yet.</div>';
  }catch(e){box.innerHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}

async function viewBusinessEvent(id){
  const box=document.getElementById("businessEventImpactDetail");if(!box)return;
  try{
    const r=await apiJson(`/api/business-events/${id}`),impacts=r.impacts||[],effects=r.effects||[];
    box.innerHTML=`<div class="notice"><b>Impact Map</b><div class="small">Shows what the event caused the protection engine to re-evaluate; it is not proof that every external legal consequence has been identified.</div></div>`+
      impacts.map(x=>`<div class="item"><b>${escapeHtml(x.impact_level)} · ${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.impact_type)}</div><div class="small">${escapeHtml(x.explanation)}</div></div>`).join("")+
      `<div class="item"><b>Processing effects</b>${effects.map(e=>`<div class="small">${e.sequence_no}. ${escapeHtml(e.effect_type)} · ${escapeHtml(e.status)}${e.last_error?` · ${escapeHtml(e.last_error)}`:""}</div>`).join("")}</div>`;
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}

async function retryBusinessEvent(id){
  try{await apiJson(`/api/business-events/${id}/retry`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderBusinessEvents()}catch(e){alert(e.message)}
}
async function reportBusinessEvent(){
  const eventType=document.getElementById("manualBusinessEventType")?.value,reason=document.getElementById("manualBusinessEventReason")?.value||"";
  try{
    await apiJson("/api/business-events/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventType,reason})});
    document.getElementById("manualBusinessEventReason").value="";await renderBusinessEvents();await renderRiskEvents();await renderStatutoryCalendar();
  }catch(e){alert(e.message)}
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
    const sel=document.getElementById("partnerImpactClient");if(sel)sel.innerHTML=clients.map(([id,name])=>`<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
    feed.innerHTML=actions.slice(0,100).map(x=>`<div class="item"><b>${escapeHtml(x.urgency)} · ${escapeHtml(x.clientName)}</b><div class="small">${escapeHtml(x.title)}</div><div class="muted small">${escapeHtml(x.explanation||"")} ${x.dueAt?`· Due ${new Date(x.dueAt).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No active portfolio actions.</div>';
    document.getElementById("partnerTaskQueue").innerHTML=tasks.slice(0,100).map(x=>`<div class="item"><div class="between row"><div><b>${escapeHtml(x.client_name||x.client_tenant_id)} · ${escapeHtml(x.title)}</b><div class="muted small">${escapeHtml(x.status)} · source ${escapeHtml(x.source_status||"unknown")} · priority ${x.priority}</div></div><select onchange="setPartnerTaskStatus('${x.id}',this.value)"><option value="open" ${x.status==="open"?"selected":""}>Open</option><option value="review" ${x.status==="review"?"selected":""}>Review</option><option value="blocked" ${x.status==="blocked"?"selected":""}>Blocked</option><option value="done" ${x.status==="done"?"selected":""}>Done</option></select></div></div>`).join("")||'<div class="muted small">Refresh to create the partner work queue.</div>';
  }catch(e){feed.innerHTML=`<div class="notice">${escapeHtml(e.message)}</div>`}
}
async function refreshPartnerActionCenter(){
  try{await apiJson("/api/partner/action-center/refresh",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});await renderPartnerActionCenter()}catch(e){alert(e.message)}
}
async function setPartnerTaskStatus(id,status){
  try{await apiJson(`/api/partner/tasks/${id}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await renderPartnerActionCenter()}catch(e){alert(e.message)}
}
async function loadPartnerClientImpact(){
  const clientId=document.getElementById("partnerImpactClient")?.value,box=document.getElementById("partnerClientImpactDetail");if(!clientId||!box)return;
  try{
    const r=await apiJson(`/api/partner/action-center/clients/${encodeURIComponent(clientId)}`),score=r.score||{};
    box.innerHTML=`<div class="grid g3"><div class="card"><div class="kpi">Protection score</div><div class="score">${score.score??"—"}</div></div><div class="card"><div class="kpi">Grade</div><div class="score">${escapeHtml(score.grade||"—")}</div></div><div class="card"><div class="kpi">Actions</div><div class="score">${(r.actions||[]).length}</div></div></div>`+
      (r.actions||[]).slice(0,30).map(x=>`<div class="item"><b>${escapeHtml(x.urgency)} · ${escapeHtml(x.title)}</b><div class="small">${escapeHtml(x.explanation||"")}</div></div>`).join("")+
      `<div class="item"><b>Recent regulatory impacts</b>${(r.regulatoryImpacts||[]).slice(0,20).map(x=>`<div class="small">${escapeHtml(x.impact_level)} · ${escapeHtml(x.rule_title)} · ${escapeHtml(x.status)}</div>`).join("")||'<div class="muted small">None.</div>'}</div>`+
      `<div class="item"><b>Recent inspection readiness</b>${(r.inspections||[]).slice(0,10).map(x=>`<div class="small">${escapeHtml(x.name)} · ${x.coverage_status==="insufficient"?"N/A":x.readiness_score} · ${escapeHtml(x.readiness_band)}</div>`).join("")||'<div class="muted small">None.</div>'}</div>`;
  }catch(e){box.innerHTML=`<div class="notice bad">${escapeHtml(e.message)}</div>`}
}


function publicPassportHashToken(){
  const raw=String(location.hash||"");
  if(!raw.startsWith("#passport="))return null;
  try{return decodeURIComponent(raw.slice("#passport=".length))}catch{return null}
}
async function handlePublicPassportFragment(){
  const token=publicPassportHashToken();if(!token)return false;
  history.replaceState(null,"",location.pathname+location.search);
  marketingGate.classList.add("hidden");authGate.classList.add("hidden");appShell.style.visibility="hidden";
  const gate=document.getElementById("publicPassportGate"),box=document.getElementById("publicPassportResult");gate.classList.remove("hidden");
  try{
    const res=await fetch("/public/passport/verify",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",referrerPolicy:"no-referrer",body:JSON.stringify({shareToken:token})});
    const r=await res.json().catch(()=>({}));if(!res.ok)throw new Error(r.error||"Verification failed");
    const controls=r.controls||[],receipt=r.receipt||{};
    box.innerHTML=`<div class="notice"><b>Verification receipt ${escapeHtml(receipt.code||"")}</b><div class="small">Status recorded at ${escapeHtml(r.generatedAt||"")}. Snapshot SHA-256: <span class="audit">${escapeHtml(receipt.snapshotHash||"")}</span></div></div>`+
      `${r.companyName?`<h2 style="margin-top:14px">${escapeHtml(r.companyName)}</h2>`:""}`+
      `${r.score?`<div class="card" style="margin-top:12px"><div class="kpi">Passport score</div><div class="score">${r.score.score}%</div><div class="muted small">${r.score.verified}/${r.score.total} current verified controls</div></div>`:""}`+
      `<div style="margin-top:12px">${controls.map(c=>`<div class="item"><b>${escapeHtml(c.controlKey)}</b><div class="muted small">${escapeHtml(c.status)}${c.verifiedAt?` · verified ${new Date(c.verifiedAt).toLocaleString()}`:""}${c.expiresAt?` · review/expiry ${new Date(c.expiresAt).toLocaleDateString()}`:""}</div></div>`).join("")||'<div class="muted small">No controls were included.</div>'}</div>`+
      `<div class="muted small" style="margin-top:12px">${escapeHtml(r.disclaimer||"")}</div>`;
  }catch(e){box.innerHTML=`<div class="notice bad"><b>Passport could not be verified.</b><div class="small">${escapeHtml(e.message)}</div></div>`}
  return true;
}
function leavePublicPassport(){document.getElementById("publicPassportGate")?.classList.add("hidden");showMarketing()}

function showView(id){const target=document.getElementById(id);if(!target){console.warn("Unknown view",id);return}document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));target.classList.add("active");document.querySelectorAll(".nav button").forEach(b=>{let active=b.dataset.view===id;b.classList.toggle("active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});const nb=document.querySelector(`[data-view="${id}"]`);document.getElementById("pageTitle").textContent=nb?.childNodes[0]?.textContent?.trim()||"BW Compliance OS";updateMobileNav(id);let sr=document.getElementById("srStatus");if(sr)sr.textContent="Opened "+document.getElementById("pageTitle").textContent;window.scrollTo({top:0,behavior:"smooth"});setTimeout(animateViewItems,20)}

let wizardStep=0;
function openOnboarding(){
 wizardStep=0;loadWizard();renderWizard();openModal("onboardModal")
}
function loadWizard(){
 let p=state.profile;
 wName.value=p.name||"";wIncorporationDate.value=p.incorporationDate||"";wEntityType.value=p.entityType||"";wIndustry.value=p.industry||"Retail";wTown.value=p.town||"";wEmployees.value=p.employees||0;wTurnover.value=p.turnover||0;
 wPaye.value=String(!!p.paye);wVat.value=String(!!p.vat);wVatCategory.value=p.vatCategory||"";wTrade.value=String(!!p.trade);wCitizen.value=String(p.citizenOwned!==false);
 wPremises.value=String(!!p.premises);wTradeAnniversary.value=p.tradeAnniversary||"";wManufacturing.value=String(!!p.manufacturing);wData.value=String(!!p.data);wTender.value=String(!!p.tender);wCipaMonth.value=p.cipaMonth||"";
}
function renderWizard(){
 document.querySelectorAll(".wizardstep").forEach((x,i)=>x.classList.toggle("active",i===wizardStep));
 wizardProgress.querySelector("span").style.width=((wizardStep+1)/5*100)+"%";
 wizardBack.disabled=wizardStep===0;wizardNext.textContent=wizardStep===4?"Save setup":"Next";
 if(wizardStep===4){
  wizardReview.innerHTML=`<div class="matrix"><b>Company</b><span>${escapeHtml(wName.value)}</span><b>Entity type</b><span>${escapeHtml(wEntityType.value||"Not set")}</span><b>Industry</b><span>${escapeHtml(wIndustry.value)}</span><b>Employees</b><span>${wEmployees.value||0}</span><b>PAYE / VAT</b><span>${wPaye.value==="true"?"PAYE ":""}${wVat.value==="true"?"VAT":""}</span><b>Trade</b><span>${wTrade.value==="true"?"Required / tracked":"Not currently selected"}</span><b>Data</b><span>${wData.value==="true"?"Processes personal data":"No personal-data processing selected"}</span><b>Tenders</b><span>${wTender.value==="true"?"Yes":"No"}</span></div>`;
 }
}
function wizardMove(dir){
 if(dir>0 && wizardStep===4){saveWizard();return}
 wizardStep=Math.max(0,Math.min(4,wizardStep+dir));renderWizard()
}
function saveWizard(){
 state.profile={name:wName.value.trim()||"Unnamed Business",incorporationDate:wIncorporationDate.value||"",entityType:wEntityType.value||"",industry:wIndustry.value,town:wTown.value.trim(),employees:+wEmployees.value||0,turnover:+wTurnover.value||0,paye:wPaye.value==="true",vat:wVat.value==="true",vatCategory:wVatCategory.value||"",trade:wTrade.value==="true",citizenOwned:wCitizen.value==="true",premises:wPremises.value==="true",tradeAnniversary:wTradeAnniversary.value,manufacturing:wManufacturing.value==="true",mfgActivity:state.profile.mfgActivity||"",mfgFactory:!!state.profile.mfgFactory,mfgAnniversary:state.profile.mfgAnniversary||"",data:wData.value==="true",tender:wTender.value==="true",cipaMonth:wCipaMonth.value};
 apiJson("/api/account/onboarding/complete",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).catch(()=>{});logEvent("GUIDED_SETUP_COMPLETED",{industry:state.profile.industry,employees:state.profile.employees});
 save();closeModal("onboardModal");renderAll();showView("dashboard")
}


function showSyncError(msg){let el=document.getElementById("globalConflictBanner");if(el){el.style.display="block";el.innerHTML=`<b>Sync problem</b><div class="small">${escapeHtml(msg)}. Changes remain in memory until this page is closed; retry after connectivity returns.</div>`}}
async function apiFetch(url,opts={}){
 const o={...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})},credentials:"same-origin"};
 if(o.method && !["GET","HEAD"].includes(o.method.toUpperCase()) && csrfToken)o.headers["X-CSRF-Token"]=csrfToken;
 const res=await fetch(url,o);let data={};try{data=await res.json()}catch{}
 if(res.status===401){showAuth();throw new Error("Session expired. Please sign in again.")}
 if(!res.ok)throw new Error(data.error||data.message||`Request failed (${res.status})`);return data
}

function showMarketing(){marketingGate.classList.remove("hidden");authGate.classList.add("hidden");appShell.style.visibility="hidden"}
function hideMarketing(){marketingGate.classList.add("hidden")}
function openAuthFromMarketing(mode="register"){hideMarketing();showAuth();setAuthMode(mode);if(mode==="register")setTimeout(()=>authCompany.focus(),50);else setTimeout(()=>authEmail.focus(),50)}
function backToMarketing(){authGate.classList.add("hidden");showMarketing()}
function scrollToPricing(){document.getElementById("pricing")?.scrollIntoView({behavior:"smooth",block:"start"})}
function selectPlanAndRegister(plan){selectedPublicPlan=plan;sessionStorage.setItem("bwcos_selected_plan",plan);openAuthFromMarketing("register")}
function planLabel(p){return p==="starter"?"Starter":p==="pro"?"Business Pro":"Business"}
function moneyPlan(p){return p==="starter"?"P99":p==="pro"?"P499":"P249"}
async function loadBilling(){
 try{billingInfo=await apiFetch("/api/billing/status");renderBilling()}catch{}
}
function renderBilling(){
 let b=billingInfo||{},status=b.status||"unknown",trial=b.trial_ends_at?new Date(b.trial_ends_at):null,renew=b.current_period_ends_at?new Date(b.current_period_ends_at):null,plan=b.plan||sessionStorage.getItem("bwcos_selected_plan")||"business";
 let fmt=d=>d&&!isNaN(d)?d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"—";
 if(document.getElementById("billingStatus"))billingStatus.textContent=status.charAt(0).toUpperCase()+status.slice(1);if(document.getElementById("billingDate"))billingDate.textContent=fmt(status==="trialing"?trial:renew);if(document.getElementById("billingPlan"))billingPlan.textContent=planLabel(plan);
 document.querySelectorAll("[data-plan-card]").forEach(c=>c.classList.toggle("current",c.dataset.planCard===plan));
 let banner=document.getElementById("billingBanner");if(banner){let days=trial?Math.max(0,Math.ceil((trial-Date.now())/86400000)):null;if(status==="trialing"){banner.style.display="flex";banner.innerHTML=`<div><b>${days} day${days===1?"":"s"} left in your free trial</b><div class="muted small">Current selection: ${planLabel(plan)} · ${moneyPlan(plan)}/month after trial when billing is activated.</div></div><button class="btn soft" onclick="showView('billing')">View plans</button>`}else if(status==="active"){banner.style.display="flex";banner.innerHTML=`<div><b>${planLabel(plan)} plan active</b><div class="muted small">Renewal ${fmt(renew)}</div></div><button class="btn soft" onclick="showView('billing')">Manage plan</button>`}else{banner.style.display="none"}}
}
async function requestPlan(plan){
 const upgradeResult=document.getElementById("upgradeResult");if(upgradeResult)upgradeResult.innerHTML='<div class="muted small">Preparing secure hosted checkout…</div>';
 try{
   const data=await apiJson("/api/payments/subscription-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({plan})});
   billingInfo={...(billingInfo||{}),plan};
   renderBilling();
   if(upgradeResult)upgradeResult.innerHTML=`<div class="upgradeSuccess"><b>${planLabel(plan)} checkout created.</b><br>Payment order ${escapeHtml(data.paymentOrder.id)} for ${moneyPlan(plan)}/month is ready for the configured hosted payment provider. The plan activates only after a verified payment webhook.</div>`;
   await renderPayments();
 }catch(e){if(upgradeResult)upgradeResult.innerHTML=`<div class="autherror show">${escapeHtml(e.message)}</div>`}
}

function setAuthMode(mode){authMode=mode;loginTab.classList.toggle("active",mode==="login");registerTab.classList.toggle("active",mode==="register");companyNameField.style.display=mode==="register"?"block":"none";authSubmit.textContent=mode==="register"?"Create secure workspace":"Sign in";authPassword.autocomplete=mode==="register"?"new-password":"current-password";authError.classList.remove("show")}
function showAuth(){marketingGate.classList.add("hidden");authGate.classList.remove("hidden");appShell.style.visibility="hidden"}
function hideAuth(){marketingGate.classList.add("hidden");authGate.classList.add("hidden");appShell.style.visibility="visible"}
async function submitAuth(){
 authError.classList.remove("show");let payload={email:authEmail.value.trim(),password:authPassword.value};if(authMode==="register"){payload.companyName=authCompany.value.trim();payload.plan=sessionStorage.getItem("bwcos_selected_plan")||selectedPublicPlan||"business"}
 try{let data=await fetch(`/api/auth/${authMode}`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)}).then(async r=>{let d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Authentication failed");return d});csrfToken=data.csrfToken||"";currentUser=data.user;await loadServerState();hideAuth()}catch(err){authError.textContent=err.message;authError.classList.add("show")}
}
async function logoutUser(){try{await apiFetch("/api/auth/logout",{method:"POST",body:"{}"})}catch{}csrfToken="";currentUser=null;authPassword.value="";showMarketing()}
async function loadServerState(){
 const me=await fetch("/api/auth/me",{credentials:"same-origin"});if(!me.ok)throw new Error("Not authenticated");const info=await me.json();currentUser=info.user;csrfToken=info.csrfToken||csrfToken;
 const st=await apiFetch("/api/state");serverStateVersion=st.version||1;if(st.state&&st.state.companies?.length){store=st.state}else{store=structuredClone(DEFAULT_STATE);store.activeRole=currentUser.role;let init=await apiFetch("/api/state",{method:"PUT",body:JSON.stringify({state:store,version:serverStateVersion})});serverStateVersion=init.version||serverStateVersion}
 store.activeRole=currentUser.role;state=store.companies.find(c=>c.id===store.activeCompanyId)||store.companies[0];
 try{let a=await apiFetch("/api/audit");store.audit=a.items||[]}catch{store.audit=[]}
 renderAll();applyRoleUi();await loadBilling();hideAuth();logEvent("APP_OPENED",{ruleset:"BW-2026.08.30-launch"});handleOAuthResult();handleResetLink();
}

function openModal(id){document.getElementById(id).classList.add("open")}function closeModal(id){document.getElementById(id).classList.remove("open")}
document.getElementById("nav").addEventListener("click",e=>{let b=e.target.closest("button[data-view]");if(b)showView(b.dataset.view)});
async function bootstrap(){marketingGate.classList.add("hidden");authGate.classList.add("hidden");appShell.style.visibility="hidden";if(await handlePublicPassportFragment())return;if(STANDALONE_PREVIEW){showMarketing();return}try{await loadServerState()}catch(err){csrfToken="";currentUser=null;showMarketing()}}
if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{})}
document.getElementById("authPassword").addEventListener("keydown",e=>{if(e.key==="Enter")submitAuth()});
bootstrap();
