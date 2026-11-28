import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.value='';this.disabled=false;this.hidden=false;this.ownText='';}
 set textContent(value){this.ownText=String(value);this.children=[];}
 get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 after(child){this.parent.append(child);}
 replaceChildren(...children){this.ownText='';this.children=[];this.append(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
 async fire(type){await this.listeners[type]?.({preventDefault(){}});}
}
function dom(ids){
 const root=new Element();const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));root.append(...Object.values(nodes));
 return {root,nodes,document:{querySelector:selector=>nodes[selector.slice(1)],createElement:tag=>new Element(tag)}};
}
async function run(file,document,request){
 const code=(await readFile(new URL('../public/js/'+file,import.meta.url),'utf8')).replace(/^import .*;\n/,'');
 const context=vm.createContext({document,BW:{api:{createClient:()=>({request})}},mountManagerInvites(){},location:{origin:'https://manager.example'},navigator:{clipboard:{writeText:async()=>{}}}});
 context.window=context;
 await vm.runInContext('(async()=>{'+code+'\n})()',context);
}
async function requester(role='owner',settings={}){
 const view=dom(['status','request-form','branch','reason','previous','send','business-code']);const posts=[];
 await run('manager-access-request-entry.js',view.document,async(path,options)=>{
  if(options?.method==='POST'){posts.push({path,body:JSON.parse(options.body)});await settings.submitWait;return {ok:true};}
  if(path==='/api/auth/me')return {user:{role},csrfToken:'csrf'};
  if(path.endsWith('/request-locations'))return {ok:true,locations:[{id:'branch-a',name:'Gaborone'}]};
  if(posts.length&&settings.failHistoryAfterSubmit)throw Error('history_unavailable');
  return {ok:true,requests:[]};
 });
 return {...view,posts};
}
test('registered user submits the owner-shared business code without an existing branch',async()=>{
 const x=await requester();x.nodes['business-code'].value='  '+'a'.repeat(64)+'  ';x.nodes.reason.value='Assigned manager';
 await x.nodes['request-form'].fire('submit');
 assert.equal(x.posts.length,1);assert.equal(x.posts[0].body.businessCode,'a'.repeat(64));
 assert.equal(x.posts[0].body.locationId,undefined);assert.equal(x.posts[0].body.reason,'Assigned manager');
 assert.match(x.nodes.status.textContent,/sent.*owner/);assert.equal(x.nodes.send.disabled,false);
});
test('existing business member submits the selected branch without a business code',async()=>{
 const x=await requester('reviewer');x.nodes.branch.value='branch-a';
 await x.nodes['request-form'].fire('submit');
 assert.deepEqual(x.posts[0].body,{locationId:'branch-a',reason:''});
});
test('invalid access code or missing branch does not send a request',async()=>{
 const x=await requester();x.nodes['business-code'].value='invalid';
 await x.nodes['request-form'].fire('submit');assert.equal(x.posts.length,0);
 assert.match(x.nodes.status.textContent,/code/i);assert.equal(x.nodes.send.disabled,false);
 x.nodes['business-code'].value='';await x.nodes['request-form'].fire('submit');assert.equal(x.posts.length,0);
 assert.match(x.nodes.status.textContent,/branch|code/i);
});
test('successful submission stays confirmed if request history refresh fails',async()=>{
 const x=await requester('owner',{failHistoryAfterSubmit:true});x.nodes['business-code'].value='a'.repeat(64);
 await x.nodes['request-form'].fire('submit');
 assert.equal(x.posts.length,1);assert.equal(x.nodes['business-code'].value,'');
 assert.match(x.nodes.status.textContent,/sent.*history.*reload/);assert.equal(x.nodes.send.disabled,false);
});
test('repeated submit while pending sends the request only once',async()=>{
 let release;const submitWait=new Promise(resolve=>{release=resolve;});
 const x=await requester('owner',{submitWait});x.nodes['business-code'].value='a'.repeat(64);
 const pending=x.nodes['request-form'].fire('submit');
 await x.nodes['request-form'].fire('submit');assert.equal(x.posts.length,1);
 release();await pending;assert.equal(x.nodes.send.disabled,false);
});
function walk(root){return [root,...root.children.flatMap(walk)];}
for(const [action,status,expected] of [
 ['Approve for provisioning','pending',/Decision recorded.*not active/],
 ['Reject','pending',/Decision recorded.*not active/],
 ['Provision manager (secure action)','approved_for_provisioning',/Manager provisioned.*sign in again/]
])for(const refreshFails of [false,true])test('owner '+action+' confirmation survives '+(refreshFails?'a failed':'a successful')+' inbox refresh',async()=>{
 const x=dom(['invites','secure-link','copy-link']);let current=status,inboxReads=0;
 await run('manager-invite-owner-entry.js',x.document,async(path,options)=>{
  if(path==='/api/auth/me')return {user:{role:'owner'},csrfToken:'csrf'};
  if(path.endsWith('/directory'))return {ok:true,invites:[],locations:[{id:'branch-a',name:'Gaborone'}],grants:[]};
  if(path.endsWith('/inbox')){if(++inboxReads>1&&refreshFails)throw Error('history_unavailable');return {ok:true,requests:[{id:'request-a',status:current}]};}
  if(options?.method==='POST'){
   if(path.endsWith('/provision')){current='provisioned';return {ok:true,status:current,reauthenticationRequired:true};}
   current=JSON.parse(options.body).decision==='approve'?'approved_for_provisioning':'rejected';
   return {ok:true,status:current,managerActive:false};
  }
  throw Error('unexpected_path');
 });
 const button=walk(x.root).find(n=>n.tagName==='button'&&n.textContent===action);assert.ok(button);
 await button.fire('click');
 const section=walk(x.root).find(n=>n.attributes['aria-label']==='Manager access requests');
 assert.match(section.textContent,expected);
 if(refreshFails){assert.match(section.textContent,/Reload/);assert.equal(walk(section).filter(n=>n.tagName==='button').length,0);}
});
