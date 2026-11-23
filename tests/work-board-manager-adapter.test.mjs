import test from 'node:test';
import assert from 'node:assert/strict';
import {managerTasksToWorkBoard} from '../public/js/work-board-manager-adapter.js';

const ctx={tenantId:'tenant-a',today:'2026-11-11'};
test('adapts existing manager API snake_case task fields',()=>{
 const board=managerTasksToWorkBoard({...ctx,response:{items:[
  {id:'a',title:'Install memorial',status:'assigned',due_date:'2026-11-10'},
  {id:'b',title:'Review report',status:'submitted',due_date:null}
 ]}});
 assert.equal(board.counts.assigned,1);
 assert.equal(board.counts.submitted,1);
 assert.equal(board.overdue,1);
 assert.equal(board.lanes.assigned[0].title,'Install memorial');
});
test('rejects missing task payload, cross tenant and invalid states',()=>{
 assert.throws(()=>managerTasksToWorkBoard({...ctx,response:{}}),/invalid_task_response/);
 assert.throws(()=>managerTasksToWorkBoard({...ctx,response:{items:[{id:'a',title:'X',status:'assigned',tenant_id:'tenant-b'}]}}),/cross_tenant_task/);
 assert.throws(()=>managerTasksToWorkBoard({...ctx,response:{items:[{id:'a',title:'X',status:'unknown'}]}}),/invalid_status/);
 assert.throws(()=>managerTasksToWorkBoard({...ctx,response:{items:[{id:'a',title:'',status:'assigned'}]}}),/invalid_title/);
});
