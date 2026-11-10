/**
 * Thebe Life family budget: read-only monthly totals, never a bank balance.
 * Identity MUST come from a verified server-side session.
 * NOT mounted on any public Worker route.
 */
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const TYPES=Object.freeze(['income','expense','commitment']);
const MAX_MINOR=Number.MAX_SAFE_INTEGER;
function assertId(value,label){
  if(typeof value!=='string'||!ID.test(value))throw new TypeError('invalid_'+label);
}
function assertMonth(month){
  if(typeof month!=='string'||!MONTH.test(month))throw new TypeError('invalid_month');
  const year=Number(month.slice(0,4));
  if(year<2000||year>9998)throw new TypeError('invalid_month');
}
function nextMonth(month){
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  return m===12?String(y+1).padStart(4,'0')+'-01':String(y).padStart(4,'0')+'-'+String(m+1).padStart(2,'0');
}
function readTotal(row,key){
  const value=row?.[key];
  if(!Number.isSafeInteger(value)||value<0||value>MAX_MINOR)throw new Error('invalid_family_budget_total_'+key);
  return value;
}
export async function readFamilyBudgetSummary({db,householdId,sessionUserId,month}={}){
  if(!db||typeof db.prepare!=='function')throw new TypeError('d1_database_required');
  assertId(householdId,'household_id');
  assertId(sessionUserId,'session_user_id');
  assertMonth(month);
  // Both the data and its authorization are evaluated in the same SQL statement;
  // revoked or unrelated household members cannot retrieve aggregates.
  const sql=`SELECT
   COALESCE(SUM(CASE WHEN e.type='income' THEN e.amount_minor ELSE 0 END),0) AS income_minor,
   COALESCE(SUM(CASE WHEN e.type='expense' THEN e.amount_minor ELSE 0 END),0) AS expense_minor,
   COALESCE(SUM(CASE WHEN e.type='commitment' THEN e.amount_minor ELSE 0 END),0) AS commitment_minor,
   COUNT(e.id) AS entry_count
   FROM life_household_members m
   LEFT JOIN life_household_entries e
     ON e.household_id=m.household_id
    AND e.occurred_on >= ?3 AND e.occurred_on < ?4
    AND e.type IN ('income','expense','commitment')
   WHERE m.household_id=?1 AND m.user_id=?2
     AND m.status='active' AND m.role IN ('owner','adult','viewer')
   GROUP BY m.household_id`;
  const row=await db.prepare(sql).bind(householdId,sessionUserId,month+'-01',nextMonth(month)+'-01').first();
  if(!row)return Object.freeze({ok:false,reason:'not_authorized'});
  const incomeMinor=readTotal(row,'income_minor');
  const expenseMinor=readTotal(row,'expense_minor');
  const commitmentMinor=readTotal(row,'commitment_minor');
  const entryCount=readTotal(row,'entry_count');
  // Avoid precision loss when summing large ledger entries.
  const remaining=BigInt(incomeMinor)-BigInt(expenseMinor)-BigInt(commitmentMinor);
  if(remaining>BigInt(MAX_MINOR)||remaining< -BigInt(MAX_MINOR))throw new Error('family_budget_balance_out_of_range');
  return Object.freeze({ok:true,householdId,month,currency:'BWP',
    incomeMinor,expenseMinor,commitmentMinor,remainingMinor:Number(remaining),
    entryCount,bankVerified:false});
}
