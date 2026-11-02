import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../public/js/owner-ask-thebe-render-v321.js",import.meta.url),"utf8");
test("owner dock preserves private advisor for tenant questions",()=>{
 assert.match(ui,/const additionalWorkspaceQuestion=question=>/);
 assert.match(ui,/const useGeneralAi=question=>generalAiEnabled\(\)&&!privateWorkspaceQuestion\(question\)&&!additionalWorkspaceQuestion\(question\)&&!actionQuestion\(question\)/);
 assert.match(ui,/const actionQuestion=question=>/);
 assert.match(ui,/transfer money/);
 assert.match(ui,/const general=useGeneralAi\(normalized\)/);
 assert.match(ui,/if\(!general\)await ensureAiCreditsReady\(\)/);
 assert.match(ui,/\?await window\.apiJson\("\/api\/ai\/general"/);
 assert.match(ui,/:await window\.apiJson\("\/api\/ai\/advisor"/);
});

test("citation links enforce HTTPS and exclude credentialed or internal hosts",()=>{
 assert.match(ui,/url\.username\|\|url\.password\|\|url\.port/);
 assert.match(ui,/url\.hostname\.includes\(":"\)/);
 assert.match(ui,/url\.protocol!=="https:"/);
 assert.match(ui,/link\.rel="noopener noreferrer"/);
});

test("search excerpts are not rendered as verified confidence",()=>{
 assert.match(ui,/result\.verification==="search_snippets_only"\?"SEARCH EXCERPTS"/);
 assert.match(ui,/result\.verification\?"general AI":"governed"/);
});

test("advisor answer card discloses unavailable and compacted workspace evidence",()=>{
 assert.match(ui,/availability\?\.financeAndBusiness==="unavailable"/);
 assert.match(ui,/availability\?\.financeAndBusinessComplete===false/);
 assert.match(ui,/Workspace data is incomplete or unavailable/);
 assert.match(ui,/result\.contextCompaction\?\.applied===true/);
 assert.match(ui,/Some lower-priority workspace records were omitted/);
});
