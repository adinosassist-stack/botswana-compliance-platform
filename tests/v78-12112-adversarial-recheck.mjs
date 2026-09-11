import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const checks=[];const ok=(name,cond)=>{assert.ok(cond,name);checks.push(name)};
ok('release version 1.21.12',pkg.version.startsWith('1.21.')&&Number(pkg.version.split('.')[2]||0)>=20);
ok('PWA cache 1.21.12',sw.includes(`bw-business-protection-v78-${pkg.version}`));

// Pass 1: strict calendar-date integrity, not regex-only or Date.parse normalization.
const wStart=worker.indexOf('function isoDateValid');
const wEnd=worker.indexOf('function previousIsoDate',wStart);
const wc={Date,Number,String};vm.createContext(wc);vm.runInContext(worker.slice(wStart,wEnd),wc);
ok('worker strict date accepts leap day',wc.isoDateValid('2028-02-29')===true);
ok('worker strict date rejects non-leap Feb 29',wc.isoDateValid('2026-02-29')===false);
ok('worker strict date rejects Feb 31',wc.isoDateValid('2026-02-31')===false);
ok('worker strict date rejects April 31',wc.isoDateValid('2026-04-31')===false);
ok('worker strict date rejects month 13',wc.isoDateValid('2026-13-01')===false);
const hStart=html.indexOf('function licenceDateOnly');
const hEnd=html.indexOf('function licenceDateState',hStart);
const hc={Date,Number,String};vm.createContext(hc);vm.runInContext(html.slice(hStart,hEnd),hc);
ok('client date sanitizer accepts real date',hc.licenceDateOnly('2026-11-30')==='2026-11-30');
ok('client date sanitizer rejects impossible date',hc.licenceDateOnly('2026-11-31')==='');
ok('renew prompt uses strict client date helper',html.includes('const value=licenceDateOnly(String(next||"").trim())'));

// Pass 2: authorization first and mutation/data-integrity boundaries.
const postStart=worker.indexOf('if(url.pathname==="/api/licences"&&req.method==="POST")');
const postEnd=worker.indexOf('if(url.pathname.match(/^\\/api\\/licences\\/[^/]+\\/renew$/)',postStart);
const postBlock=worker.slice(postStart,postEnd);
ok('licence POST role check precedes entitlement lookup',postBlock.indexOf('roleAllowed(a,"owner","manager")')>=0&&postBlock.indexOf('roleAllowed(a,"owner","manager")')<postBlock.indexOf('enforceUsageLimit'));
ok('licence type is bounded',postBlock.includes('.slice(0,120)'));
ok('licence authority is bounded',postBlock.includes('.slice(0,160)'));
ok('licence site id is bounded',postBlock.includes('siteId=body.siteId?String(body.siteId).trim().slice(0,120):null'));
ok('licence metadata is object-only',postBlock.includes('typeof body.metadata==="object"&&!Array.isArray(body.metadata)'));
ok('licence metadata is size bounded',postBlock.includes('metadataJson.length>4096')&&postBlock.includes('licence_metadata_too_large'));
const renewStart=worker.indexOf('if(url.pathname.match(/^\\/api\\/licences\\/[^/]+\\/renew$/)');
const renewEnd=worker.indexOf('if(url.pathname==="/api/business-events"',renewStart);
const renewBlock=worker.slice(renewStart,renewEnd);
ok('renew requires an actual next date',renewBlock.includes('if(!renewalDueAt)return json({error:"renewal_date_required"},400)'));
ok('renew validates next date strictly',renewBlock.includes('if(!isoDateValid(renewalDueAt))return json({error:"invalid_renewal_date"},400)'));

// Pass 3: reads and aggregated actions sanitize legacy malformed database values.
const getStart=worker.indexOf('if(url.pathname==="/api/licences"&&req.method==="GET")');
const getEnd=worker.indexOf('if(url.pathname==="/api/passport/shares"',getStart);
const getBlock=worker.slice(getStart,getEnd);
ok('licence GET does not expose unused metadata blob',!getBlock.includes('metadata_json'));
ok('licence GET normalizes issued date',getBlock.includes('issued_at:isoDateValid(x.issued_at)?x.issued_at:null'));
ok('licence GET normalizes renewal date',getBlock.includes('renewal_due_at:isoDateValid(x.renewal_due_at)?x.renewal_due_at:null'));
const nextStart=worker.indexOf('if(url.pathname==="/api/next-actions"&&req.method==="GET")');
const nextEnd=worker.indexOf('if(url.pathname==="/api/company-actions"',nextStart);
const nextBlock=worker.slice(nextStart,nextEnd);
ok('next-actions remains owner manager only',nextBlock.includes('roleAllowed(a,"owner","manager")'));
ok('next-actions validates licence date before priority',nextBlock.includes('const dueAt=isoDateValid(x.renewal_due_at)?x.renewal_due_at:null'));
ok('next-actions does not emit malformed licence due date',nextBlock.includes('dueAt})'));
console.log(`v78 1.21.12 adversarial recheck: ${checks.length}/${checks.length} checks passed`);
