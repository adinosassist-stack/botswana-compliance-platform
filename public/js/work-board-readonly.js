/** Read-only Work board projection. Caller must supply authorized tenant-scoped tasks.
 * No network, persistence, approvals, dispatch, or status transitions.
 */
export const WORK_STAGES = Object.freeze(['assigned','in_progress','submitted','completed']);
export function buildWorkBoard({tasks, tenantId, today} = {}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('invalid_tenant');
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today+'T00:00:00Z')) || new Date(today+'T00:00:00Z').toISOString().slice(0,10)!==today) throw new TypeError('invalid_today');
  if (!Array.isArray(tasks) || tasks.length > 10000) throw new TypeError('invalid_tasks');
  const lanes = Object.fromEntries(WORK_STAGES.map(s=>[s,[]]));
  const seen = new Set();
  for (const t of tasks) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new TypeError('invalid_task');
    if (t.tenantId !== tenantId) throw new TypeError('cross_tenant_task');
    if (typeof t.id !== 'string' || !t.id.trim() || seen.has(t.id)) throw new TypeError('invalid_task_id');
    seen.add(t.id);
    if (!WORK_STAGES.includes(t.status)) throw new TypeError('invalid_status');
    const due = t.dueDate == null ? null : t.dueDate;
    if (due !== null && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due+'T00:00:00Z')) || new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due)) throw new TypeError('invalid_due_date');
    lanes[t.status].push(Object.freeze({
      id:t.id, title:String(t.title||'Untitled task').slice(0,200),
      status:t.status, dueDate:due,
      overdue: t.status!=='completed' && due!==null && due<today
    }));
  }
  for (const stage of WORK_STAGES) Object.freeze(lanes[stage]);
  const counts = Object.freeze(Object.fromEntries(WORK_STAGES.map(s=>[s,lanes[s].length])));
  return Object.freeze({previewOnly:true,tenantId,today,counts,overdue:Object.values(lanes).flat().filter(t=>t.overdue).length,lanes:Object.freeze(lanes)});
}
