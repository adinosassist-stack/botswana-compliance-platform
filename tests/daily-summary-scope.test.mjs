import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=readFileSync(new URL('../public/js/workspace-runtime-20261001b.js',import.meta.url),'utf8');
const selection=source.slice(source.indexOf('function opsLatestSummary('),source.indexOf('\nlet currentOpsSummaryId='));
const context=vm.createContext({});
vm.runInContext(selection,context);
test('a missing branch or company summary never falls back to another scope',()=>{
  const branch={id:'branch-summary',location_id:'maun'};
  assert.equal(context.opsLatestSummary([branch],'gaborone'),null);
  assert.equal(context.opsLatestSummary([branch],''),null);
  assert.equal(context.opsLatestSummary([branch],'maun'),branch);
});
test('both API field formats select the requested scope and newest matching row',()=>{
  const company={id:'company',location_id:null};
  const latest={id:'new',locationId:'maun'};
  assert.equal(context.opsLatestSummary([latest,{id:'old',location_id:'maun'},company],'maun'),latest);
  assert.equal(context.opsLatestSummary([latest,company],null),company);
});
