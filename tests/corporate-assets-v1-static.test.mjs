import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../db/migrations/20261101_corporate_assets_v1.sql",import.meta.url),"utf8");
test("all asset tables are company-scoped and RLS-deny by default",()=>{
 for(const table of ["corporate_assets","asset_maintenance_logs","asset_insurance_policies"]){
   assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS "+table+" \\("));
   assert.match(sql,new RegExp("ALTER TABLE "+table+" ENABLE ROW LEVEL SECURITY;"));
   assert.match(sql,new RegExp("ALTER TABLE "+table+" FORCE ROW LEVEL SECURITY;"));
 }
 assert.match(sql,/FOREIGN KEY\(company_id,asset_id\)/g);
 assert.match(sql,/REVOKE ALL ON corporate_assets,asset_maintenance_logs,asset_insurance_policies FROM PUBLIC/);
});
test("money, depreciation and tenancy integrity constraints exist",()=>{
 assert.match(sql,/CHECK\(acquisition_cost_bwp>=0\)/);
 assert.match(sql,/CHECK\(current_book_value_bwp>=0\)/);
 assert.match(sql,/depreciation_rate_percentage BETWEEN 0 AND 100/);
 assert.match(sql,/corporate_assets_serial_tenant_unique/);
 assert.match(sql,/coverage_end>=coverage_start/);
 assert.match(sql,/next_due_date>=service_date/);
});
