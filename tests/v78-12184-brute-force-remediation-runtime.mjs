import net from 'node:net';
import assert from 'node:assert/strict';
import {createHardenedHttpServer,HTTP_MAX_HEADERS_COUNT,rawHeaderCountExceeded} from '../server/http-envelope.js';
import {__v782184Test} from '../cloudflare/src/worker.js';
let pass=0;const ok=(v,m)=>{assert.ok(v,m);console.log('PASS',m);pass++};
async function rawRequest(port,raw,timeout=3500){return await new Promise((resolve,reject)=>{const sock=net.createConnection({host:'127.0.0.1',port});let out='',done=false;const finish=err=>{if(done)return;done=true;clearTimeout(timer);sock.destroy();err?reject(err):resolve(out)};const timer=setTimeout(()=>finish(new Error('socket_timeout')),timeout);sock.on('connect',()=>sock.write(raw));sock.on('data',d=>out+=d.toString('latin1'));sock.on('end',()=>finish());sock.on('close',()=>finish());sock.on('error',finish)})}
let handlerHits=0;const server=createHardenedHttpServer((req,res)=>{handlerHits++;res.statusCode=200;res.end('handler reached')});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});const port=server.address().port;
try{
  ok(rawHeaderCountExceeded({rawHeaders:Array((HTTP_MAX_HEADERS_COUNT+1)*2).fill('x')})===true,'raw header guard detects >100 pairs');
  const headers=Array.from({length:105},(_,i)=>`X-Test-${i}: v`).join('\r\n');
  const response=await rawRequest(port,`GET /api/live HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${headers}\r\nConnection: close\r\n\r\n`);
  ok(/^HTTP\/1\.1 431/m.test(response)&&response.includes('too_many_headers'),'oversized raw header set fails closed with 431');
  ok(handlerHits===0,'oversized header request never reaches application handler');
  const normal=await rawRequest(port,`GET /api/live HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  ok(/^HTTP\/1\.1 200/m.test(normal)&&handlerHits===1,'normal request still reaches handler');
  const readiness=__v782184Test.deploymentReadiness({SESSION_SECRET:'x'.repeat(40),AUDIT_INTEGRITY_SECRET:'y'.repeat(40),EVIDENCE:{},EVIDENCE_SCAN_API_URL:'https://scanner.example',EVIDENCE_SCAN_SECRET:'z'.repeat(40),DB:{},PUBLIC_RATE_LIMITER:{},OPERATIONS_SECRET:'o'.repeat(40),AUTOMATION_SECRET:'a'.repeat(40),TURNSTILE_SITE_KEY:'1x00000000000000000000AA',TURNSTILE_SECRET_KEY:'t'.repeat(40),PLATFORM_ADMIN_EMAILS:'admin@example.com',PLATFORM_REGULATORY_REVIEWERS:'reviewer@example.com',PUBLIC_APP_URL:'https://app.example.com',PUBLIC_ORIGIN:'https://app.example.com',BILLING_WEBHOOK_SECRET:'b'.repeat(40),PAYMENT_PROVIDER:'none'});
  ok(!readiness.missingRequired.includes('AUTOMATION_SECRET')&&!readiness.missingRequired.includes('TURNSTILE_SITE_KEY')&&!readiness.missingRequired.includes('TURNSTILE_SECRET_KEY'),'deployment readiness accepts strong automation and Turnstile configuration');
}finally{await new Promise(resolve=>server.close(resolve))}
console.log(`V78 1.21.84 brute-force remediation runtime: ${pass}/${pass} PASS`);
