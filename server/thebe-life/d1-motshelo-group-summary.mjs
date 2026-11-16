/**
 * Thebe Life — read-only Motshelo group summary.
 * Caller supplies a verified server-session user ID, never a browser identity.
 * Membership authorization and aggregation occur in one SQL SELECT, preventing
 * revoked/non-member access even if a separate earlier check became stale.
 * Never interpret cleared ledger entries as bank settlement evidence.
 */
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function checkId(value,label){
  if(typeof value!=='string'||!ID.test(value))throw new TypeError('invalid_'+label);
}
function readCount(value,label){
  if(!Number.isSafeInteger(value)||value<0)throw new Error('invalid_'+label);
  return value;
}
export async function readMotsheloGroupSummary({db,groupId,sessionUserId}={}){
  if(!db||typeof db.prepare!=='function')throw new TypeError('d1_database_required');
  checkId(groupId,'group_id');checkId(sessionUserId,'session_user_id');
  // A member with no contributions must still receive one row (zero totals);
  // a revoked or unrelated user receives no row at all.
  const sql=`SELECT g.id AS group_id,g.name AS group_name,g.model AS group_model,
       (SELECT COUNT(*) FROM life_motshelo_members members
         WHERE members.group_id=g.id AND members.status='active') AS member_count,
       COALESCE((SELECT SUM(c.reported_minor) FROM life_motshelo_contributions c
         WHERE c.group_id=g.id),0) AS reported_minor,
       COALESCE((SELECT SUM(c.matched_minor) FROM life_motshelo_contributions c
         WHERE c.group_id=g.id),0) AS matched_minor,
       COALESCE((SELECT SUM(c.cleared_minor) FROM life_motshelo_contributions c
         WHERE c.group_id=g.id),0) AS cleared_minor
    FROM life_motshelo_groups g
    WHERE g.id=?1 AND EXISTS (
      SELECT 1 FROM life_motshelo_members m
      WHERE m.group_id=g.id AND m.user_id=?2 AND m.status='active'
        AND m.role IN ('chair','treasurer','secretary','member','auditor')
    ) LIMIT 1`;
  const row=await db.prepare(sql).bind(groupId,sessionUserId).first();
  if(!row)return Object.freeze({ok:false,reason:'not_authorized_or_not_found'});
  if(row.group_id!==groupId||typeof row.group_name!=='string'||!row.group_name.trim()||
    !['rotating','annual','lending','grocery','burial','property','investment'].includes(row.group_model))
    throw new Error('invalid_motshelo_group_row');
  const memberCount=readCount(row.member_count,'member_count');
  const reportedMinor=readCount(row.reported_minor,'reported_minor');
  const matchedMinor=readCount(row.matched_minor,'matched_minor');
  const clearedMinor=readCount(row.cleared_minor,'cleared_minor');
  if(clearedMinor>matchedMinor||matchedMinor>reportedMinor)
    throw new Error('invalid_verification_progression');
  return Object.freeze({ok:true,groupId,name:row.group_name,model:row.group_model,
    memberCount,currency:'BWP',reportedMinor,matchedMinor,clearedMinor,
    outstandingVerificationMinor:reportedMinor-clearedMinor,
    bankVerified:false,availableToDisburseMinor:null,paymentExecutionEnabled:false});
}
