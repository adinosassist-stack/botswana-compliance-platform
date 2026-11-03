import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../docs/rehearsals/conversation-storage-schema.sql',import.meta.url),'utf8');
for(const required of ['PRIMARY KEY(tenant_id,id)','FOREIGN KEY(tenant_id,conversation_id)','UNIQUE(tenant_id,conversation_id,idempotency_key)',"source_kind IN ('typed','voice_final','assistant')","role='assistant' AND source_kind='assistant'"]){
  assert(sql.includes(required),`Required conversation isolation constraint missing: ${required}`);
}
assert(!/\b(raw_audio|audio_blob|provider_token|password|secret_key)\b/i.test(sql),'schema must not persist raw audio or provider credentials');
assert(!/CREATE TRIGGER/i.test(sql),'schema rehearsal must not trigger production effects');
console.log('Conversation schema rehearsal structural guard PASS');
