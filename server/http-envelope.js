import http from "node:http";

export const HTTP_MAX_HEADER_SIZE=16*1024;
export const HTTP_MAX_HEADERS_COUNT=100;
const HTTP_MUTATING_METHODS=new Set(["POST","PUT","PATCH","DELETE"]);

export function expectationProtectedRequest(req){
  let pathname="/";
  try{pathname=new URL(String(req?.url||"/"),"http://local.invalid").pathname}catch{}
  return HTTP_MUTATING_METHODS.has(String(req?.method||"").toUpperCase())&&(pathname.startsWith("/api/")||pathname.startsWith("/public/"));
}

function earlyHttpJson(res,status,payload,{close=false}={}){
  const body=JSON.stringify(payload);
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Content-Length",String(Buffer.byteLength(body)));
  if(close){res.setHeader("Connection","close");res.shouldKeepAlive=false}
  res.end(body);
}

export function rawHeaderCountExceeded(req){
  return Math.floor((Array.isArray(req?.rawHeaders)?req.rawHeaders.length:0)/2)>HTTP_MAX_HEADERS_COUNT;
}

export function createHardenedHttpServer(requestHandler){
  if(typeof requestHandler!=="function")throw new TypeError("request_handler_required");
  const guardedRequestHandler=(req,res)=>rawHeaderCountExceeded(req)?earlyHttpJson(res,431,{error:"too_many_headers"},{close:true}):requestHandler(req,res);
  const server=http.createServer({maxHeaderSize:HTTP_MAX_HEADER_SIZE},guardedRequestHandler);
  // Do not let Node silently discard headers before rawHeaderCountExceeded() sees them.
  // The 16 KiB parser ceiling bounds total header bytes; the application-level guard
  // then deterministically rejects more than HTTP_MAX_HEADERS_COUNT with HTTP 431.
  server.maxHeadersCount=0;
  server.on("checkContinue",(req,res)=>{
    if(rawHeaderCountExceeded(req))return earlyHttpJson(res,431,{error:"too_many_headers"},{close:true});
    if(expectationProtectedRequest(req))return earlyHttpJson(res,417,{error:"expectation_failed"},{close:true});
    res.writeContinue();
    guardedRequestHandler(req,res);
  });
  server.on("checkExpectation",(_req,res)=>earlyHttpJson(res,417,{error:"unsupported_expectation"},{close:true}));
  return server;
}
