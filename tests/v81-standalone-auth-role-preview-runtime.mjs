import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../preview/preview-api.js',import.meta.url),'utf8');
const context={window:{BW:{previewData:{}}},Intl,Date,structuredClone,Map,Object,JSON,Error,String};context.window.window=context.window;
vm.createContext(context);vm.runInContext(code,context,{filename:'preview-api.js'});
const request=(url,opts={})=>context.window.BW.preview.request(url,opts);
const post=(url,body)=>request(url,{method:'POST',body:JSON.stringify(body)});
test('role preview logins resolve exact workspace role',()=>{
  for(const role of ['owner','manager','reviewer','auditor']){
    const r=post('/api/auth/login',{email:`${role}@preview.local`,password:'StrongPass123!'});
    assert.equal(r.user.role,role);assert.equal(r.csrfToken,'preview-csrf');
  }
});
test('preview registration creates an Owner workspace then permits login',()=>{
  const email='new-owner@example.com';const reg=post('/api/auth/register',{email,password:'StrongPass123!',companyName:'New Preview Company'});assert.equal(reg.ok,true);
  const login=post('/api/auth/login',{email,password:'StrongPass123!'});assert.equal(login.user.role,'owner');assert.equal(login.user.tenantName,'New Preview Company');
});
test('preview multi-workspace login requires explicit tenant selection',()=>{
  assert.throws(()=>post('/api/auth/login',{email:'multi@preview.local',password:'StrongPass123!'}),e=>e.code==='workspace_selection_required'&&e.status===409&&e.data.workspaces.length===2);
  const r=post('/api/auth/login',{email:'multi@preview.local',password:'StrongPass123!',tenantId:'preview-manager-workspace'});assert.equal(r.user.role,'manager');assert.equal(r.user.tenantId,'preview-manager-workspace');
});
test('invalid preview credentials fail closed',()=>{
  assert.throws(()=>post('/api/auth/login',{email:'bad',password:'short'}),e=>e.code==='invalid_credentials'&&e.status===401);
});
