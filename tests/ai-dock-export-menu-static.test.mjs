import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const src=readFileSync(new URL("../public/js/thebe-ai-export-menu.js",import.meta.url),"utf8");
test("export menu is gated by authenticated tenant-authorized server capability",()=>{
 for(const guard of ["capability?.enabled!==true","capability?.authenticated!==true","capability?.tenantAuthorized!==true"])assert.ok(src.includes(guard));
 assert.match(src,/typeof onExport!=="function"/);
});
test("export is explicit, accessible and resistant to double submission",()=>{
 for(const value of ["pdf","docx","pptx","aria-live","aria-label","if(busy)return","button.disabled=true","catch{status.textContent"])assert.ok(src.includes(value));
 assert.doesNotMatch(src,/fetch\(|localStorage|publicUrl|createObjectURL/);
});
