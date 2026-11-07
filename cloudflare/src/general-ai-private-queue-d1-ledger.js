/** Review-only, UNMOUNTED isolated D1 one-time claim adapter.
 * Do not use with a production/customer database. No create-schema or delete path.
 * The caller's separately approved runner must verify the actual D1 binding ID.
 */
const NS = 'bw-general-ai-private-acceptance-queue';
const SHA = /^[a-f0-9]{40}$/;
const NONCE = /^[a-f0-9]{32}$/;
const fail = code => { throw Error(code) };
const toHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');

export function createPrivateAiD1NonceLedger({db, schemaQualified=false}={}) {
  if(!schemaQualified)fail('ai_nonce_schema_qualification_required');
  if(typeof db?.prepare!=='function')fail('ai_nonce_d1_binding_required');
  return Object.freeze({
    async claimOnce({namespace,sourceSha,nonce}={}) {
      if(namespace!==NS || !SHA.test(sourceSha||'') || !NONCE.test(nonce||''))fail('ai_nonce_invalid_scope');
      // Store only a digest, not the caller-supplied nonce or other credentials.
      const digest=toHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(namespace+'\n'+sourceSha+'\n'+nonce)));
      const stmt=db.prepare('INSERT OR IGNORE INTO ai_private_queue_nonce_claims (claim_hash,source_sha) VALUES (?,?)');
      if(typeof stmt?.bind!=='function')fail('ai_nonce_parameterization_required');
      const bound=stmt.bind(digest,sourceSha);
      if(typeof bound?.run!=='function')fail('ai_nonce_insert_unavailable');
      const result=await bound.run();
      // No unknown metadata accepted; never guess if a claim succeeded.
      if(result?.success!==true || !Number.isSafeInteger(result?.meta?.changes) || ![0,1].includes(result.meta.changes))fail('ai_nonce_write_unverified');
      return result.meta.changes===1;
    }
  });
}
