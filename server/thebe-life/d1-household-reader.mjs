/**
 * Thebe Life / D1: deliberately READ-ONLY, tenant-scoped household ledger.
 *
 * Callers MUST supply userId from verified server-side session identity;
 * never from a request body, query parameter or client-side entitlement flag.
 * No mutations, no secret access and no shared Workspace-company tenancy.
 */
const ID_RE=/^[a-zA-Z0-9_-]{1,80}$/;
function id(value,name) {
  if(typeof value!=='string'||!ID_RE.test(value))throw new TypeError('invalid_'+name);
  return value;
}
function integer(value,name){
  if(!Number.isSafeInteger(value)||value<0)throw new TypeError('invalid_'+name);
  return value;
}
function requireD1(db) {
  if(!db||typeof db.prepare!=='function')throw new TypeError('d1_database_required');
  return db;
}
async function memberRow(db,householdId,userId){
  const statement=db.prepare(
    "SELECT role FROM life_household_members WHERE household_id = ?1 AND user_id = ?2 AND status = 'active' LIMIT 1"
  );
  return statement.bind(householdId,userId).first();
}
export async function readHouseholdEntries({db,householdId,userId,limit=50}={}){
  requireD1(db);id(householdId,'household_id');id(userId,'session_user_id');
  integer(limit,'limit');
  if(limit<1||limit>100)return Object.freeze({ok:false,reason:'limit_out_of_bounds'});
  const member=await memberRow(db,householdId,userId);
  if(!member||!['owner','adult','viewer'].includes(member.role))return Object.freeze({ok:false,reason:'not_authorized'});
  const result=await db.prepare(
    "SELECT id, type, category, amount_minor, currency, occurred_on, transfer_id FROM life_household_entries WHERE household_id = ?1 ORDER BY occurred_on DESC, id DESC LIMIT ?2"
  ).bind(householdId,limit).all();
  if(!result||!Array.isArray(result.results))throw new Error('invalid_d1_response');
  const entries=result.results.map(row=>{
    if(!row||typeof row.id!=='string'||!['income','expense','commitment','transfer_in','transfer_out'].includes(row.type)||
       !Number.isSafeInteger(row.amount_minor)||row.amount_minor<0||row.currency!=='BWP')throw new Error('invalid_ledger_row');
    return Object.freeze({
      id:row.id,type:row.type,category:String(row.category??''),
      amountMinor:row.amount_minor,currency:'BWP',occurredOn:String(row.occurred_on??''),
      transferId:row.transfer_id??null
    });
  });
  return Object.freeze({ok:true,householdId,entries:Object.freeze(entries),truncated:entries.length===limit});
}
export async function readHouseholdMembership({db,householdId,userId}={}){
  requireD1(db);id(householdId,'household_id');id(userId,'session_user_id');
  const row=await memberRow(db,householdId,userId);
  return Object.freeze({authorized:!!row&&['owner','adult','viewer'].includes(row.role),
    role:row&&['owner','adult','viewer'].includes(row.role)?row.role:null});
}
