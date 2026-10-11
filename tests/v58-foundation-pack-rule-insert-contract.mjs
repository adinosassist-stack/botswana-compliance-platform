import fs from 'node:fs';
import assert from 'node:assert/strict';

const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const bad="VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)";
const good="VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)";

assert.equal(worker.includes(bad),false,'foundation-pack rule INSERT still contains five placeholders after the draft status literal');
assert.equal(worker.includes(good),true,'foundation-pack rule INSERT must contain exactly four placeholders after the draft status literal');

const marker='INSERT INTO regulatory_rules(id,rule_key,version,title,summary,applicability_json,action_json,source_ids_json,effective_from,effective_to,status,confidence,created_by_user_id,definition_hash,supersedes_rule_id)';
const start=worker.indexOf(marker);
assert.ok(start>=0,'foundation-pack regulatory_rules INSERT marker is missing');
const end=worker.indexOf('.run();',start);
assert.ok(end>start,'foundation-pack regulatory_rules INSERT execution boundary is missing');
const statement=worker.slice(start,end);
assert.equal((statement.match(/\?/g)||[]).length,14,'foundation-pack rule INSERT must bind 14 values for 15 columns with status supplied as a literal');

console.log('PASS foundation-pack regulatory rule INSERT placeholder contract');
