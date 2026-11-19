import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {handleCompanyLogoRoute,companyLogoRoute} from "../cloudflare/src/company-logo-settings.js";

const TENANT_A="11111111-2222-4333-8444-555555555555";
const TENANT_B="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const USER_A="11111111-aaaa-4444-bbbb-555555555555";
const USER_B="22222222-aaaa-4444-bbbb-555555555555";
const CSRF="csrf-test-very-long-token-1234567890";
const ORIGIN="https://thebedesk.example";
const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
const put32=(b,at,n)=>{b[at]=(n>>>24)&255;b[at+1]=(n>>>16)&255;b[at+2]=(n>>>8)&255;b[at+3]=n&255};
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=b=>{let c=0xffffffff;for(const n of b)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0};
function chunk(type,bytes){
 const b=new Uint8Array(bytes.length+12);put32(b,0,bytes.length);
 b.set(new TextEncoder().encode(type),4);b.set(bytes,8);put32(b,b.length-4,crc(b.subarray(4,b.length-4)));return b;
}
function png(){
 const w=32,h=24,header=new Uint8Array(13);put32(header,0,w);put32(header,4,h);header[8]=8;header[9]=6;
 const data=new Uint8Array(h*(w*4+1));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=y*(w*4+1)+1+x*4;data[at]=x*7;data[at+1]=y*9;data[at+2]=40;data[at+3]=255}
 const pieces=[signature,chunk("IHDR",header),chunk("IDAT",new Uint8Array(deflateSync(data))),chunk("IEND",new Uint8Array())];
 const buffer=new Uint8Array(pieces.reduce((n,v)=>n+v.length,0));let at=0;
 for(const piece of pieces){buffer.set(piece,at);at+=piece.length}
 return buffer;
}
function fixture(){
 const assets=new Map(),settings=new Map(),objects=new Map(),observed=[];
 const db={prepare(sql){
  return {bind(...args){
   return {
    async first(){
     observed.push({kind:"read",sql,args});
     if(sql.includes("FROM quotation_logo_assets"))return assets.get(args[0]+"/"+args[1])||null;
     if(sql.includes("FROM quotation_logo_settings"))return settings.get(args[0])||null;
     throw Error("unexpected_sql_read");
    },
    async run(){
     observed.push({kind:"write",sql,args});
     if(sql.includes("INSERT INTO quotation_logo_assets")){
      const [id,tenant,key,mime,width,height,ratio]=args;
      assets.set(tenant+"/"+id,{id,tenant_id:tenant,object_key:key,mime_type:mime,width,height,aspect_ratio:ratio});
     }else if(sql.includes("INSERT INTO quotation_logo_settings")){
      const [tenant,asset,x,y,width]=args;
      if(!assets.has(tenant+"/"+asset))throw Error("foreign_key_mismatch");
      settings.set(tenant,{tenant_id:tenant,asset_id:asset,x_percent:x,y_percent:y,width_percent:width});
     }else throw Error("unexpected_sql_write");
     return {success:true,meta:{changes:1}};
    }
   };
  }};
 }};
 const bucket={
  async put(key,bytes){objects.set(key,new Uint8Array(bytes))},
  async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,
   async arrayBuffer(){return bytes.slice().buffer}}:null},
  async delete(key){objects.delete(key)}
 };
 const env={THEBE_COMPANY_LOGO_ENABLED:"true",DB:db,COMPANY_LOGOS:bucket,
  PUBLIC_RATE_LIMITER:{async limit(){return {success:true}}}};
 const session=(tenant=TENANT_A,role="owner",csrf=CSRF,landingPath=null)=>async request=>{
  assert.equal(new URL(request.url).pathname,"/__thebe_api/auth/me");
  const userId=tenant===TENANT_A?USER_A:USER_B;
  return new Response(JSON.stringify({user:{id:userId,tenantId:tenant,role,tenantName:"Synthetic only"},csrfToken:csrf,landingPath}),{
   headers:{"content-type":"application/json"}});
 };
 const request=(path,method="GET",body=undefined,headers={})=>
  new Request(ORIGIN+path,{method,body,headers:{
   cookie:"synthetic_cookie=opaque",...(method!=="GET"?{"origin":ORIGIN,"x-csrf-token":CSRF}:{ }),...headers
  }});
 const call=(req,identity=session())=>handleCompanyLogoRoute({request:req,env,fetchSession:identity});
 return {env,assets,settings,objects,observed,session,request,call};
}

test("route is disabled by default, no auth or storage access",async()=>{
 const f=fixture(),input=f.request("/api/quotation/logo");
 f.env.THEBE_COMPANY_LOGO_ENABLED="false";
 const r=await handleCompanyLogoRoute({request:input,env:f.env,fetchSession:()=>{throw Error("must_not_authenticate")}});
 assert.equal(r.status,404);
 assert.equal(companyLogoRoute("/api/quotation/logo"),true);
 assert.equal(companyLogoRoute("/api/public/marketing"),false);
 const config=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
 assert.match(config,/THEBE_COMPANY_LOGO_ENABLED = "false"/);
 assert.doesNotMatch(config,/^\s*bucket_name\s*=\s*"bw-company-logos-private"/m);
});

test("missing private R2 binding fails closed even with valid session",async()=>{
 const f=fixture();delete f.env.COMPANY_LOGOS;
 const r=await f.call(f.request("/app/settings/company-logo/"));
 assert.equal(r.status,503);
});

test("settings page uses current authenticated tenant, no private data in HTML",async()=>{
 const f=fixture(),r=await f.call(f.request("/app/settings/company-logo/"));
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/Company logo settings/);
 assert.match(html,/company-logo-settings.mjs/);
 assert.match(r.headers.get("content-security-policy"),/frame-ancestors 'none'/);
 assert.doesNotMatch(html,new RegExp(TENANT_A));
 assert.doesNotMatch(html,/csrf-test|__Host-bw_session/);
});

test("unverified, scoped-manager and non-editor sessions are denied",async()=>{
 const f=fixture();
 const lost=await f.call(f.request("/api/quotation/logo"),async()=>new Response("",{status:401}));
 assert.equal(lost.status,401);
 for(const role of ["staff","reviewer","auditor"]){
  const r=await f.call(f.request("/api/quotation/logo"),f.session(TENANT_A,role));
  assert.equal(r.status,403);
 }
 const scoped=await f.call(f.request("/api/quotation/logo"),f.session(TENANT_A,"manager",CSRF,"/manager-invite/dashboard/"));
 assert.equal(scoped.status,403);
 assert.equal(f.observed.length,0);
});

test("CSRF, fetch-site and origin checks deny uploads before R2 writes",async()=>{
 const f=fixture();
 for(const headers of [
  {"x-csrf-token":"invalid-csrf-token"},
  {"origin":"https://evil.example"},
  {"sec-fetch-site":"cross-site"}
 ]){
  const res=await f.call(f.request("/api/quotation/logo/upload","POST",png(),{
   "content-type":"image/png",...headers
  }));
  assert.equal(res.status,403);
 }
 assert.equal(f.objects.size,0);
 assert.equal(f.observed.length,0);
});

test("valid PNG: one business uploads, saves, reloads; second business is isolated",async()=>{
 const f=fixture();
 const upload=await f.call(f.request("/api/quotation/logo/upload","POST",png(),{"content-type":"image/png"}));
 assert.equal(upload.status,201,await upload.clone().text());
 const saved=await upload.json();
 assert.match(saved.logoAssetId,/^[a-f0-9]{32}$/);
 assert.equal(saved.aspectRatio,32/24);
 const put=await f.call(f.request("/api/quotation/logo","PUT",JSON.stringify({
  logoAssetId:saved.logoAssetId,aspectRatio:saved.aspectRatio,
  layout:{xPercent:4,yPercent:2,widthPercent:34}
 }),{"content-type":"application/json"}));
 assert.equal(put.status,200,await put.clone().text());
 const loaded=await f.call(f.request("/api/quotation/logo"));
 assert.equal((await loaded.json()).settings.logoAssetId,saved.logoAssetId);
 const image=await f.call(f.request("/api/quotation/logo/image"));
 assert.equal(image.status,200);
 assert.equal(image.headers.get("content-type"),"image/png");
 assert.ok((await image.arrayBuffer()).byteLength>=32);
 const foreign=await f.call(f.request("/api/quotation/logo?companyId="+TENANT_A),f.session(TENANT_B));
 assert.equal((await foreign.json()).settings,null,"browser companyId claim never selects a different tenant");
 const foreignImage=await f.call(f.request("/api/quotation/logo/image"),f.session(TENANT_B));
 assert.equal(foreignImage.status,404);
 assert.equal(f.settings.size,1);
 assert.ok([...f.objects.keys()].every(k=>k.startsWith("quotation-logos/"+TENANT_A+"/")));
});

test("invalid PNG, unsupported MIME and absent rate limiter fail closed",async()=>{
 const f=fixture();
 let r=await f.call(f.request("/api/quotation/logo/upload","POST",new Uint8Array(64),{"content-type":"image/jpeg"}));
 assert.equal(r.status,415);
 r=await f.call(f.request("/api/quotation/logo/upload","POST",new Uint8Array(64),{"content-type":"image/png"}));
 assert.equal(r.status,400);
 assert.equal(f.objects.size,0);
 delete f.env.PUBLIC_RATE_LIMITER;
 r=await f.call(f.request("/api/quotation/logo/upload","POST",png(),{"content-type":"image/png"}));
 assert.equal(r.status,503);
 assert.equal(f.objects.size,0);
});


test("business navigation is feature-and-bucket gated; static branding links do not expose token",()=>{
 const entry=readFileSync(new URL("../cloudflare/src/production-entry.js",import.meta.url),"utf8");
 const link=readFileSync(new URL("../public/js/company-logo-business-link.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../cloudflare/src/company-logo-settings.js",import.meta.url),"utf8");
 assert.match(entry,/injectCompanyLogoBusinessLink\(repaired\)/);
 assert.match(entry,/THEBE_COMPANY_LOGO_ENABLED==="true"/);
 assert.match(entry,/COMPANY_LOGOS\?\.get/);
 assert.match(link,/businesshub/);
 assert.match(entry,/companyLogoWorkspaceMemberAllowed/);
 assert.doesNotMatch(link,/\bfetch\s*\(/);
 assert.match(link,/company-logo\/"/);
 assert.doesNotMatch(link,/localStorage|sessionStorage/);
 assert.doesNotMatch(html,/document\.cookie|localStorage|sessionStorage/);
 assert.match(html,/\/js\/api-client\.js/);
 const userUi=readFileSync(new URL("../public/js/company-logo-settings.mjs",import.meta.url),"utf8");
 assert.match(userUi,/BW\?\.api\?\.createClient/);
 assert.match(userUi,/client\.requestRaw/);
 assert.doesNotMatch(userUi,/\bfetch\s*\(/);
});


test("direct, shadow and root-tunnel logo uploads normalize without changing credentials or bytes",async()=>{
 const {normalizedCompanyLogoRequest}=await import("../cloudflare/src/production-entry.js");
 const bytes=png();
 const make=(route)=>new Request(ORIGIN+route,{method:"POST",body:bytes,
  headers:{"content-type":"image/png","origin":ORIGIN,"cookie":"test=synthetic",
   "x-csrf-token":CSRF}});
 for(const route of [
  "/api/quotation/logo/upload",
  "/__thebe_api/quotation/logo/upload",
  "/?__thebe_api_path=%2Fapi%2Fquotation%2Flogo%2Fupload"
 ]){
  const converted=normalizedCompanyLogoRequest(make(route));
  assert.equal(new URL(converted.url).pathname,"/api/quotation/logo/upload");
  assert.equal(converted.method,"POST");
  assert.equal(converted.headers.get("origin"),ORIGIN);
  assert.equal(converted.headers.get("x-csrf-token"),CSRF);
  assert.deepEqual(new Uint8Array(await converted.arrayBuffer()),bytes);
 }
 const other=make("/?__thebe_api_path=%2Fapi%2Ffinance%2Ftransfer");
 assert.equal(normalizedCompanyLogoRequest(other),other,"foreign API route not rewritten");
});
