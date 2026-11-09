/**
 * Private, read-only household membership roster.
 * Only an active owner can see the roster. Neither invite delivery nor
 * membership mutation is implemented in this module.
 * sessionUserId MUST come from a verified server-side session.
 */
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function validId(v,name){if(typeof v!=='string'||!ID.test(v))throw new TypeError('invalid_'+name);}
const ROLES=new Set(['owner','adult','viewer']);
const STATUSES=new Set(['invited','active','revoked']);
export async function readFamilyMembers({db,householdId,sessionUserId}={}){
  if(!db||typeof db.prepare!=='function')throw new TypeError('d1_database_required');
  validId(householdId,'household_id');validId(sessionUserId,'session_user_id');
  // The owner predicate is in the same query as the roster; revoked owners
  // cannot obtain a roster through a stale preauthorization check.
  const sql=`SELECT m.user_id,m.role,m.status FROM life_household_members m
  WHERE m.household_id=?1 AND EXISTS (
    SELECT 1 FROM life_household_members requester
    WHERE requester.household_id=m.household_id AND requester.user_id=?2
      AND requester.role='owner' AND requester.status='active'
  ) ORDER BY m.user_id LIMIT 101`;
  const rows=await db.prepare(sql).bind(householdId,sessionUserId).all();
  if(!rows||!Array.isArray(rows.results))throw new Error('invalid_d1_response');
  // An empty result is deliberately indistinguishable from nonexistent household.
  if(rows.results.length===0)return Object.freeze({ok:false,reason:'not_authorized_or_empty'});
  if(rows.results.length>100)throw new Error('roster_limit_exceeded');
  const members=rows.results.map(r=>{
    if(!r||typeof r.user_id!=='string'||!ID.test(r.user_id)||!ROLES.has(r.role)||!STATUSES.has(r.status))
      throw new Error('invalid_member_row');
    return Object.freeze({userId:r.user_id,role:r.role,status:r.status});
  });
  // Even when a compromised/misconfigured DB accidentally returns rows from an
  // unauthorized roster query, fail closed unless the owner is in the returned set.
  if(!members.some(m=>m.userId===sessionUserId&&m.role==='owner'&&m.status==='active'))
    return Object.freeze({ok:false,reason:'not_authorized_or_empty'});
  return Object.freeze({ok:true,householdId,members:Object.freeze(members)});
}
