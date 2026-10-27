import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('checkout POP contact is optional and validates WhatsApp number before exposing it',()=>{
 const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
 const start=worker.indexOf('if(url.pathname==="/api/payments/subscription-checkout"');
 const end=worker.indexOf('if(url.pathname==="/api/payments/manual-bank/config"',start);
 const route=worker.slice(start,end);
 assert.match(route,/THEBE_POP_WHATSAPP_NUMBER/);
 assert.match(route,/\^\[1-9\]\[0-9\]\{7,14\}\$/);
 assert.match(route,/popWhatsappNumber:null|popPhone\)\?popPhone:null/);
 assert.match(route,/bankTransfer:\{\.\.\.bank[^}]*popWhatsappNumber\}/);
});
test('customer checkout shows POP WhatsApp option only for configured contact',()=>{
 const runtime=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
 const segment=runtime.slice(runtime.indexOf('async function requestPlan(plan)'),runtime.indexOf('let turnstileWidgetId='));
 assert.match(segment,/b\.popWhatsappNumber\?/);
 assert.match(segment,/wa\.me\/\$\{b\.popWhatsappNumber\}/);
 assert.match(segment,/verify cleared funds/i);
 assert.match(segment,/rel="noopener noreferrer"/);
});
