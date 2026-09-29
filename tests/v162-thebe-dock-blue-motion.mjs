import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../public/assets/thebe-ai-dock.css',import.meta.url),'utf8');
const dockJs=fs.readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../public/home.html',import.meta.url),'utf8');

assert.match(css,/V161 dock polish/);
assert.match(css,/V162 blue motion/);
assert.match(css,/V164 futuristic command surface/);
assert.match(css,/V167 workspace dock/);
assert.match(css,/V172 governed mission rail/);
assert.match(css,/V182 character-free voice field/,'Talk to Thebe must use the V182 character-free voice treatment');
assert.match(home,/class="visual market-hero-visual"/,'marketing hero must restore the human business picture composition');
assert.match(home,/class="market-hero-photo" src="\/assets\/gaborone-entrepreneurs-v67\.webp"/,'marketing hero must restore the original Botswana business photo');
assert.doesNotMatch(home,/market-hero-mascot|thebe-public-mascot|thebe-mascot-original\.png/,'marketing page must not render mascot artwork');
assert.match(home,/\.cta-box \.btn\.secondary\{[\s\S]*?color:#0f172a/,'closing white CTA must keep dark readable text');
assert.doesNotMatch(dockJs,/mascotImage\.src="\/assets\/thebe-mascot-original\.png"/,'Talk to Thebe dock must not create or load mascot artwork');
assert.doesNotMatch(dockJs,/viewBox:"0 0 1000 1000"/,'Talk to Thebe dock must not construct the legacy mascot SVG');
assert.match(dockJs,/mascot=null;[\s\S]*?orb\.append\(wave,core\)/,'Talk to Thebe must retain the voice field without a mascot');
assert.doesNotMatch(css,/\.thebe-particle-core::before\{[\s\S]*?thebe-desk-logo-symbol\.png/,'Talk to Thebe must not add a decorative mascot symbol');

assert.match(css,/\.thebe-ai-mission-track\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,'V172 mission rail must expose four governed progress stages');
assert.match(css,/data-tone="review"[\s\S]*?background:#ffb648/,'owner review stage must use restrained amber');
assert.match(css,/data-tone="error"[\s\S]*?background:#ff6268/,'mission errors must remain visually distinct');
assert.match(dockJs,/thebe:owner-agent-state/,'dock must listen to authoritative Owner Command Centre state');
assert.match(dockJs,/ownerCommandState/,'dock state must retain the read-only Owner Command Centre snapshot');
assert.match(dockJs,/const approved=Math\.max\(0,Number\(ownerCommandState\?\.approvedRequests\|\|0\)\)[\s\S]*?ready for guarded execution/,'approved requests must enter a distinct mission branch and expose guarded execution availability');
assert.match(dockJs,/const approved=Math\.max\(0,Number\(ownerCommandState\?\.approvedRequests\|\|0\)\)[\s\S]*?execution controlled/,'approved requests must enter a distinct mission branch and truthfully show when execution remains controlled');

assert.doesNotMatch(css,/thebe-mascot/,'Thebe dock stylesheet must not retain dormant mascot selectors or animation states');
assert.doesNotMatch(css,/linear-gradient|radial-gradient|conic-gradient/,'dock must preserve the no-gradient visual rule');
assert.doesNotMatch(css,/V165 workspace dock UX|V166 workspace polish/,'stale workspace override layers must stay removed');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\]\{[\s\S]*?--thebe-workspace-edge:24px/,'desktop workspace dock must keep a stronger edge inset');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-quick button:before\{[\s\S]*?display:grid/,'workspace quick actions must retain futuristic command icons');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-quick button\{[\s\S]*?padding:14px 42px 14px 52px/,'workspace quick action labels must stay away from both edges');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-voice-card\{[\s\S]*?grid-template-columns:82px minmax\(0,1fr\)/,'workspace voice surface must use the V167 horizontal command layout');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-quick\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'workspace quick actions must use the two-up desktop command grid');
assert.match(css,/\.thebe-ai-dock\[data-surface="workspace"\] \.thebe-ai-compose\{[\s\S]*?margin:0 var\(--thebe-workspace-edge\) 10px/,'workspace composer must stay inset from the dock edge');
assert.match(css,/\.thebe-ai-dock-scroll\{[\s\S]*?padding:22px 22px 24px/,'Thebe AI content must keep a comfortable inset from the dock edge');
assert.match(css,/\.thebe-ai-quick button\{[\s\S]*?min-height:68px[\s\S]*?padding:13px 48px 13px 54px/,'quick actions must use the V164 command-card geometry');
assert.match(css,/\.thebe-ai-compose\{[\s\S]*?margin:0 18px 14px[\s\S]*?border-radius:20px/,'composer must float inside the dock instead of touching the edge');
assert.match(css,/\.thebe-ai-send\{[\s\S]*?width:50px;height:50px[\s\S]*?background:#f8fbff/,'send control must use the high-contrast V164 command treatment');
assert(!/gradient\(/i.test(css),'Thebe AI dock must stay flat without gradients');
assert.match(css,/--thebe-dock-bg:#0b66d6/);
assert.match(css,/\.thebe-ai-dock-scroll\{[\s\S]*?background:#0b66d6/);
assert.match(css,/@keyframes thebe-particle-drift-v162/);
assert.match(css,/@keyframes thebe-particle-react-v162/);
assert.match(css,/@keyframes thebe-particle-shimmer-v162/);
assert.match(css,/\.thebe-particle-wave g\{[\s\S]*?animation:thebe-particle-drift-v162/);
assert.match(css,/\.thebe-particle\{[\s\S]*?animation:thebe-particle-shimmer-v162/);
assert.match(css,/data-phase="listening"[\s\S]*?thebe-particle-react-v162/);
assert.match(css,/prefers-reduced-motion:reduce[\s\S]*?\.thebe-particle,[\s\S]*?animation:none!important/);
assert.match(css,/\.thebe-ai-send\{[\s\S]*?width:46px;height:46px/);
assert.match(css,/\.thebe-ai-quick button\{[\s\S]*?min-height:56px/);

console.log('PASS: V181 restores the marketing photo, keeps one smaller public mascot, removes mascot artwork from Talk to Thebe/workspace, and preserves governed dock behavior.');
