import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.listeners={};this.hidden=true;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(){}
 addEventListener(event,fn){this.listeners[event]=fn;}
}
const text=node=>[node.textContent,...node.children.map(text)].join(' ');
test('employee cash history displays daily counts, review decisions and reasons as text',async()=>{
 const host=new Element('section');
 const context=vm.createContext({document:{getElementById:()=>host,createElement:tag=>new Element(tag)},Date,crypto:{randomUUID:()=> 'test-key'}});
 vm.runInContext(readFileSync(new URL('../public/js/employee-cash-portal.js',import.meta.url),'utf8'),context);
 const reason='<img src=x onerror=alert(1)>';
 await context.ThebeEmployeeCash.mount({api:async()=>({summary:{},items:[{occurred_on:'2026-11-26',kind:'expense',purpose:'Fuel',amount_minor:12500,status:'rejected',review_note:reason}],counts:[{report_date:'2026-11-26',counted_minor:37500,status:'approved',review_note:'Count checked'}]})});
 assert.equal(host.hidden,false);
 assert.match(text(host),/My daily cash reports/);
 assert.match(text(host),/Cash counted: P375\.00/);
 assert.match(text(host),/Review: approved/);
 assert.match(text(host),/Manager note: Count checked/);
 assert.ok(text(host).includes(reason));
 function all(node){return [node,...node.children.flatMap(all)];}
 assert.equal(all(host).filter(node=>node.tag==='img').length,0);
});
test('cash history stays hidden when server denies cash access',async()=>{
 const host=new Element('section');
 const context=vm.createContext({document:{getElementById:()=>host,createElement:tag=>new Element(tag)},Date});
 vm.runInContext(readFileSync(new URL('../public/js/employee-cash-portal.js',import.meta.url),'utf8'),context);
 assert.equal(await context.ThebeEmployeeCash.mount({api:async()=>{throw Error('forbidden')}}),false);
 assert.equal(host.hidden,true);
 assert.equal(host.children.length,0);
});
