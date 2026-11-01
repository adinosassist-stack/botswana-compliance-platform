import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../docs/sql/corporate-assets-v1-postgres-proposal.sql",import.meta.url),"utf8");
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
 assert.match(sql,/CHECK\s*\(\s*acquisition_cost_bwp\s*>=\s*0\s*\)/);
 assert.match(sql,/CHECK\s*\(\s*current_book_value_bwp\s*>=\s*0\s*\)/);
 assert.match(sql,/depreciation_rate_percentage\s+BETWEEN\s+0\s+AND\s+100/);
 assert.match(sql,/corporate_assets_serial_tenant_unique/);
 assert.match(sql,/coverage_end\s*>=\s*coverage_start/);
 assert.match(sql,/next_due_date\s*>=\s*service_date/);
});
