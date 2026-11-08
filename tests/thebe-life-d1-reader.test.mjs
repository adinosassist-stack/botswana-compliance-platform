import test from 'node:test';
import assert from 'node:assert/strict';
import {readHouseholdEntries,readHouseholdMembership} from '../server/thebe-life/d1-household-reader.mjs';
function mockDb(membership,rows=[]){
  const calls=[];
  return {
    calls,
    prepare(sql){
      const call={sql,params:null};
      calls.push(call);
      return {bind(...params){
        call.params=params;
        return {
          async first(){return membership;},
          async all(){return {results:rows};}
        };
      }};
    }
  };
}
test('denies without verified household membership and never queries ledger',async()=>{
  const db=mockDb(null);
  const result=await readHouseholdEntries({db,householdId:'h1',userId:'u1'});
  assert.deepEqual(result,{ok:false,reason:'not_authorized'});
  assert.equal(db.calls.length,1);
  assert.match(db.calls[0].sql,/household_id = \?1 AND user_id = \?2/);
  assert.deepEqual(db.calls[0].params,['h1','u1']);
});
test('scopes household records and limits results using bound parameters',async()=>{
  const db=mockDb({role:'viewer'},[{id:'e1',type:'expense',category:'Food',amount_minor:12345,currency:'BWP',occurred_on:'2026-11-08',transfer_id:null}]);
  const value=await readHouseholdEntries({db,householdId:'h1',userId:'u1',limit:5});
  assert.equal(value.ok,true);
  assert.equal(value.entries[0].amountMinor,12345);
  assert.equal(db.calls.length,2);
  assert.match(db.calls[1].sql,/WHERE e.household_id = \?1 AND EXISTS/);
  assert.match(db.calls[1].sql,/m.user_id = \?3 AND m.status = 'active'/);
  assert.deepEqual(db.calls[1].params,['h1',5,'u1']);
});
test('fails closed for forged identities, limit overrun or bad stored data',async()=>{
  const db=mockDb({role:'owner'},[{id:'bad',type:'income',amount_minor:-1,currency:'BWP'}]);
  await assert.rejects(readHouseholdEntries({db,householdId:'h1',userId:'u1;DROP TABLE'}),/invalid_session_user_id/);
  await assert.rejects(readHouseholdEntries({db,householdId:'h1',userId:'u1',limit:1}),/invalid_ledger_row/);
  assert.equal((await readHouseholdEntries({db,householdId:'h1',userId:'u1',limit:101})).ok,false);
});
test('member lookup never exposes a household ledger',async()=>{
  const db=mockDb({role:'adult'});
  assert.deepEqual(await readHouseholdMembership({db,householdId:'h1',userId:'u1'}),{authorized:true,role:'adult'});
  assert.equal(db.calls.length,1);
});
