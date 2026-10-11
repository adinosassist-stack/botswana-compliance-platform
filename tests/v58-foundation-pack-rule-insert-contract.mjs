import fs from 'node:fs';
import assert from 'node:assert/strict';

const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const marker='INSERT INTO regulatory_rules(id,rule_key,version,title,summary,applicability_json,action_json,source_ids_json,effective_from,effective_to,status,confidence,created_by_user_id,definition_hash,supersedes_rule_id) ';
const bad=marker+"VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)";
const good=marker+"VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)";

assert.equal(worker.split(bad).length-1,0,'regulatory rule INSERT still contains five placeholders after the draft status literal');
assert.equal(worker.split(good).length-1,2,'both governed regulatory rule creation paths must bind exactly four values after the draft status literal');

let offset=0;
for(let index=0;index<2;index+=1){
  const start=worker.indexOf(marker,offset);
  assert.ok(start>=0,`regulatory_rules INSERT #${index+1} is missing`);
  const end=worker.indexOf('.run();',start);
  assert.ok(end>start,`regulatory_rules INSERT #${index+1} execution boundary is missing`);
  const statement=worker.slice(start,end);
  assert.equal((statement.match(/\?/g)||[]).length,14,`regulatory rule INSERT #${index+1} must bind 14 values for 15 columns with status supplied as a literal`);
  offset=end+7;
}

console.log('PASS both governed regulatory rule INSERT placeholder contracts');
