import {buildWorkBoard} from './work-board-readonly.js';

/** Converts an authenticated manager task response to the read-only board.
 * tenantId must come from trusted session context, never the browser or API row.
 * Fail closed on malformed records; never infer tenant from user-supplied fields.
 */
export function managerTasksToWorkBoard({response, tenantId, today}={}) {
  if (!response || !Array.isArray(response.items)) throw new TypeError('invalid_task_response');
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('invalid_tenant');
  const tasks=response.items.map(row=>{
    if (!row || typeof row!=='object' || Array.isArray(row)) throw new TypeError('invalid_task');
    if (typeof row.id!=='string' || !row.id.trim()) throw new TypeError('invalid_task_id');
    if (typeof row.title!=='string' || !row.title.trim()) throw new TypeError('invalid_title');
    if (row.tenant_id!=null && row.tenant_id!==tenantId) throw new TypeError('cross_tenant_task');
    return {id:row.id,title:row.title,status:row.status,dueDate:row.due_date??null,tenantId};
  });
  return buildWorkBoard({tasks,tenantId,today});
}
