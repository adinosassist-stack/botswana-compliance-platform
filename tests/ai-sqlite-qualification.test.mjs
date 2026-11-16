import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";

// Ensure the real SQLite tests are part of the existing Node test discovery.
// Fail closed if Python/sqlite3 is missing rather than silently skipping.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
for(const suite of ["ai_budget_sqlite_test.py","ai_reconciliation_sqlite_test.py"]){
 test(`SQLite schema qualification: ${suite}`,()=>{
  const result=spawnSync("python3",["-m","unittest","discover","-s","tests","-p",suite],{
   cwd:root,encoding:"utf8",timeout:30000
  });
  assert.equal(result.error,undefined,String(result.error||""));
  assert.equal(result.status,0,`SQLite qualification failed:\n${result.stdout}\n${result.stderr}`);
 });
}
