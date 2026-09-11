import {__v782162Test} from '../cloudflare/src/worker.js';
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL: ${m}`)};
const originalFetch=globalThis.fetch;let captured=null;
try{
  globalThis.fetch=async(url,options)=>{captured={url:String(url),options};return new Response(JSON.stringify({id:'mail_1'}),{status:200,headers:{'content-type':'application/json'}})};
  ok(await __v782162Test.deliverPasswordReset({RESEND_API_KEY:'r'.repeat(40),PUBLIC_APP_URL:'https://app.example/',EMAIL_FROM:'Security <security@app.example>'},'user@example.com','a b&c'),'valid documented provider sends reset email');
  ok(captured?.url==='https://api.resend.com/emails','Resend endpoint fixed');
  ok(captured?.options?.headers?.authorization===`Bearer ${'r'.repeat(40)}`,'Resend authorization applied');
  const body=JSON.parse(captured.options.body);
  ok(Array.isArray(body.to)&&body.to[0]==='user@example.com','recipient encoded as provider array');
  ok(body.from==='Security <security@app.example>','configured sender preserved');
  ok(body.text.includes('https://app.example/#reset_token=a%20b%26c'),'reset token safely encoded in fragment and omitted from request query');
  captured=null;
  ok(!(await __v782162Test.deliverPasswordReset({PUBLIC_APP_URL:'https://app.example/'},'user@example.com','abc'))&&captured===null,'missing Resend key fails before network');
  ok(!(await __v782162Test.deliverPasswordReset({RESEND_API_KEY:'x'.repeat(40),PUBLIC_APP_URL:'http://app.example/'},'user@example.com','abc'))&&captured===null,'insecure public app URL fails before network');
  ok(!(await __v782162Test.deliverPasswordReset({RESEND_API_KEY:'x'.repeat(40),PUBLIC_APP_URL:'https://user:pass@app.example/'},'user@example.com','abc'))&&captured===null,'credential-bearing public app URL fails before network');
}finally{globalThis.fetch=originalFetch}
console.log(`V78 1.21.62 password reset email runtime: ${checks}/${checks} PASS`);
