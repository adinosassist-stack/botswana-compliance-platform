import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const read=p=>fs.readFileSync(p,'utf8');
let pass=0;
const ok=(condition,message)=>{if(!condition)throw new Error(`FAIL: ${message}`);pass++;console.log('PASS',message)};
const brand='Thebe Desk';
const retired=/BW Business Protection(?: OS)?|BW Protection/;

const home=read('public/index.html');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const worker=read('cloudflare/src/worker.js');
const server=read('server/server.js');
const sw=read('public/sw.js');
const profile=JSON.parse(read('RELEASE_PROFILE.json'));
const ownerCss=read('public/assets/owner-command-centre.css');
const workspaceUx=read('public/assets/workspace-ui-ux-10.css');

ok(home.includes(`<title>Botswana SME Compliance Software | ${brand}</title>`) && home.includes(`property="og:site_name" content="${brand}"`),'home title and Open Graph site identity use Thebe Desk');
ok(home.includes(`"name":"${brand}"`) && /class="marketinglogo"[^>]*>[\s\S]*?alt="Thebe Desk logo symbol"[\s\S]*?>Thebe Desk<\/span>/.test(home) && /class="authbrand"[^>]*>[\s\S]*?alt="Thebe Desk logo symbol"[\s\S]*?>Thebe Desk<\/span>/.test(home),'structured data, marketing shell and auth shell use Thebe Desk');
ok(home.includes(`aria-label="Back to ${brand} website"`) && /class="brand workspace-brand-link"[\s\S]*?>Thebe Desk<\/span><\/button>/.test(home),'workspace return identity uses Thebe Desk');
ok(manifest.name===brand && manifest.short_name===brand,'PWA install identity is Thebe Desk');
ok(manifest.icons.every(x=>String(x.src).includes('thebe-desk-icon-')),'PWA manifest no longer advertises legacy-branded icon paths');
ok(sw.includes('thebe-desk-')&&sw.includes('recovery-r1'),'service-worker cache is rotated for Thebe Desk recovery deployment');
ok(worker.includes(`Reset your ${brand} password`) && worker.includes(`Botswana SME Compliance Software | ${brand}`),'Worker email and SEO surfaces use Thebe Desk');
ok(server.includes(`Reset your ${brand} password`),'Node fallback email surface uses Thebe Desk');
ok(profile.product_name===brand && profile.final_public_brand===brand && profile.thebe_desk_brand_finalized===true,'release profile records Thebe Desk as final public brand');

const seoPages=[
 'public/cipa-compliance-botswana/index.html','public/burs-tax-compliance-botswana/index.html',
 'public/business-licences-botswana/index.html','public/employment-compliance-botswana/index.html',
 'public/tender-readiness-botswana/index.html','public/compliance-evidence-botswana/index.html','public/pricing/index.html'
];
ok(seoPages.every(p=>read(p).includes(brand) && !retired.test(read(p))),'all public SEO landing pages use the final brand');
ok(read('public/404.html').includes(brand) && !retired.test(read('public/404.html')),'404 experience uses the final brand');

const visibleFiles=['public/index.html','public/404.html','public/manifest.webmanifest',...seoPages,'cloudflare/src/worker.js','server/server.js','.env.example','README.md'];
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

// Workspace UX must preserve the live visual identity instead of rebranding the product.
ok(workspaceUx.includes('--ws-accent:#0b66d6;') && workspaceUx.includes('--ws-bg:#f7f7f5;') && workspaceUx.includes('--ws-sidebar:#f1f2ef;'),'workspace UX 10 preserves the live blue, warm-white and light-sidebar brand tokens');
ok(!workspaceUx.includes('--ws-accent:#176b4f;') && !workspaceUx.includes('--ws-sidebar:#111713;'),'workspace UX 10 does not reintroduce the retired green/charcoal base-theme direction');
ok(workspaceUx.includes('#appShell') && !workspaceUx.includes('.marketinggate{'),'workspace UX refinement is scoped to the authenticated workspace and does not restyle the public marketing site');
ok(ownerCss.startsWith('@import url("/assets/workspace-ui-ux-10.css?v=20260913b");'),'owner command centre loads the cache-versioned workspace UX refinement before component rules');
ok(workspaceUx.includes('#appShell .owner-action-index') && workspaceUx.includes('background:var(--ws-accent-soft)!important') && workspaceUx.includes('color:var(--ws-accent-strong)!important'),'owner decision layer is visually unified with the live blue workspace brand');
ok(workspaceUx.includes('@media(max-width:1000px)') && workspaceUx.includes('@media(prefers-reduced-motion:reduce)'),'workspace UX 10 retains responsive and reduced-motion behavior');

console.log(`Thebe Desk final-brand adversarial gate: ${pass}/${pass} PASS`);