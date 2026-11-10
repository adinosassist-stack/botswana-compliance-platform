import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkBoard } from '../public/js/work-board-readonly.js';

const task = (id,status,dueDate,tenantId='tenant-a') => ({id,status,dueDate,tenantId,title:'Job '+id});

test('Work board groups tasks and counts overdue without mutating input',()=>{
  const tasks=[task('a','assigned','2026-11-10'),task('b','submitted','2026-11-12'),task('c','completed','2026-11-01')];
  const before=JSON.stringify(tasks);
  const board=buildWorkBoard({tenantId:'tenant-a',today:'2026-11-11',tasks});
  assert.deepEqual(board.counts,{assigned:1,in_progress:0,submitted:1,completed:1});
  assert.equal(board.overdue,1);
  assert.equal(board.lanes.completed[0].overdue,false);
  assert.equal(board.previewOnly,true);
  assert.equal(JSON.stringify(tasks),before);
  assert.equal(Object.isFrozen(board.lanes.assigned),true);
});
test('Work board rejects cross-tenant data, duplicate IDs and invalid states',()=>{
  const base={tenantId:'tenant-a',today:'2026-11-11'};
  assert.throws(()=>buildWorkBoard({...base,tasks:[task('a','assigned',null,'tenant-b')]}),/cross_tenant_task/);
  assert.throws(()=>buildWorkBoard({...base,tasks:[task('a','assigned',null),task('a','completed',null)]}),/invalid_task_id/);
  assert.throws(()=>buildWorkBoard({...base,tasks:[task('a','approved',null)]}),/invalid_status/);
  assert.throws(()=>buildWorkBoard({...base,tasks:[task('a','assigned','2026-02-30')]}),/invalid_due_date/);
});
