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
