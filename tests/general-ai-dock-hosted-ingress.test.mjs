import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyDockIngress,DOCK_HOST,DOCK_WORKER,AI_WORKER} from '../scripts/dock-hosted-ingress-guard.mjs';
const id='11111111-2222-4333-8444-555555555555';
function sample(){
 return {phase:'before-attach',inventoryComplete:true,appId:id,testerEmails:['tester@example.invalid'],
 apps:[{id,type:'self_hosted',domain:DOCK_HOST,aud:'synthetic-audience',session_duration:'15m',destinations:[{type:'public',uri:DOCK_HOST}]}],
 policies:[{decision:'allow',include:[{email:{email:'tester@example.invalid'}}],require:[],exclude:[]}],
 domains:[],routes:[],workspaceSubdomain:{enabled:false,previews_enabled:false},backendSubdomain:{enabled:false,previews_enabled:false}};
}
test('only exact protected hostname and exact explicit tester policy qualify before and after attachment',()=>{
 const x=sample();assert.equal(verifyDockIngress(x).ok,true);
 x.phase='after-attach';x.domains=[{hostname:DOCK_HOST,service:DOCK_WORKER,zone_name:'thebedesk.com',enabled:true,previews_enabled:false}];
 assert.equal(verifyDockIngress(x).ok,true);
});
test('reject missing or bypassed Access, partial routes, and unexpected tester policy',()=>{
 const cases=[
 x=>x.inventoryComplete=false,
 x=>x.apps=[],
 x=>x.apps[0].domain=DOCK_HOST+'/app',
 x=>x.apps[0].destinations[0].overrides=[{behavior:'public',path_pattern:'/api/*'}],
 x=>x.apps.push({domain:'*.thebedesk.com'}),
 x=>x.apps[0].options_preflight_bypass=true,
 x=>x.apps[0].session_duration='24h',
 x=>x.policies.push({decision:'bypass'}),
 x=>x.policies[0].include=[{everyone:{}}],
 x=>x.policies[0].include=[{email:{email:'unapproved@example.invalid'}}],
 x=>x.backendSubdomain.enabled=true,
 x=>x.workspaceSubdomain.previews_enabled=true,
 x=>x.domains=[{hostname:'ai-staging.thebedesk.com',service:AI_WORKER}],
 x=>x.routes=[{pattern:DOCK_HOST+'/*',script:'other'}],
 x=>x.domains=[{hostname:DOCK_HOST,service:DOCK_WORKER}],
 x=>{x.phase='after-attach';x.domains=[{hostname:DOCK_HOST,service:'wrong',zone_name:'thebedesk.com',enabled:true,previews_enabled:false}]}
 ];
 for(const change of cases){const x=sample();change(x);assert.throws(()=>verifyDockIngress(x));}
});
