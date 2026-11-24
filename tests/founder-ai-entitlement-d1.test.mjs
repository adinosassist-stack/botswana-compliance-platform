import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {setFounderAiEntitlement} from '../scripts/founder-ai-entitlement.mjs';
import {hasFounderAiEntitlement} from '../cloudflare/src/founder-ai-entitlement.js';

test('isolated D1 atomically grants, audits, revokes and rolls back rejected audit writes',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('synthetic')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'synthetic-founder-ai-entitlement'}}));
  try{
    const DB=await mf.getD1Database('DB');
    for(const sql of [
      'CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT)',
      'CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT)',
      'CREATE TABLE entitlement_overrides(tenant_id TEXT,feature_key TEXT,enabled INTEGER,limit_value INTEGER,expires_at TEXT,reason TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(tenant_id,feature_key))',
      'CREATE TABLE audit_events(tenant_id TEXT,actor_user_id TEXT,event_type TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT)',
      "INSERT INTO users VALUES('synthetic-owner','owner@example.invalid')",
      "INSERT INTO memberships VALUES('synthetic-workspace','synthetic-owner','owner','active')"
    ])await DB.prepare(sql).run();
    const options={tenantId:'synthetic-workspace',userId:'synthetic-owner',email:'owner@example.invalid',enabled:true,approvalReference:'https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/123',inspectOnly:false};
    assert.equal((await setFounderAiEntitlement(DB,options)).verified,true);
    assert.equal(await hasFounderAiEntitlement({DB},options.tenantId,options.userId),true);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM audit_events').first()).n,1);
    assert.equal((await setFounderAiEntitlement(DB,{...options,enabled:false})).verified,true);
    assert.equal(await hasFounderAiEntitlement({DB},options.tenantId,options.userId),false);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM audit_events').first()).n,2);
    await DB.prepare("CREATE TRIGGER reject_founder_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END").run();
    await assert.rejects(setFounderAiEntitlement(DB,options),/synthetic audit failure/);
    assert.equal(await hasFounderAiEntitlement({DB},options.tenantId,options.userId),false);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM audit_events').first()).n,2);
  }finally{await mf.dispose()}
});
