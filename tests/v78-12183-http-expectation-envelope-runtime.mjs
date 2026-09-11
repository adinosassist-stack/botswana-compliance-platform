import net from "node:net";
import {createHardenedHttpServer,HTTP_MAX_HEADER_SIZE,HTTP_MAX_HEADERS_COUNT,expectationProtectedRequest} from "../server/http-envelope.js";

let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log("PASS",m);pass++}else{console.error("FAIL",m);fail++}};
async function rawRequest(port,raw,timeout=3500){return await new Promise((resolve,reject)=>{const sock=net.createConnection({host:"127.0.0.1",port});let out="",done=false;const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);sock.destroy();err?reject(err):resolve(out)};const timer=setTimeout(()=>finish(new Error("socket_timeout")),timeout);sock.on("connect",()=>sock.write(raw));sock.on("data",d=>{out+=d.toString("latin1")});sock.on("end",()=>finish());sock.on("close",()=>finish());sock.on("error",finish)})}
const handler=(req,res)=>{if(req.url==="/robots.txt"){res.statusCode=200;res.setHeader("Content-Type","text/plain");return res.end("User-agent: *\nAllow: /\n")}if(req.url==="/api/live"){res.statusCode=200;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({ok:true,version:"1.21.83"}))}res.statusCode=404;res.end("not found")};
const server=createHardenedHttpServer(handler);
await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});const port=server.address().port;
try{
  ok(HTTP_MAX_HEADER_SIZE===16384&&HTTP_MAX_HEADERS_COUNT===100&&server.maxHeadersCount===0,"runtime server pins 16 KiB parser ceiling and preserves complete header set for explicit 100-header guard");
  ok(expectationProtectedRequest({method:"POST",url:"/api/auth/login"})&&expectationProtectedRequest({method:"DELETE",url:"/public/report?id=1"})&&!expectationProtectedRequest({method:"GET",url:"/api/live"}),"expectation policy protects only mutating API/public requests");
  const protected100=await rawRequest(port,`POST /api/auth/login HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: 100-continue\r\nContent-Type: application/json\r\nContent-Length: 999999\r\n\r\n`);
  ok(/^HTTP\/1\.1 417/m.test(protected100)&&!protected100.includes("100 Continue"),"protected API mutation rejects 100-continue before body");
  ok(/Connection: close/i.test(protected100)&&/Cache-Control: no-store/i.test(protected100)&&/X-Content-Type-Options: nosniff/i.test(protected100),"early 417 response is close/no-store/nosniff");
  const protectedPublic=await rawRequest(port,`POST /public/daily-report HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: 100-continue\r\nContent-Length: 500000\r\n\r\n`);
  ok(/^HTTP\/1\.1 417/m.test(protectedPublic)&&!protectedPublic.includes("100 Continue"),"protected public mutation rejects 100-continue before body");
  const unsupported=await rawRequest(port,`GET /robots.txt HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: magic-extension\r\nConnection: close\r\n\r\n`);
  ok(/^HTTP\/1\.1 417/m.test(unsupported)&&unsupported.includes('unsupported_expectation'),"unsupported HTTP expectation fails closed");
  const allowed=await rawRequest(port,`GET /robots.txt HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n`);
  ok(allowed.includes("HTTP/1.1 100 Continue")&&allowed.includes("HTTP/1.1 200 OK")&&allowed.includes("User-agent: *"),"non-protected 100-continue traffic still reaches handler");
  const normal=await rawRequest(port,`GET /api/live HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  ok(/^HTTP\/1\.1 200/m.test(normal)&&normal.includes('"version":"1.21.83"'),"ordinary HTTP requests still reach handler");
  const huge="a".repeat(17000);const oversized=await rawRequest(port,`GET /robots.txt HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Oversized: ${huge}\r\nConnection: close\r\n\r\n`);
  ok(/^HTTP\/1\.1 (431|400)/m.test(oversized)&&!oversized.includes("User-agent: *"),"oversized header envelope is rejected by Node parser");
}finally{await new Promise(resolve=>server.close(resolve))}
console.log(`V78 1.21.83 HTTP expectation/envelope runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
