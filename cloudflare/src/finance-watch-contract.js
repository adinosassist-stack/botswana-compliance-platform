export const FINANCE_WATCH_READ_ACTIONS=Object.freeze([
  "financial_position.read",
  "finance_data_quality.read",
  "finance_daily_inflows.read",
  "receivables_summary.read"
]);

const FINANCE_WATCH_READ_SET=new Set(FINANCE_WATCH_READ_ACTIONS);

export function isFinanceWatchToolList(value){
  return Array.isArray(value)&&value.length>0&&value.every(actionKey=>typeof actionKey==="string"&&FINANCE_WATCH_READ_SET.has(actionKey));
}

export function buildFinanceWatchDueQuery(limit=25){
  const cap=Math.max(1,Math.min(50,Number(limit)||25));
  const placeholders=FINANCE_WATCH_READ_ACTIONS.map(()=>"?").join(",");
  const safeToolsJson="CASE WHEN json_valid(agent_persistent_tasks.allowed_tools_json) THEN agent_persistent_tasks.allowed_tools_json ELSE '[]' END";
  return Object.freeze({
    sql:`SELECT id,tenant_id,status,objective,trigger_spec_json,allowed_tools_json,budget_json,next_run_at
      FROM agent_persistent_tasks
      WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NOT NULL AND next_run_at<=CURRENT_TIMESTAMP
        AND json_array_length(${safeToolsJson})>0
        AND NOT EXISTS (
          SELECT 1 FROM json_each(${safeToolsJson})
          WHERE type<>'text' OR value NOT IN (${placeholders})
        )
      ORDER BY next_run_at,id LIMIT ?`,
    bindings:Object.freeze([...FINANCE_WATCH_READ_ACTIONS,cap])
  });
}
