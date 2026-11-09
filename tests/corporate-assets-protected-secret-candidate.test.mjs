import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEnvironmentPolicy,assertStagingHold,makeSecretPayload} from '../scripts/corporate-assets-protected-secret-candidate.mjs';
const id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const sha='a'.repeat(40);
const env={can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User',reviewer:{login:'thusico'}}]}],
 deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
const text=(name,value)=>({name,type:'plain_text',text:value});
const bindings=[
 text('APP_ENV','staging'),text('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 text('ASSETS_STAGING_WRITES_ENABLED','false'),text('THEBE_CORPORATE_ASSETS_ENABLED','false'),
 text('ASSETS_STAGING_D1_ID',id),text('ASSETS_STAGING_SOURCE_SHA',sha),
 {name:'DB',type:'d1',database_id:id},
 text('SESSION_SECRET','synthetic-only'),text('AUDIT_INTEGRITY_SECRET','synthetic-only')
];
test('independent thusico review, self-review prevention and main-only policy required',()=>{
 assert.equal(validateEnvironmentPolicy(env,[{name:'main'}]),true);
 for(const [badEnv,branches] of [
 [{...env,protection_rules:[]},[{name:'main'}]],
 [{...env,protection_rules:[{...env.protection_rules[0],prevent_self_review:false}]},[{name:'main'}]],
 [{...env,protection_rules:[{...env.protection_rules[0],reviewers:[{type:'User',reviewer:{login:'owner'}}]}]},[{name:'main'}]],
 [env,[{name:'main'},{name:'test'}]],
 [env,[{name:'main',type:'tag'}]],
 [{...env,can_admins_bypass:true},[{name:'main',type:'branch'}]],
 [{...env,can_admins_bypass:undefined},[{name:'main',type:'branch'}]],
 [{...env,deployment_branch_policy:{custom_branch_policies:false,protected_branches:true}},[{name:'main'}]]
 ])assert.throws(()=>validateEnvironmentPolicy(badEnv,branches));
});
test('isolated D1 and disabled write/asset flags must hold before rotation',()=>{
 assert.equal(assertStagingHold(bindings,sha),true);
 for(const b of [
  bindings.map(x=>x.name==='DB'?{...x,database_id:'00000000-0000-4000-8000-000000000000'}:x),
  bindings.map(x=>x.name==='ASSETS_STAGING_WRITES_ENABLED'?{...x,text:'true'}:x),
  bindings.map(x=>x.name==='THEBE_CORPORATE_ASSETS_ENABLED'?{...x,text:'true'}:x),
  [...bindings,bindings[0]]
 ])assert.throws(()=>assertStagingHold(b,sha));
 assert.throws(()=>assertStagingHold(bindings,'b'.repeat(40)));
});
test('generate distinct cryptographically random staging secrets in memory only',()=>{
 const a=JSON.parse(makeSecretPayload()),b=JSON.parse(makeSecretPayload());
 assert.deepEqual(Object.keys(a).sort(),['AUDIT_INTEGRITY_SECRET','SESSION_SECRET']);
 assert.ok(a.SESSION_SECRET.length>=60 && a.AUDIT_INTEGRITY_SECRET.length>=60);
 assert.notEqual(a.SESSION_SECRET,a.AUDIT_INTEGRITY_SECRET);
 assert.notEqual(a.SESSION_SECRET,b.SESSION_SECRET);
});
