import {__v782179Test as t} from '../cloudflare/src/worker.js';
import {nodeRequestEncodingAllowed,rejectEncodedApiBody} from '../server/request-encoding.js';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};
const headers=x=>new Headers(x||{});
ok(nodeRequestEncodingAllowed('')===true&&nodeRequestEncodingAllowed('identity')===true,'Node allows absent/identity content encoding');
ok(nodeRequestEncodingAllowed('gzip')===false&&nodeRequestEncodingAllowed('br')===false,'Node rejects gzip/brotli content encoding');
ok(rejectEncodedApiBody('POST','/api/auth/login','gzip')===true,'Node rejects encoded mutating API body');
ok(rejectEncodedApiBody('GET','/api/live','gzip')===false,'Node does not apply body guard to GET');
ok(rejectEncodedApiBody('POST','/public/passport/verify','gzip')===false,'Node API guard does not accidentally rewrite non-API public paths');
ok(t.requestBodyEncodingAllowed({headers:headers()})===true,'Worker allows absent content encoding');
ok(t.requestBodyEncodingAllowed({headers:headers({'content-encoding':'identity'})})===true,'Worker allows identity content encoding');
ok(t.requestBodyEncodingAllowed({headers:headers({'content-encoding':'gzip'})})===false,'Worker rejects gzip encoding');
ok(t.requestBodyEncodingAllowed({headers:headers({'content-encoding':'br'})})===false,'Worker rejects brotli encoding');
ok(t.rejectEncodedApiBody({method:'POST',headers:headers({'content-encoding':'gzip'})},new URL('https://app.test/api/auth/login'))===true,'Worker top-level API POST guard rejects gzip');
ok(t.rejectEncodedApiBody({method:'POST',headers:headers({'content-encoding':'gzip'})},new URL('https://app.test/public/passport/verify'))===true,'Worker top-level public POST guard rejects gzip');
ok(t.rejectEncodedApiBody({method:'GET',headers:headers({'content-encoding':'gzip'})},new URL('https://app.test/api/live'))===false,'Worker does not apply body encoding guard to GET');
let readTouched=false;const fakeReq={headers:headers({'content-encoding':'gzip'}),body:{getReader(){readTouched=true;throw new Error('body_should_not_be_read')}}};
try{await t.readJson(fakeReq,{maxBytes:4096});ok(false,'Worker compressed readJson should reject')}catch(e){ok(e?.status===415&&e?.code==='unsupported_content_encoding','Worker readJson returns 415 for compressed JSON');ok(readTouched===false,'Worker rejects compressed JSON before touching body stream')}
console.log(`V78 1.21.79 request-encoding abuse runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
