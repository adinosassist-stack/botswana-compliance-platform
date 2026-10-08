import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-focus-strip-v296.js","utf8");
let checks=0;
const ok=(value,message)=>{checks++;if(!value)throw new Error(`FAIL ${checks}: ${message}`)};

ok(source.includes('20261007-owner-focus-v3-v303'),"V303 release marker must be present");
ok(source.includes('Review next'),"Owner Focus must expose a Review next control");
ok(source.includes('function reviewNext()'),"Review next must have an explicit non-writing navigation handler");
ok(source.includes('function queueNodes(panel,key="all")'),"Queue targeting must share one filter-aware selector boundary");
ok(source.includes('oldestQueueAge(panel,activeFilter)'),"Oldest-age context must follow the active queue filter");
ok(source.includes('scheduleSync();'),"Filter changes must resynchronize Review next state and age context");
ok(source.includes('next.disabled=!activeTarget'),"Review next must disable when the active filtered queue has no focusable item");
ok(source.includes('data-owner-focus-title'),"Owner Focus must expose a live summary title");
ok(source.includes('items need')&&source.includes('item needs'),"Owner Focus must summarize the open queue count");
ok(source.includes('time[datetime]'),"Oldest-age context must use semantic time metadata when available");
ok(source.includes('data-created-at')&&source.includes('data-updated-at'),"Oldest-age context must support bounded explicit timestamp metadata");
ok(source.includes('Oldest ${oldestAge}'),"Oldest queue age must be surfaced only when evidence exists");
ok(source.includes('panelObserver.observe(observedPanel'),"MutationObserver must remain scoped to the Owner attention panel");
ok(!source.includes('observe(document.body'),"V303 must not restore the old document-body observer");
ok(source.includes('requestAnimationFrame'),"Queue synchronization must remain frame-debounced");
ok(source.includes('productionSwitchAllowed')===false,"Owner Focus UI must not acquire voice-provider cutover authority");
ok(!/property(?:-calculator|Calculator|CalculatorWorkspace)/.test(source),"V303 must not address or reposition the Property Calculator");
ok(!/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(source),"V303 must remain client-side presentation/navigation only");
ok(source.includes('aria-live","polite'),"Dynamic Owner Focus summary must be announced accessibly");
ok(source.includes('activeTarget?`Review next ${activeLabel}`:`No ${activeLabel} to review`'),"Review-next accessibility state must follow the active filtered queue");
ok(source.includes('attributeFilter:["datetime","data-created-at","data-updated-at"]'),"Observer attribute scope must be restricted to priority-age evidence fields");

console.log(`V303 Owner Focus priority context: ${checks}/${checks} PASS`);
