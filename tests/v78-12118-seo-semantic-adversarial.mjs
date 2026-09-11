import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),pkg=JSON.parse(read('package.json')),sw=read('public/sw.js');
const checks=[];const ok=(name,v)=>{assert.ok(v,name);checks.push(name)};
ok('release 1.21.20',pkg.version.startsWith('1.21.')&&Number(pkg.version.split('.')[2]||0)>=20);
ok('PWA cache 1.21.20',sw.includes(`bw-business-protection-v78-${pkg.version}`));
// Strip executable/JSON scripts so template strings do not count as document headings.
const markup=html.replace(/<script\b[\s\S]*?<\/script>/gi,'');
const h1s=[...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>m[1].replace(/<[^>]+>/g,'').trim());
ok('homepage document has exactly one semantic H1',h1s.length===1);
ok('hero copy remains the single H1',h1s[0]==='See business risk before it becomes a penalty, dispute or loss.');
ok('reporter heading is H2',html.includes('<h2>What happened today?</h2>')&&!html.includes('<h1>What happened today?</h1>'));
ok('restricted-role heading is H2',html.includes('<h2 style="font-size:clamp(28px,4vw,44px)">This account does not open the leadership workspace.</h2>'));
ok('auth heading is H2',html.includes('<h2 id="authTitle"'));
ok('workspace page title is H2',html.includes('<h2 id="pageTitle">Dashboard</h2>'));
ok('homepage includes all five public plans',['Monitor','Protect','Control','Network','Partner','P149','P349','P699','P1,299','P2,499'].every(x=>html.includes(x)));
ok('Partner is presented as assisted onboarding',html.includes('P24,990/year · two months free · assisted onboarding')&&html.includes('>Partner details</a>')&&!html.includes("startFreeFromMarketing('partner')"));
ok('structured offer high price matches Partner',html.includes('"highPrice":"2499"'));
ok('structured offer count is five',html.includes('"offerCount":"5"'));
ok('large desktop pricing accommodates five plans',html.includes('repeat(5,minmax(0,1fr))'));
const slugs=['cipa-compliance-botswana','burs-tax-compliance-botswana','business-licences-botswana','employment-compliance-botswana','tender-readiness-botswana','compliance-evidence-botswana','pricing'];
for(const slug of slugs){
 const s=read(`public/${slug}/index.html`);const m=s.replace(/<script\b[\s\S]*?<\/script>/gi,'');
 const hs=[...m.matchAll(/<h1\b[^>]*>/gi)];ok(`${slug} exactly one H1`,hs.length===1);
}
const ld=(html.match(/<script type="application\/ld\+json" id="seoStructuredData">([\s\S]*?)<\/script>/i)||[])[1]||'';
ok('service schema avoids incomplete software-app rich-result markup',ld.includes('"@type":"Service"')&&!ld.includes('"@type":"WebApplication"')&&!ld.includes('"@type":"SoftwareApplication"'));
ok('no FAQPage rich-result markup',!ld.includes('"FAQPage"'));
ok('no fabricated aggregateRating',!ld.includes('"aggregateRating"'));
ok('no fabricated review schema',!ld.includes('"review"'));
console.log(`v78 1.21.20 SEO semantic adversarial: ${checks.length}/${checks.length} PASS`);
