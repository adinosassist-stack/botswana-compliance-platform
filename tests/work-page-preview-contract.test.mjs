import test from 'node:test';
import assert from 'node:assert/strict';
import { previewJobCosting } from '../server/project-job-costing-preview.js';
import { previewEmployeeRoutines } from '../server/employee-routines-preview.js';

test('Work job costing reports accurate BWP totals without writes', () => {
  const result = previewJobCosting({
    tenantId: 'tenant-a', projectId: 'job-1', revenueThebe: 1500000,
    materials: [{ costThebe: 450000 }],
    labour: [{ costThebe: 150000 }],
    subcontractors: [{ costThebe: 100000 }],
    otherCosts: [{ costThebe: 50000 }]
  });
  assert.equal(result.totalCostThebe, 750000);
  assert.equal(result.profitThebe, 750000);
  assert.equal(result.marginPercent, 50);
  assert.equal(result.previewOnly, true);
  assert.equal(Object.isFrozen(result), true);
});

test('Work job costing rejects malformed or overflowing costs', () => {
  const base = { tenantId: 'tenant-a', projectId: 'job-1', revenueThebe: 100 };
  assert.throws(() => previewJobCosting({ ...base, materials: [{ costThebe: -1 }] }));
  assert.throws(() => previewJobCosting({ ...base, materials: [{ costThebe: 1.5 }] }));
  assert.throws(() => previewJobCosting({ ...base, materials: [{ costThebe: Number.MAX_SAFE_INTEGER }, { costThebe: 1 }] }));
});

test('Work employee routines exclude other tenants and inactive employees', () => {
  const result = previewEmployeeRoutines({
    tenantId: 'tenant-a', today: '2026-11-11',
    employees: [
      { id: 'a', tenantId: 'tenant-a', active: true, contractEndDate: '2026-11-15' },
      { id: 'b', tenantId: 'tenant-b', active: true, contractEndDate: '2026-11-15' },
      { id: 'c', tenantId: 'tenant-a', active: false, contractEndDate: '2026-11-15' }
    ]
  });
  assert.equal(result.generatedCount, 1);
  assert.equal(result.tasks[0].employeeId, 'a');
  assert.equal(result.tasks[0].status, 'proposed');
  assert.equal(result.tasks[0].requiresHumanReview, true);
  assert.equal(result.previewOnly, true);
});

test('Work employee routines reject invalid dates and tenant input', () => {
  assert.throws(() => previewEmployeeRoutines({ tenantId: '', today: '2026-11-11', employees: [] }));
  assert.throws(() => previewEmployeeRoutines({ tenantId: 'tenant-a', today: '2026-02-30', employees: [] }));
});
