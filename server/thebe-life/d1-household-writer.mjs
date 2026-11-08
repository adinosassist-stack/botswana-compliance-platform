/**
 * Thebe Life household entry writer — NOT connected to a live HTTP route.
 * User identity MUST originate from server-verified authentication, never a form.
 * Authorization is checked atomically in the INSERT ... SELECT statement,
 * not solely in an earlier membership read. No direct money movement.
 */
const RE = /^[a-zA-Z0-9_-]{1,80}$/;
const ENTRY_TYPES=new Set(['income','expense','commitment','transfer_in','transfer_out']);
function id(value,field){if(typeof value!=='string'||!RE.test(value))throw new TypeError('invalid_'+field);return value;}
function amount(value){if(!Number.isSafeInteger(value)||value<1||value>9007199254740991)throw new TypeError('invalid_amount_minor');return value;}
function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new TypeError('invalid_date');
  return value;
}
function category(value){if(typeof value!=='string'||!value.trim()||value.length>80)return (()=>{throw new TypeError('invalid_category');})();return value.trim();}
export function prepareHouseholdEntry({householdId,entry,sessionUserId}={}){
  id(householdId,'household_id');id(sessionUserId,'session_user_id');
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new TypeError('invalid_entry');
  id(entry.id,'entry_id');if(!ENTRY_TYPES.has(entry.type))throw new TypeError('invalid_entry_type');
  amount(entry.amountMinor);date(entry.occurredOn);category(entry.category);
  if(entry.currency!=='BWP')throw new TypeError('invalid_currency');
  const transfer=entry.type==='transfer_in'||entry.type==='transfer_out';
  if(transfer)id(entry.transferId,'transfer_id');
  else if(entry.transferId!==undefined&&entry.transferId!==null)throw new TypeError('transfer_id_not_applicable');
  return Object.freeze({
    householdId,sessionUserId,entryId:entry.id,type:entry.type,amountMinor:entry.amountMinor,
    category:entry.category.trim(),currency:'BWP',occurredOn:entry.occurredOn,transferId:transfer?entry.transferId:null
  });
}
export async function recordHouseholdEntry({db,householdId,entry,sessionUserId}={}){
  if(!db||typeof db.prepare!=='function')throw new TypeError('invalid_database');
  const e=prepareHouseholdEntry({householdId,entry,sessionUserId});
  // An INSERT is only authorized if an ACTIVE member is owner/adult at write time.
  // D1 uniqueness of (household_id,id) rejects replayed client entry IDs.
  const sql=`INSERT INTO life_household_entries
      (household_id,id,type,category,amount_minor,currency,occurred_on,transfer_id,created_by)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9
      WHERE EXISTS (
        SELECT 1 FROM life_household_members
        WHERE household_id = ?1 AND user_id = ?9
        AND status = 'active' AND role IN ('owner','adult')
      )
      ON CONFLICT(household_id,id) DO NOTHING`;
  const result=await db.prepare(sql).bind(e.householdId,e.entryId,e.type,e.category,e.amountMinor,e.currency,e.occurredOn,e.transferId,e.sessionUserId).run();
  const changes=result?.meta?.changes;
  if(changes===1)return Object.freeze({created:true,reason:'recorded_not_bank_verified'});
  if(changes===0)return Object.freeze({created:false,reason:'not_authorized_or_duplicate'});
  throw new Error('invalid_d1_write_receipt');
}
