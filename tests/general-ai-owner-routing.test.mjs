import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../public/js/owner-ask-thebe-render-v321.js",import.meta.url),"utf8");
test("owner dock preserves private advisor for tenant questions",()=>{
 assert.match(ui,/const useGeneralAi=question=>generalAiEnabled\(\)&&!privateWorkspaceQuestion\(question\)&&!actionQuestion\(question\)/);
 assert.match(ui,/const actionQuestion=question=>/);
 assert.match(ui,/transfer money/);
 assert.match(ui,/const general=useGeneralAi\(normalized\)/);
 assert.match(ui,/if\(!general\)await ensureAiCreditsReady\(\)/);
 assert.match(ui,/\?await window\.apiJson\("\/api\/ai\/general"/);
 assert.match(ui,/:await window\.apiJson\("\/api\/ai\/advisor"/);
});
