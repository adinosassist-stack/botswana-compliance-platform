import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const text=readFileSync(new URL("../docs/conversation-staging-acceptance-batch.md",import.meta.url),"utf8");
for(const item of ["Gate 1","Gate 2","Gate 3","Gate 4","Gate 5","synthetic","staging D1","privacy","rollback","production Worker route"])assert(text.includes(item));
console.log("Consolidated staging acceptance contract PASS");
