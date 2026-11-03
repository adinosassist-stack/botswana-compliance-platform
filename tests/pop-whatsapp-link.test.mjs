import test from 'node:test';
import assert from 'node:assert/strict';
import {popWhatsAppLink} from '../public/js/pop-whatsapp-link.mjs';
const orderId='11111111-1111-4111-8111-111111111111';
test('POP WhatsApp link is opt-in and requires a configured destination and order',()=>{
 assert.equal(popWhatsAppLink({phone:'',orderId}),null);
 assert.equal(popWhatsAppLink({phone:'26771234567',orderId:'wrong'}),null);
 const link=popWhatsAppLink({phone:'+267 71 234 567',orderId});
 assert.match(link,/^https:\/\/wa\.me\/26771234567\?text=/);
 const text=new URL(link).searchParams.get('text');
 assert.match(text,/not proof of cleared funds/i);
 assert.match(text,/company bank account/);
 assert.ok(!text.includes('customerEmail'));
});
test('rejects malicious numbers and identifiers',()=>{
 for(const phone of ['javascript:alert(1)','26712345?text=approve','00000000000'])
  assert.equal(popWhatsAppLink({phone,orderId}),null);
});
