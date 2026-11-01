/** Immutable, tenant-scoped asset history adapter; requires authenticated server context. */
import {validateTransfer,validateStatusChange} from './corporate-assets-domain.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireContext(context){
 if(!context||!uuid.test(context.companyId||'')||!uuid.test(context.actorId||'')||context.authorized!==true)throw new Error('unauthorized');
}
export async function recordTransfer({db,context,assetId,transfer}){
 requireContext(context);
 if(!uuid.test(assetId||'')||!db||typeof db.query!=='function')throw new Error('invalid_request');
 const value=validateTransfer(transfer);
 // Caller owns transaction; no implicit commit or connection pooling.
 const update=await db.query('UPDATE corporate_assets SET assigned_branch=$1,updated_at=now() WHERE id=$2 AND company_id=$3 AND assigned_branch=$4 AND status NOT IN (\'Written Off\',\'Decommissioned\') RETURNING id',[value.toBranch,assetId,context.companyId,value.fromBranch]);
 if(update.rowCount!==1)throw new Error('asset_conflict');
 await db.query('INSERT INTO corporate_asset_events (company_id,asset_id,actor_id,event_type,details) VALUES ($1,$2,$3,$4,$5::jsonb)',[context.companyId,assetId,context.actorId,'branch_transfer',JSON.stringify(value)]);
 return {assetId,branch:value.toBranch};
}
export async function recordStatusChange({db,context,assetId,from,to,reason}){
 requireContext(context);
 if(!uuid.test(assetId||'')||!db||typeof db.query!=='function')throw new Error('invalid_request');
 const change=validateStatusChange(from,to,reason);
 const update=await db.query('UPDATE corporate_assets SET status=$1,updated_at=now() WHERE id=$2 AND company_id=$3 AND status=$4 RETURNING id',[to,assetId,context.companyId,from]);
 if(update.rowCount!==1)throw new Error('asset_conflict');
 await db.query('INSERT INTO corporate_asset_events (company_id,asset_id,actor_id,event_type,details) VALUES ($1,$2,$3,$4,$5::jsonb)',[context.companyId,assetId,context.actorId,'status_change',JSON.stringify(change)]);
 return {assetId,status:to};
}
