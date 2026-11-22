import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('default-off asset register does not imply a failed load is an empty register',()=>{
 const ui=read('../public/js/thebe-assets-register.js');
 assert.match(ui,/tenantAuthorized!==true/);
 assert.match(ui,/role','status'/);
 assert.match(ui,/aria-live','polite'/);
 assert.match(ui,/No records were loaded or changed/);
 assert.match(ui,/Select Refresh to retry/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});

test('quotation logo preview communicates unsaved status and honest download outcome',()=>{
 const ui=read('../public/js/quotation-logo-editor.mjs');
 assert.match(ui,/Preview only until the authenticated Save company logo operation succeeds/);
 assert.match(ui,/Preview only — changes are not saved/);
 assert.match(ui,/PDF download requested\. Check your browser downloads/);
 assert.match(ui,/Reload to verify persistence/);
 assert.match(ui,/typeof options\.onSave==='function'/);
});

test('mobile reminder control stays keyboard accessible and short viewport scrollable',()=>{
 const css=read('../public/assets/delivery-reminder-notifications.css');
 assert.match(css,/\.thebe-delivery-manager-bell:focus-visible/);
 assert.match(css,/@media\(max-width:620px\) and \(max-height:360px\)/);
 assert.match(css,/bottom:calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\)/);
 assert.match(css,/min-height:0;overflow:auto/);
 assert.match(css,/body\.thebe-ai-mobile-open \.thebe-delivery-manager-bell/);
});
