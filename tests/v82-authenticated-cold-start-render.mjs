import assert from 'node:assert/strict';
import {hardenAuthenticatedColdStart} from '../cloudflare/src/agentic-entry.js';

const source='<!doctype html><script>function showView(id,options={}){if(!options?.skipDataRefresh)queueMicrotask(()=>renderAll());return true}</script>';
const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=utf-8','etag':'stale-etag','content-length':String(source.length)}});
const hardened=await hardenAuthenticatedColdStart(new Request('https://thebedesk.com/'),response);
const html=await hardened.text();
assert.ok(html.includes('if(!options?.skipDataRefresh&&!options?.roleRedirect)queueMicrotask(()=>renderAll())'));
assert.ok(!html.includes('if(!options?.skipDataRefresh)queueMicrotask(()=>renderAll())'));
assert.equal(hardened.headers.get('x-thebe-cold-start-guard'),'role-redirect-v1');
assert.equal(hardened.headers.get('etag'),null);

const api=new Response('{"ok":true}',{headers:{'content-type':'application/json'}});
assert.equal(await hardenAuthenticatedColdStart(new Request('https://thebedesk.com/api/live'),api),api);
console.log('Authenticated cold-start render guard PASS');
