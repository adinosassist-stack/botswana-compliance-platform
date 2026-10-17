import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';
class Element{
  children=[];textContent='';attributes={};
  appendChild(child){this.children.push(child);}
  setAttribute(key,value){this.attributes[key]=value;}
  get childElementCount(){return this.children.length;}
}
let cards=[];
const window={renderOpsReports(items){cards=items.map(()=>new Element());},whenThebeWorkspaceReady(fn){fn();}};
const document={createElement:()=>new Element(),querySelectorAll:()=>cards};
vm.runInNewContext(fs.readFileSync('public/js/report-attachment-links.js','utf8'),{window,document,URL,location:{origin:'https://example.test'}});
window.renderOpsReports([{id:'r1',attachments:[
  {id:'a1',name:'<img onerror=alert(1)>.jpg',download_url:'/api/daily-reporting/attachments/r1/a1?date=2026-10-17'},
  {id:'a2',name:'external',download_url:'https://outside.test/api/daily-reporting/attachments/r1/a2'},
  {id:'a3',name:'wrong report',download_url:'/api/daily-reporting/attachments/r2/a3'}
]},{id:'r2',attachmentsState:'unavailable'}]);
assert.equal(cards[0].children[0].children.length,1,'only same-origin report-bound download links are rendered');
const link=cards[0].children[0].children[0];
assert.equal(link.textContent,'Download <img onerror=alert(1)>.jpg','filenames remain literal text');
assert.equal(link.href,'/api/daily-reporting/attachments/r1/a1?date=2026-10-17');
assert.equal(link.attributes.download,'');
assert.match(cards[1].children[0].textContent,/temporarily unavailable/);
const html='<html><head></head><body></body></html>',sha='a'.repeat(40);
assert.ok(versionReleaseAssets(html,sha,{includeWorkspaceFixes:true}).includes('/js/report-attachment-links.js?release='+sha));
assert.ok(!versionReleaseAssets(html,sha).includes('/js/report-attachment-links.js'),'workspace reporting enhancement stays off public pages');
console.log('Report attachment links: authenticated UI, literal filenames, report-bound URLs and release delivery PASS');
