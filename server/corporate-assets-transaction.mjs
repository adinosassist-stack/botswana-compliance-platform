/** Transaction boundary for Corporate Assets writes.
 * Must receive a PostgreSQL pool, not a shared connection.
 * Never return a successful mutation unless both update and audit event commit.
 */
import {recordTransfer,recordStatusChange} from './corporate-assets-audit.mjs';
export async function withAssetTransaction(pool,operation){
 if(!pool||typeof pool.connect!=='function'||typeof operation!=='function')throw new TypeError('invalid_transaction');
 const client=await pool.connect();
 let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  const result=await operation(client);
  await client.query('COMMIT');begun=false;
  return result;
 }catch(error){
  if(begun){try{await client.query('ROLLBACK')}catch(rollbackError){error.rollbackFailed=true}}
  throw error;
 }finally{client.release()}
}
export function transferAsset(pool,request){
 return withAssetTransaction(pool,client=>recordTransfer({...request,db:client}));
}
export function changeAssetStatus(pool,request){
 return withAssetTransaction(pool,client=>recordStatusChange({...request,db:client}));
}
