import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStatusChange, validateTransfer, validateMaintenance, expiryState} from '../server/corporate-assets-domain.mjs';
test('valid status transition requires reason', () => {
  assert.equal(validateStatusChange('Active','In Maintenance','Routine service').to, 'In Maintenance');
  assert.throws(() => validateStatusChange('Written Off','Active','Undo'), /invalid_status_transition/);
  assert.throws(() => validateStatusChange('Active','Written Off',' '), /invalid_reason/);
});
test('branch transfer validates dates and distinct branches', () => {
  assert.equal(validateTransfer({fromBranch:'Gaborone',toBranch:'Palapye',effectiveDate:'2026-11-01',reason:'Relocation'}).toBranch,'Palapye');
  assert.throws(() => validateTransfer({fromBranch:'Gaborone',toBranch:'gaborone',effectiveDate:'2026-11-01',reason:'x'}), /same_branch/);
  assert.throws(() => validateTransfer({fromBranch:'A',toBranch:'B',effectiveDate:'2026-02-30',reason:'x'}), /invalid_date/);
});
test('maintenance validates currency precision and due date', () => {
  assert.equal(validateMaintenance({serviceDate:'2026-11-01',nextDueDate:'2027-01-01',costBwp:123.45,description:'Oil change'}).costBwp,123.45);
  assert.throws(() => validateMaintenance({serviceDate:'2026-11-01',nextDueDate:'2026-10-31',costBwp:10,description:'x'}), /due_before_service/);
  assert.throws(() => validateMaintenance({serviceDate:'2026-11-01',costBwp:0.001,description:'x'}), /invalid_cost/);
});
test('insurance expiry is deterministic at boundaries', () => {
  assert.equal(expiryState('2026-11-01','2026-11-01'),'due');
  assert.equal(expiryState('2026-10-31','2026-11-01'),'expired');
  assert.equal(expiryState('2026-12-02','2026-11-01'),'current');
});
