import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("manager invitation rejects missing or unsupported branch before protected request",()=>{
 const source=read("../public/js/manager-invitations-owner.js");
 assert.match(source,/MANAGER_INVITE_BRANCHES\.includes\(select\.value\)/);
 assert.match(source,/ownerConfirmed!==true/);
});

test("employee cash activity table has accessible caption without changing accounting",()=>{
 const source=read("../public/js/employee-cash-portal.js");
 assert.match(source,/h\("caption","Cash activity and manager review status"\)/);
 assert.match(source,/Amounts are not yet posted to Money/);
});

test("mobile quotation print errors can focus status while keeping browser print",()=>{
 const source=read("../public/js/quotation-customizable-page.mjs");
 assert.match(source,/status\.setAttribute\("tabindex","-1"\)/);
 assert.match(source,/status\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/window\.print\(\)/);
});

test("quotation actions precede long editor panels and do not falsely promise downloaded PDF",()=>{
 const source=read("../public/js/quotation-customizable-page.mjs");
 assert.match(source,/sidebar\.append\(actions,status,basic\.element,itemsSection\.element/);
 assert.match(source,/window\.print\(\)/);
 assert.match(source,/If no dialog appears, open this quotation in Safari or Chrome and use Share \/ Print/);
 assert.doesNotMatch(source,/PDF (?:has been|was) downloaded/i);
});

test("manager cash review serializes opposite decisions and validates rejection note before sending",()=>{
 const source=read("../public/js/employee-cash-manager.js");
 assert.match(source,/if\(busy\)return;/);
 assert.match(source,/buttons\.forEach\(button=>\{button\.disabled=true\}\)/);
 assert.match(source,/decision!=="approve"&&reviewNote\.length<5/);
 assert.match(source,/await decide\(path,decision,reviewNote\)/);
 assert.match(source,/Cash review recorded, but the list did not refresh/);
 assert.match(source,/Cash issued was recorded, but the list did not refresh/);
});

test("employee cash submissions cannot be represented as failed writes solely because refresh fails",()=>{
 const source=read("../public/js/employee-cash-portal.js");
 assert.match(source,/Expense submitted, but activity could not reload/);
 assert.match(source,/Cash count submitted, but activity could not reload/);
 assert.match(source,/countForm\.reset\(\);countDate\.value=today\(\)/);
 assert.match(source,/Cash count submitted\. It is now locked for manager review/);
});

test("mobile quotation print does not require matchMedia support in embedded browsers",()=>{
 const source=read("../public/js/quotation-customizable-page.mjs");
 assert.match(source,/typeof window\.matchMedia==="function"/);
 assert.match(source,/typeof window\.innerWidth==="number"/);
 assert.match(source,/if\(wideScreen &&/);
 assert.match(source,/window\.print\(\)/);
});
