/**
 * Read-only, membership-scoped Motshelo contribution history.
 * sessionUserId MUST be taken from verified server authentication.
 * These records are not bank statements and never authorize a payout.
 * No live HTTP routes import this module.
 */
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function validId(value,label) {
  if(typeof value!=='string'||!ID.test(value))throw new TypeError('invalid_'+label);
}
export async function readMotsheloContributions({db,groupId,sessionUserId,limit=50}={}) {
  if(!db||typeof db.prepare!=='function')throw new TypeError('d1_database_required');
  validId(groupId,'group_id');
  validId(sessionUserId,'session_user_id');
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RangeError('invalid_limit');
  // The authorization predicate is inside the data SELECT so revoked users
  // cannot retrieve entries after a separate prior membership check.
  const sql=`SELECT c.id,c.member_user_id,c.due_on,c.reported_minor,c.matched_minor,c.cleared_minor,c.currency
    FROM life_motshelo_contributions c
    WHERE c.group_id=?1
      AND EXISTS (SELECT 1 FROM life_motshelo_members m
        WHERE m.group_id=c.group_id AND m.user_id=?2 AND m.status='active'
          AND m.role IN ('chair','treasurer','secretary','member','auditor'))
    ORDER BY c.due_on DESC,c.id DESC LIMIT ?3`;
  const response=await db.prepare(sql).bind(groupId,sessionUserId,limit).all();
  if(!response||!Array.isArray(response.results))throw new Error('invalid_d1_response');
  const records=response.results.map(row=>{
    if(!row||typeof row.id!=='string'||!ID.test(row.id)||
      typeof row.member_user_id!=='string'||!ID.test(row.member_user_id)||
      typeof row.due_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.due_on)||
      row.currency!=='BWP'||![row.reported_minor,row.matched_minor,row.cleared_minor].every(v=>Number.isSafeInteger(v)&&v>=0)||
      row.cleared_minor>row.matched_minor||row.matched_minor>row.reported_minor)
      throw new Error('invalid_contribution_row');
    return Object.freeze({id:row.id,memberId:row.member_user_id,dueOn:row.due_on,
      reportedMinor:row.reported_minor,matchedMinor:row.matched_minor,clearedMinor:row.cleared_minor,
      currency:'BWP',bankVerified:false});
  });
  return Object.freeze({groupId,records:Object.freeze(records),truncated:records.length===limit,
    settlementSource:'unverified_record_not_bank_evidence',paymentExecutionEnabled:false});
}
