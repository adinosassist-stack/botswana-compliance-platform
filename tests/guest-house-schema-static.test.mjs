import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../cloudflare/schema/guest-house-management-proposal.sql",import.meta.url),"utf8");
test("all operational tables carry tenant identifiers",()=>{
 for(const table of ["guest_house_properties","guest_house_rooms","guest_house_reservations","guest_house_housekeeping"]){
  assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS "+table+" \\("));
 }
 assert.equal((sql.match(/tenant_id TEXT NOT NULL/g)||[]).length,4);
});
test("child records use composite tenant and property foreign keys",()=>{
 assert.match(sql,/FOREIGN KEY\(tenant_id,property_id,room_id\) REFERENCES guest_house_rooms\(tenant_id,property_id,id\)/);
 assert.match(sql,/FOREIGN KEY\(tenant_id,property_id\) REFERENCES guest_house_properties\(tenant_id,id\)/);
});
test("reservations use checkout-exclusive intervals and documented transaction boundary",()=>{
 assert.match(sql,/check_out>check_in/);
 assert.match(sql,/serialized transaction/);
 assert.match(sql,/guest_house_reservation_overlap/);
});
