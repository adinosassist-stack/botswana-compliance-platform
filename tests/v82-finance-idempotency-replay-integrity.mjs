import assert from 'node:assert/strict';
import fs from 'node:fs';
import {__financeTest} from '../cloudflare/src/finance-core.js';

assert.equal(__financeTest.sameFingerprintSet(['b','a'],['a','b']),true,'fingerprint set comparison is order-independent');
assert.equal(__financeTest.sameFingerprintSet(['a','a','b'],['a','b']),true,'fingerprint set comparison tolerates database dedupe of identical source fingerprints');
assert.equal(__financeTest.sameFingerprintSet(['a','b'],['a','c']),false,'different financial fingerprints conflict');
assert.equal(__financeTest.sameFingerprintSet([],['a']),false,'missing stored fingerprints conflict');

const finance=fs.readFileSync('cloudflare/src/finance-core.js','utf8');
assert.match(finance,/async function verifyExistingImportRequest\(/,'finance core has an exact replay verifier');
assert.match(finance,/existing\.account_id/,'replay verifier binds the account');
assert.match(finance,/existing\.source_type/,'replay verifier binds the source type');
assert.match(finance,/existing\.provider/,'replay verifier binds the provider');
assert.match(finance,/existing\.row_count/,'replay verifier binds the declared row count');
assert.match(finance,/SELECT source_fingerprint FROM finance_transactions WHERE tenant_id=\? AND import_batch_id=\?/,'replay verifier reads the immutable stored transaction fingerprints');
assert.ok((finance.match(/verifyExistingImportRequest\(/g)||[]).length>=3,'both normal replay and unique-race replay use the exact request verifier');
assert.ok((finance.match(/idempotency_key_conflict/g)||[]).length>=2,'payload mismatch fails closed in both replay paths');
assert.ok(finance.indexOf('const normalized=[]')<finance.indexOf('const existing=await env.DB.prepare("SELECT id,account_id,source_type,provider,row_count'),'request rows are normalized and fingerprinted before replay acceptance');
assert.match(finance,/expectedFingerprints\.push\(await sha256Hex/,'current request fingerprints are computed before replay');
assert.match(finance,/fingerprint:expectedFingerprints\[index\]/,'new batch persistence uses the exact fingerprints that replay verification binds');

console.log('V82 finance idempotency replay integrity PASS');
