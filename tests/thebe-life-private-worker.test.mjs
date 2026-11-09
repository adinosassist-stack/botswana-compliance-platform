import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import staging from '../cloudflare/src/thebe-life-private-staging-entry.js';

test('private Life staging Worker cannot expose data for any route',async()=>{
 for(const [method,path] of [['GET','/'],['GET','/api/life/households/h1/entries'],['POST','/api/life/households/h1/entries'],['GET','/health']]){
  const response=await staging.fetch(new Request('https://life-staging.invalid'+path,{method}),{});
  assert.equal(response.status,404);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{error:'private_staging_unavailable'});
 }
});
test('private Life deployment config contains no public endpoints and fails closed',()=>{
 const cfg=readFileSync(new URL('../cloudflare/wrangler.life-staging.toml',import.meta.url),'utf8');
 for(const exact of ['name = "bw-life-staging"','main = "src/thebe-life-private-staging-entry.js"',
   'workers_dev = false','preview_urls = false','THEBE_LIFE_HOUSEHOLD_ENABLED = "false"',
   'THEBE_LIFE_INSURANCE_ENABLED = "false"','THEBE_LIFE_MOTSHELO_PAYMENTS_ENABLED = "false"',
   'LIFE_STAGING_PUBLIC_ROUTES_ENABLED = "false"','LIFE_STAGING_DATA_CLASS = "synthetic-only"',
   'database_name = "bw-life-staging"','database_id = "fa58bcb8-5871-4272-b3e8-c8cc2548dcd2"'])
   assert.ok(cfg.includes(exact),exact);
 assert.doesNotMatch(cfg,/^\s*(?:route\s*=|routes\s*=|custom_domains\s*=|\[\[?routes\]\]?)/m);
});
