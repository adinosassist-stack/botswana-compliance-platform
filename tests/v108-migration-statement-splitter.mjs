import assert from "node:assert/strict";
import fs from "node:fs";
import {splitSqliteMigrationStatements} from "../scripts/sqlite-migration-statements.mjs";

const sql=fs.readFileSync("cloudflare/migrations/049_v108_finance_receivables.sql","utf8");
const statements=splitSqliteMigrationStatements(sql);
assert.equal(statements.length,13,"migration 049 must remain 13 reviewed top-level statements");

const tables=statements.filter(s=>/^\s*(?:--[^\n]*\n\s*)*CREATE TABLE\b/i.test(s));
const indexes=statements.filter(s=>/^\s*(?:--[^\n]*\n\s*)*CREATE INDEX\b/i.test(s));
const triggers=statements.filter(s=>/^\s*(?:--[^\n]*\n\s*)*CREATE TRIGGER\b/i.test(s));

assert.equal(tables.length,3);
assert.equal(indexes.length,5);
assert.equal(triggers.length,5);

for(const trigger of triggers){
  assert.match(trigger,/\bBEGIN\b/i);
  assert.match(trigger,/\bEND;\s*$/i);
}
assert.match(triggers.find(s=>s.includes("finance_invoice_allocations_apply_guard"))||"",/finance_invoice_overallocation[\s\S]*finance_transaction_overallocation/);
assert.ok(triggers.every(trigger=>!trigger.includes("SELECT CASE")),"D1 trigger statements must not contain unparenthesized CASE");
assert.equal(triggers.reduce((count,trigger)=>count+(trigger.match(/SELECT \\(CASE/g)||[]).length,0),6);
assert.match(triggers.find(s=>s.includes("finance_invoice_allocations_reverse_guard"))||"",/CASE[\s\S]*END;[\s\S]*END;\s*$/i);

const fixture=`
CREATE TABLE x(id INTEGER);
CREATE TRIGGER t BEFORE INSERT ON x
BEGIN
  SELECT CASE WHEN NEW.id<0 THEN RAISE(ABORT,'bad;value') END;
END;
CREATE INDEX x_idx ON x(id);
`;
const parsed=splitSqliteMigrationStatements(fixture);
assert.equal(parsed.length,3);
assert.match(parsed[1],/bad;value/);
assert.match(parsed[1],/END;\s*$/);

console.log("V108 migration statement splitter preserves complete trigger bodies: PASS");
