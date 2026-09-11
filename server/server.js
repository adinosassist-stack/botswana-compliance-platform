import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import crypto from "crypto";
import { promisify } from "util";
import pg from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { normalizeHttpsOrigin, requestOriginAllowed as nodeRequestOriginAllowed, fetchMetadataAllowsBrowserMutation as nodeFetchMetadataAllowsBrowserMutation } from "./origin-policy.js";
import { safeNextPath as nodeSafeNextPath } from "./oauth-navigation.js";
import { publicUrlConfig, buildPasswordResetUrl } from "./public-app-url.js";
import { proxyTrustPolicy } from "./proxy-trust.js";
import { nodePreBodyAbuseRule } from "./prebody-abuse.js";
import { rejectEncodedApiBody } from "./request-encoding.js";
import { createOAuthStateCodec } from "./oauth-state.js";
import { createHardenedHttpServer,HTTP_MAX_HEADER_SIZE,HTTP_MAX_HEADERS_COUNT } from "./http-envelope.js";
import { registrationTimingFloor } from "./registration-timing.js";
import { passwordResetTimingFloor } from "./password-reset-timing.js";
import { externalJsonBounded } from "./external-response.js";
import { verifyEvidenceObjectHead } from "./evidence-object-integrity.js";
import { evidenceStagingKey, evidenceCommittedKey, s3CopySource } from "./evidence-object-commit.js";
import { evidenceFileSignatureMatches, boundedS3Prefix } from "./evidence-file-signature.js";

function secretEnv(name){
  const file=process.env[`${name}_FILE`];
  if(file){try{return fs.readFileSync(file,"utf8").trim()}catch(e){console.error(JSON.stringify({level:"fatal",event:"SECRET_FILE_READ_FAILED",name,message:e.message}));process.exit(1)}}
  return process.env[name];
}
const normalizedEnv={...process.env,
  DATABASE_URL:secretEnv("DATABASE_URL"),SESSION_SECRET:secretEnv("SESSION_SECRET"),
  OBJECT_STORE_ACCESS_KEY_ID:secretEnv("OBJECT_STORE_ACCESS_KEY_ID"),OBJECT_STORE_SECRET_ACCESS_KEY:secretEnv("OBJECT_STORE_SECRET_ACCESS_KEY"),
  MALWARE_SCAN_WEBHOOK_SECRET:secretEnv("MALWARE_SCAN_WEBHOOK_SECRET"),
  RETENTION_JOB_SECRET:secretEnv("RETENTION_JOB_SECRET"),TURNSTILE_SECRET_KEY:secretEnv("TURNSTILE_SECRET_KEY")
};
const envSchema=z.object({
  APP_ENV:z.enum(["development","test","production"]).default("development"),
  DATABASE_URL:z.string().min(1),
  SESSION_SECRET:z.string().min(32),
  PUBLIC_ORIGIN:z.string().url().optional(),
  PUBLIC_APP_URL:z.string().url().optional(),
  TRUST_PROXY_HOPS:z.enum(["0","1","2","3"]).default("0"),
  SESSION_TTL_HOURS:z.coerce.number().int().min(1).max(168).default(12),
  OBJECT_STORE_BUCKET:z.string().min(1).optional(),
  OBJECT_STORE_ACCESS_KEY_ID:z.string().min(1).optional(),
  OBJECT_STORE_SECRET_ACCESS_KEY:z.string().min(1).optional(),
  OBJECT_STORE_REGION:z.string().default("auto"),
  OBJECT_STORE_ENDPOINT:z.string().url().optional(),
  MALWARE_SCAN_REQUIRED:z.enum(["true","false"]).default("false").transform(v=>v==="true"),
  MALWARE_SCAN_WEBHOOK_URL:z.string().url().optional(),
  MALWARE_SCAN_WEBHOOK_SECRET:z.string().min(32).optional(),
  RETENTION_JOB_SECRET:z.string().min(32).optional(),
  TURNSTILE_SITE_KEY:z.string().min(10).max(128).optional(),
  TURNSTILE_SECRET_KEY:z.string().min(20).max(256).optional(),
  TRIAL_DAYS:z.coerce.number().int().min(1).max(90).default(14),
  PORT:z.coerce.number().int().min(1).max(65535).default(3000)
});
const envParsed=envSchema.safeParse(normalizedEnv);
if(!envParsed.success){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",issues:envParsed.error.issues}));process.exit(1)}
const config=envParsed.data;
if(config.APP_ENV==="production"&&!config.PUBLIC_ORIGIN){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"PUBLIC_ORIGIN required in production"}));process.exit(1)}
if(config.APP_ENV==="production"&&!secureHttpsUrl(config.PUBLIC_ORIGIN)){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"PUBLIC_ORIGIN must be HTTPS in production"}));process.exit(1)}
const publicUrls=publicUrlConfig(config.PUBLIC_ORIGIN,config.PUBLIC_APP_URL);
const proxyTrust=proxyTrustPolicy(config.TRUST_PROXY_HOPS);
if(config.APP_ENV==="production"&&!publicUrls.ok){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"PUBLIC_APP_URL must be HTTPS, credential-free and share PUBLIC_ORIGIN"}));process.exit(1)}
const objectStoreValues=[config.OBJECT_STORE_BUCKET,config.OBJECT_STORE_ACCESS_KEY_ID,config.OBJECT_STORE_SECRET_ACCESS_KEY];
if(objectStoreValues.some(Boolean)&&!objectStoreValues.every(Boolean)){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"Object storage configuration is incomplete"}));process.exit(1)}
if(config.APP_ENV==="production"&&!objectStoreValues.every(Boolean)){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"Private object storage required in production"}));process.exit(1)}
if(config.APP_ENV==="production"&&!config.MALWARE_SCAN_REQUIRED){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"MALWARE_SCAN_REQUIRED must be true in production"}));process.exit(1)}
if(config.APP_ENV==="production"&&config.MALWARE_SCAN_REQUIRED&&(!safeExternalServiceUrl(config.MALWARE_SCAN_WEBHOOK_URL)||!config.MALWARE_SCAN_WEBHOOK_SECRET)){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"Public HTTPS malware scanner URL and secret required when MALWARE_SCAN_REQUIRED=true"}));process.exit(1)}
function strongConfiguredSecret(v,min=32){const x=String(v||"");return x.length>=min&&!/replace|example|changeme|placeholder/i.test(x)}
if(config.APP_ENV==="production"&&!strongConfiguredSecret(config.RETENTION_JOB_SECRET,32)){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"RETENTION_JOB_SECRET must be a production-strength secret (32+ characters)"}));process.exit(1)}
if(config.APP_ENV==="production"&&(!config.TURNSTILE_SITE_KEY||!strongConfiguredSecret(config.TURNSTILE_SECRET_KEY,20))){console.error(JSON.stringify({level:"fatal",event:"ENV_VALIDATION_FAILED",message:"TURNSTILE_SITE_KEY and production Turnstile secret are required"}));process.exit(1)}
function log(level,event,data={}){console.log(JSON.stringify({ts:new Date().toISOString(),level,event,...data}))}
async function externalFetch(url,options={},timeoutMs=20000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Math.min(60000,Number(timeoutMs)||20000)));
  try{return await fetch(url,{...options,signal:controller.signal,redirect:"error"})}finally{clearTimeout(timer)}
}
function secureHttpsUrl(value){const origin=normalizeHttpsOrigin(value);return origin?new URL(origin):null}
function unsafeServiceHostname(value){
  const h=String(value||"").toLowerCase().replace(/^\[|\]$/g,"");
  if(!h||h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".lan"))return true;
  const m=h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(m){const o=m.slice(1).map(Number);if(o.some(x=>x>255))return true;const [a,b]=o;return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===198&&(b===18||b===19))||a>=224;}
  if(h.includes(":"))return h==="::"||h==="::1"||/^f[cd]/.test(h)||/^fe[89ab]/.test(h);
  return false;
}
function safeExternalServiceUrl(value){
  try{const u=new URL(String(value||"").trim());if(u.protocol!=="https:"||u.username||u.password||u.origin==="null"||unsafeServiceHostname(u.hostname))return null;u.hash="";return u;}catch{return null}
}
const APP_VERSION="1.21.101";
const EXPECTED_NODE_MIGRATION="031_v78_durable_auth_rate_limit.sql";
const metrics={startedAt:Date.now(),requests:0,errors:0,authFailures:0,uploadsAuthorized:0,scanJobs:0,scanClean:0,scanInfected:0,subscriptionBlocks:0};
const { Pool }=pg;const scrypt=promisify(crypto.scrypt);const pool=new Pool({connectionString:config.DATABASE_URL,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,statement_timeout:15000});
const app=express();const __dirname=path.dirname(fileURLToPath(import.meta.url));const publicDir=path.resolve(__dirname,"../public");const isProd=config.APP_ENV==="production";
const oauthStateCodec=createOAuthStateCodec(config.SESSION_SECRET);
function inlineScriptHashes(){
  const shell=fs.readFileSync(path.join(publicDir,"index.html"),"utf8"),hashes=[];
  for(const match of shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const attrs=match[1]||"",body=match[2]||"";
    if(/\bsrc\s*=/.test(attrs)||/\btype=["']application\/ld\+json["']/i.test(attrs)||!body.trim())continue;
    hashes.push(`'sha256-${crypto.createHash("sha256").update(body).digest("base64")}'`);
  }
  return [...new Set(hashes)];
}
const INLINE_SCRIPT_HASHES=inlineScriptHashes();
app.disable("x-powered-by");app.set("trust proxy",proxyTrust.expressValue);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","https://challenges.cloudflare.com",...INLINE_SCRIPT_HASHES],scriptSrcElem:["'self'","https://challenges.cloudflare.com",...INLINE_SCRIPT_HASHES],scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"],connectSrc:["'self'","https://challenges.cloudflare.com",config.OBJECT_STORE_ENDPOINT||"'self'"],frameSrc:["https://challenges.cloudflare.com"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}},referrerPolicy:{policy:"no-referrer"},crossOriginEmbedderPolicy:false}));
app.use(cookieParser());
app.use(rateLimit({windowMs:60_000,limit:180,standardHeaders:"draft-8",legacyHeaders:false}));const authLimiter=rateLimit({windowMs:15*60_000,limit:12,standardHeaders:"draft-8",legacyHeaders:false,skipSuccessfulRequests:true});const passwordResetRequestLimiter=rateLimit({windowMs:15*60_000,limit:5,standardHeaders:"draft-8",legacyHeaders:false});const passwordResetCompleteLimiter=rateLimit({windowMs:15*60_000,limit:12,standardHeaders:"draft-8",legacyHeaders:false});
const preBodyJsonParsers=new Map([[4*1024,express.json({limit:"4kb",inflate:false})],[8*1024,express.json({limit:"8kb",inflate:false})],[16*1024,express.json({limit:"16kb",inflate:false})]]);
app.use((req,res,next)=>{if(rejectEncodedApiBody(req.method,req.path,req.headers["content-encoding"]))return res.status(415).json({error:"unsupported_content_encoding"});next()});
app.use(async(req,res,next)=>{
  const rule=nodePreBodyAbuseRule(req.method,req.path);if(!rule)return next();
  if(rule.originProtected&&(!nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])||!nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN)))return res.status(403).json({error:"origin_failed"});
  try{const budget=await consumeDurableAuthBudget(rule.scope,req.ip||"unknown",rule.limit,rule.windowSeconds);if(!budget.allowed)return durableRateLimited(res,budget)}catch(e){return next(e)}
  const parser=preBodyJsonParsers.get(rule.maxBodyBytes);return parser?parser(req,res,next):next();
});
app.use(express.json({limit:"1mb",inflate:false}));
app.use((req,res,next)=>{req.requestId=crypto.randomUUID();req.startedAt=process.hrtime.bigint();metrics.requests++;res.setHeader("X-Request-ID",req.requestId);res.setHeader("Cache-Control",req.path.startsWith("/api/")?"no-store":"public, max-age=300");res.on("finish",()=>{const ms=Number(process.hrtime.bigint()-req.startedAt)/1e6;log("info","HTTP_REQUEST",{requestId:req.requestId,method:req.method,path:req.path,status:res.statusCode,durationMs:Number(ms.toFixed(1)),tenantId:req.auth?.tenant_id||null,userId:req.auth?.user_id||null})});next()});

const emailSchema=z.string().email().max(254).transform(s=>s.trim().toLowerCase());
const passwordSchema=z.string().min(12).max(200);
const authSchema=z.object({email:emailSchema,password:passwordSchema});
const planSchema=z.enum(["starter","business","pro"]);
const registerSchema=authSchema.extend({companyName:z.string().trim().min(2).max(160),plan:planSchema.default("business"),turnstileToken:z.string().max(2048).optional()});
const resetCompleteSchema=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:passwordSchema});
const stateSchema=z.object({state:z.record(z.any()),version:z.number().int().positive()});
const auditSchema=z.object({eventType:z.string().regex(/^[A-Z0-9_]{1,80}$/),companyId:z.string().max(120).nullable().optional(),eventData:z.record(z.any()).default({})});
const evidenceSchema=z.object({companyId:z.string().min(1).max(120),filename:z.string().min(1).max(180),contentType:z.string().min(1).max(120),size:z.number().int().positive().max(15*1024*1024),displayName:z.string().min(1).max(180),category:z.string().min(1).max(80),reviewDate:z.string().nullable().optional()});
const evidenceCompleteSchema=z.object({size:z.number().int().positive().max(15*1024*1024).optional()});
const scanResultSchema=z.object({evidenceId:z.string().uuid(),scanJobId:z.string().uuid(),status:z.enum(["clean","infected","error"]),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),details:z.string().max(500).optional()}).superRefine((v,ctx)=>{if((v.status==="clean"||v.status==="infected")&&!v.sha256)ctx.addIssue({code:z.ZodIssueCode.custom,path:["sha256"],message:"sha256_required_for_scan_verdict"})});
const allowedTypes=new Set(["application/pdf","image/png","image/jpeg","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

function parseCookies(h=""){return Object.fromEntries(h.split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}
function sha256(s){return crypto.createHash("sha256").update(s).digest("hex")}
function sessionHash(s){return crypto.createHmac("sha256",config.SESSION_SECRET).update(s).digest("hex")}
function authRateKey(scope,material){return crypto.createHmac("sha256",config.SESSION_SECRET+"|node-auth-rate-v1").update(`${scope}|${String(material||"")}`).digest("hex")}
let durableAuthRateOps=0;
async function consumeDurableAuthBudget(scope,material,limit,windowSeconds){
  const safeLimit=Math.max(1,Math.min(1000,Number(limit)||1)),safeWindow=Math.max(60,Math.min(86400,Number(windowSeconds)||900)),keyHash=authRateKey(scope,material);
  const q=await pool.query(`INSERT INTO auth_rate_limits(scope,key_hash,window_start,attempts,updated_at) VALUES($1,$2,now(),1,now())
    ON CONFLICT(scope,key_hash) DO UPDATE SET
      window_start=CASE WHEN auth_rate_limits.window_start<=now()-($3::int*interval '1 second') THEN now() ELSE auth_rate_limits.window_start END,
      attempts=CASE WHEN auth_rate_limits.window_start<=now()-($3::int*interval '1 second') THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,$4::int+1) END,
      updated_at=now()
    RETURNING attempts,GREATEST(1,CEIL(EXTRACT(EPOCH FROM (window_start+($3::int*interval '1 second')-now()))))::int retry_after`,[scope,keyHash,safeWindow,safeLimit]);
  if((++durableAuthRateOps%100)===0)pool.query("delete from auth_rate_limits where window_start<now()-interval '1 day'").catch(()=>{});
  const row=q.rows[0]||{attempts:safeLimit+1,retry_after:safeWindow};return {allowed:Number(row.attempts)<=safeLimit,retryAfter:Math.max(1,Number(row.retry_after)||safeWindow)};
}
function durableRateLimited(res,budget){res.setHeader("Retry-After",String(budget.retryAfter));return res.status(429).json({error:"too_many_attempts",retryAfterSeconds:budget.retryAfter})}
async function verifyTurnstileRegistration(req,token){
  if(!isProd&&!config.TURNSTILE_SECRET_KEY)return true;
  const supplied=String(token||"");if(!config.TURNSTILE_SECRET_KEY||!supplied||supplied.length>2048)return false;
  try{
    const r=await externalFetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({secret:config.TURNSTILE_SECRET_KEY,response:supplied,remoteip:String(req.ip||"")})},10000);
    if(!r.ok)return false;const result=await externalJsonBounded(r,128*1024);const expectedHost=secureHttpsUrl(config.PUBLIC_ORIGIN)?.hostname||"";
    return result?.success===true&&result?.action==="register"&&!!expectedHost&&String(result?.hostname||"").toLowerCase()===expectedHost.toLowerCase();
  }catch{return false}
}
async function retentionSecretAuthorized(req,res){
  const ipBudget=await consumeDurableAuthBudget("retention_secret_ip",req.ip||"unknown",12,900);if(!ipBudget.allowed){durableRateLimited(res,ipBudget);return false}
  const globalBudget=await consumeDurableAuthBudget("retention_secret_global","platform",30,900);if(!globalBudget.allowed){durableRateLimited(res,globalBudget);return false}
  const expected=String(config.RETENTION_JOB_SECRET||""),supplied=String(req.get("x-retention-secret")||"");
  if(!strongConfiguredSecret(expected,32)||!timingSafeTextEqual(supplied,expected)){res.status(401).json({error:"unauthorized"});return false}
  return true;
}
function scanSignature(id,jobId,status,sha=""){return crypto.createHmac("sha256",config.MALWARE_SCAN_WEBHOOK_SECRET||config.SESSION_SECRET).update(`${id}:${jobId}:${status}:${sha}`).digest("hex")}
async function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){const key=await scrypt(password,salt,64);return {salt,hash:Buffer.from(key).toString("hex")}}
async function verifyPassword(password,salt,expected){const key=Buffer.from(await scrypt(password,salt,64));const exp=Buffer.from(expected,"hex");return key.length===exp.length&&crypto.timingSafeEqual(key,exp)}
const DUMMY_PASSWORD={salt:"f61e391097bcd6de8c88ff9d799522ab",hash:"6f0f3b7782f7dc98a2f34f7016f256b9d5f2d08e828e6109505a668259256c9432b67db4b4460f477b63c7f6db8a574b543978ab27e050ca2fdfd23403632453"};
const SESSION_COOKIE=isProd?"__Host-bwcos_session":"bwcos_session";
function sessionCookie(token,maxAge){return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${isProd?" Secure;":""}`}
async function createSession(client,userId,tenantId){const token=crypto.randomBytes(32).toString("base64url"),csrf=crypto.randomBytes(24).toString("base64url"),hours=config.SESSION_TTL_HOURS,expires=new Date(Date.now()+hours*3600000);const q=await client.query("insert into sessions(token_hash,user_id,tenant_id,session_generation,csrf_token,expires_at,last_seen_at) select $1,$2,$3,session_generation,$4,$5,now() from users where id=$2 returning session_generation",[sessionHash(token),userId,tenantId,csrf,expires]);if(!q.rowCount)throw new Error("session_user_not_found");return {token,csrf,maxAge:hours*3600}}
async function createPasswordSession(client,userId,tenantId,expectedSalt,expectedHash,expectedGeneration){const token=crypto.randomBytes(32).toString("base64url"),csrf=crypto.randomBytes(24).toString("base64url"),hours=config.SESSION_TTL_HOURS,expires=new Date(Date.now()+hours*3600000);const q=await client.query("insert into sessions(token_hash,user_id,tenant_id,session_generation,csrf_token,expires_at,last_seen_at) select $1,$2,$3,session_generation,$4,$5,now() from users where id=$2 and password_salt=$6 and password_hash=$7 and session_generation=$8 and exists(select 1 from memberships where user_id=$2 and tenant_id=$3 and status='active') returning session_generation",[sessionHash(token),userId,tenantId,csrf,expires,expectedSalt,expectedHash,expectedGeneration]);if(!q.rowCount)return null;return {token,csrf,maxAge:hours*3600}}
async function audit(client,{tenantId,userId,eventType,companyId=null,requestId,eventData={}}){await client.query("insert into audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id_text,request_id,event_data) values($1,$2,$3,$4,$5,$6,$7)",[tenantId,userId,eventType,companyId?"company":null,companyId,requestId,eventData])}

async function loadSessionAuth(req){
  const token=parseCookies(req.headers.cookie)[SESSION_COOKIE];if(!token)return null;
  const q=await pool.query(`select s.id,s.user_id,s.tenant_id,s.csrf_token,s.last_seen_at,s.expires_at,u.email,m.role,t.name tenant_name from sessions s join users u on u.id=s.user_id join memberships m on m.user_id=s.user_id and m.tenant_id=s.tenant_id and m.status='active' join tenants t on t.id=s.tenant_id where s.token_hash=$1 and s.session_generation=u.session_generation and s.revoked_at is null and s.expires_at>now()`,[sessionHash(token)]);
  if(!q.rowCount)return null;const row=q.rows[0],lastSeenMs=new Date(row.last_seen_at||0).getTime();if(!Number.isFinite(lastSeenMs)||Date.now()-lastSeenMs>=15*60*1000){await pool.query("update sessions set last_seen_at=now() where id=$1 and (last_seen_at is null or last_seen_at<now()-interval '15 minutes')",[row.id]).catch(()=>{})}return {...row,userId:row.user_id,tenantId:row.tenant_id};
}
function timingSafeTextEqual(a,b){const aa=Buffer.from(String(a||"")),bb=Buffer.from(String(b||""));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
async function auth(req,res,next){try{req.auth=await loadSessionAuth(req);if(!req.auth)return res.status(401).json({error:"unauthenticated"});if(!["GET","HEAD","OPTIONS"].includes(req.method)){if(!nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])||!nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN))return res.status(403).json({error:"origin_failed"});if(!timingSafeTextEqual(req.headers["x-csrf-token"],req.auth.csrf_token))return res.status(403).json({error:"csrf_failed"})}next()}catch(e){next(e)}}
function roles(...r){return(req,res,next)=>r.includes(req.auth?.role)?next():res.status(403).json({error:"forbidden"})}
function preAuthOrigin(req,res,next){return nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])&&nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN)?next():res.status(403).json({error:"origin_failed"})}
function requireRole(...allowed){return [auth,roles(...allowed)]}
function projectWorkspaceStateForRole(input,role){const state=input&&typeof input==="object"?input:{};if(role==="owner")return state;if(role==="manager"){const companies=Array.isArray(state.companies)?state.companies.map(c=>{const p={...(c?.profile||{})};delete p.annualTaxableSupplies;delete p.highestMonthlyEmployeePay;return {...c,profile:p}}):[];return {...state,activeRole:"manager",companies,audit:[]}}if(role!=="reviewer"&&role!=="auditor")return {activeCompanyId:null,activeRole:role||null,companies:[],audit:[]};const companies=Array.isArray(state.companies)?state.companies.map(c=>{const p={...(c?.profile||{})};delete p.turnover;delete p.annualTaxableSupplies;delete p.highestMonthlyEmployeePay;const evidence=Array.isArray(c?.evidence)?c.evidence.map(e=>({id:e?.id||null,name:e?.name||"",cat:e?.cat||"",date:e?.date||"",verified:!!e?.verified,fileUploaded:!!e?.fileUploaded,serverEvidenceId:e?.serverEvidenceId||null})):[];const reviews=role==="reviewer"&&Array.isArray(c?.reviews)?c.reviews.map(r=>({id:r?.id||null,type:r?.type||"",issue:r?.issue||"",risk:r?.risk||"",status:r?.status||"",note:r?.note||"",createdAt:r?.createdAt||null,autoKey:r?.autoKey||null})):[];return {id:c?.id||null,profile:p,evidence,completed:c?.completed||{},reviews,cases:[],employees:[],fixedTerms:[],privacy:{controls:{},activities:[]},bwReadiness:{}}}):[];return {activeCompanyId:state.activeCompanyId||companies[0]?.id||null,activeRole:role,companies,audit:[]}}
async function requireEntitlement(req,res,next){try{const q=await pool.query("select status,trial_ends_at,current_period_ends_at,plan from subscriptions where tenant_id=$1",[req.auth.tenant_id]);const row=q.rows[0];const now=Date.now(),trialOk=row?.status==="trialing"&&new Date(row.trial_ends_at).getTime()>now,active=row?.status==="active"&&(row.current_period_ends_at===null||new Date(row.current_period_ends_at).getTime()>now);if(active||trialOk)return next();metrics.subscriptionBlocks++;return res.status(402).json({error:"subscription_required",status:row?.status||"missing"})}catch(e){next(e)}}

app.get("/api/live",(req,res)=>res.json({ok:true,service:"bw-compliance-os",version:APP_VERSION,uptimeSec:Math.floor(process.uptime()),requestId:req.requestId}));

const OAUTH_PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    scopes: "openid email profile"
  },
  facebook: {
    authorizeUrl: `https://www.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION||"v23.0"}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION||"v23.0"}/oauth/access_token`,
    userInfoUrl: `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION||"v23.0"}/me?fields=id,name,email`,
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI,
    scopes: "email,public_profile"
  }
};

function mergeManagerWorkspaceState(current,incoming){
  const base=current&&typeof current==="object"?current:{},next=incoming&&typeof incoming==="object"?incoming:{};
  const currentCompanies=Array.isArray(base.companies)?base.companies:[],incomingById=new Map((Array.isArray(next.companies)?next.companies:[]).map(c=>[String(c?.id||""),c]));
  const companies=currentCompanies.map(existing=>{const incomingCompany=incomingById.get(String(existing?.id||""));if(!incomingCompany)return existing;const existingProfile=existing?.profile&&typeof existing.profile==="object"?existing.profile:{},incomingProfile=incomingCompany?.profile&&typeof incomingCompany.profile==="object"?incomingCompany.profile:{};return {...existing,...incomingCompany,id:existing.id,profile:{...existingProfile,employees:Number.isFinite(Number(incomingProfile.employees))?Math.max(0,Number(incomingProfile.employees)):existingProfile.employees}}});
  const requestedActive=String(next.activeCompanyId||""),activeCompanyId=companies.some(c=>String(c.id)===requestedActive)?requestedActive:(base.activeCompanyId||companies[0]?.id||null);
  return {...base,activeCompanyId,activeRole:base.activeRole||"owner",companies,audit:Array.isArray(base.audit)?base.audit:[]};
}
function nodeValidOauthRedirectUri(provider,value){
  const origin=secureHttpsUrl(config.PUBLIC_ORIGIN);if(!origin)return null;
  try{
    const u=new URL(String(value||"").trim()),expectedPath=`/api/auth/oauth/${provider}/callback`;
    if(u.protocol!=="https:"||u.username||u.password||u.origin!==origin.origin)return null;
    if(u.pathname!==expectedPath||u.search||u.hash)return null;
    return u.href;
  }catch{return null}
}
function oauthConfig(provider){
  const cfg=OAUTH_PROVIDERS[provider];
  if(!cfg?.clientId || !cfg?.clientSecret || !cfg?.redirectUri) return null;
  if(isProd){
    const redirectUri=nodeValidOauthRedirectUri(provider,cfg.redirectUri);
    if(!redirectUri)return null;
    return {...cfg,redirectUri};
  }
  return cfg;
}
function oauthStateCookieName(provider){return isProd?`__Host-bw_oauth_state_${provider}`:`oauth_state_${provider}`;}
function oauthCookieOptions(){
  return {httpOnly:true,secure:isProd,sameSite:"lax",maxAge:10*60*1000,path:"/"};
}
function clearOauthStateCookie(res,provider){const o=oauthCookieOptions();delete o.maxAge;res.clearCookie(oauthStateCookieName(provider),o);}
function encodeState(payload){return oauthStateCodec.encode(payload)}
function decodeState(state){return oauthStateCodec.decode(state)}
async function claimExternalIdentity(client,{provider,providerId,userId,email}){
  const claimed=await client.query(
    `insert into external_identities(provider,provider_user_id,user_id,email)
     values($1,$2,$3,$4)
     on conflict(provider,provider_user_id) do update
       set email=excluded.email,updated_at=now()
       where external_identities.user_id=excluded.user_id
     returning user_id`,
    [provider,providerId,userId,email]
  );
  if(claimed.rowCount&&String(claimed.rows[0].user_id)===String(userId))return {ok:true,userId};
  const owner=await client.query("select user_id from external_identities where provider=$1 and provider_user_id=$2 limit 1",[provider,providerId]);
  return {ok:false,ownerUserId:owner.rows[0]?.user_id||null};
}
async function exchangeOAuthCode(provider,code){
  const cfg=oauthConfig(provider); if(!cfg) throw new Error("oauth_not_configured");
  if(provider==="google"){
    const body=new URLSearchParams({
      code,client_id:cfg.clientId,client_secret:cfg.clientSecret,
      redirect_uri:cfg.redirectUri,grant_type:"authorization_code"
    });
    const r=await externalFetch(cfg.tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
    if(!r.ok) throw new Error("oauth_token_exchange_failed");
    return await externalJsonBounded(r,128*1024);
  }
  const u=new URL(cfg.tokenUrl);
  u.searchParams.set("client_id",cfg.clientId);u.searchParams.set("client_secret",cfg.clientSecret);
  u.searchParams.set("redirect_uri",cfg.redirectUri);u.searchParams.set("code",code);
  const r=await externalFetch(u);if(!r.ok) throw new Error("oauth_token_exchange_failed");
  return await externalJsonBounded(r,128*1024);
}
async function fetchOAuthProfile(provider,tokens){
  const cfg=oauthConfig(provider); if(!cfg) throw new Error("oauth_not_configured");
  const headers={Authorization:`Bearer ${tokens.access_token}`};
  const r=await externalFetch(cfg.userInfoUrl,{headers});
  if(!r.ok) throw new Error("oauth_profile_failed");
  const p=await externalJsonBounded(r,128*1024);
  if(provider==="google") return {providerId:p.sub,email:p.email,name:p.name||p.email,emailVerified:!!p.email_verified};
  return {providerId:p.id,email:p.email||null,name:p.name||p.email||"Facebook User",emailVerified:!!p.email};
}

app.get("/api/health",async(req,res)=>{try{await pool.query("select 1");res.json({ok:true,db:true,version:APP_VERSION,requestId:req.requestId})}catch(e){res.status(503).json({ok:false,db:false,requestId:req.requestId})}});
app.get("/api/auth/anti-bot-config",(_req,res)=>res.json({provider:"turnstile",siteKey:config.TURNSTILE_SITE_KEY||"",action:"register",required:isProd}));
app.get("/api/ready",async(req,res)=>{try{const [q,migration]=await Promise.all([pool.query("select count(*)::int count from schema_migrations"),pool.query("select 1 from schema_migrations where version=$1",[EXPECTED_NODE_MIGRATION])]);const storageConfigured=objectStoreValues.every(Boolean),scannerRequired=config.MALWARE_SCAN_REQUIRED,scannerConfigured=scannerRequired&&!!(safeExternalServiceUrl(config.MALWARE_SCAN_WEBHOOK_URL)&&config.MALWARE_SCAN_WEBHOOK_SECRET),publicUrlsReady=publicUrlConfig(config.PUBLIC_ORIGIN,config.PUBLIC_APP_URL).ok;if(!migration.rowCount)return res.status(503).json({ok:false,ready:false,reason:"schema_migration_missing",expectedMigration:EXPECTED_NODE_MIGRATION,requestId:req.requestId});if(isProd&&!storageConfigured)return res.status(503).json({ok:false,ready:false,reason:"object_storage_not_configured",requestId:req.requestId});if(isProd&&!scannerRequired)return res.status(503).json({ok:false,ready:false,reason:"malware_scanning_must_be_enabled",requestId:req.requestId});if(isProd&&!scannerConfigured)return res.status(503).json({ok:false,ready:false,reason:"malware_scanner_not_configured",requestId:req.requestId});if(isProd&&!publicUrlsReady)return res.status(503).json({ok:false,ready:false,reason:"public_url_configuration_invalid",requestId:req.requestId});res.json({ok:true,ready:true,migrations:q.rows[0].count,expectedMigration:EXPECTED_NODE_MIGRATION,storageConfigured,scannerRequired,scannerConfigured,publicUrlsReady,proxyTrustHops:proxyTrust.hops,requestId:req.requestId})}catch(e){res.status(503).json({ok:false,ready:false,reason:"database_or_migration_unavailable",requestId:req.requestId})}});
app.post("/api/auth/register",preAuthOrigin,authLimiter,async(req,res,next)=>{
  const p=registerSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"invalid_registration"});
  try{
    const ipBudget=await consumeDurableAuthBudget("register_ip",req.ip||"unknown",20,3600);if(!ipBudget.allowed)return durableRateLimited(res,ipBudget);
    const globalBudget=await consumeDurableAuthBudget("register_global","platform",100,3600);if(!globalBudget.allowed)return durableRateLimited(res,globalBudget);
    const accountBudget=await consumeDurableAuthBudget("register_account",p.data.email,5,3600);if(!accountBudget.allowed)return durableRateLimited(res,accountBudget);
    if(!(await verifyTurnstileRegistration(req,p.data.turnstileToken)))return res.status(403).json({error:"human_verification_failed"});
  }catch(e){return next(e)}
  const generic={ok:true,message:"Registration received. Sign in with this email to continue if the account is ready."},registrationStartedAt=Date.now();
  const ph=await hashPassword(p.data.password);
  const c=await pool.connect();try{await c.query("begin");const exists=await c.query("select 1 from users where email=$1",[p.data.email]);if(exists.rowCount){await c.query("rollback");await registrationTimingFloor(registrationStartedAt);return res.status(202).json(generic)}const u=await c.query("insert into users(email,password_salt,password_hash) values($1,$2,$3) returning id,email",[p.data.email,ph.salt,ph.hash]);const tnt=await c.query("insert into tenants(name) values($1) returning id,name",[p.data.companyName]);await c.query("insert into memberships(tenant_id,user_id,role) values($1,$2,'owner')",[tnt.rows[0].id,u.rows[0].id]);await c.query("insert into app_state(tenant_id,state) values($1,'{}'::jsonb)",[tnt.rows[0].id]);await c.query("insert into subscriptions(tenant_id,status,trial_ends_at,plan) values($1,'trialing',now()+($2::text||' days')::interval,$3)",[tnt.rows[0].id,config.TRIAL_DAYS,p.data.plan]);await audit(c,{tenantId:tnt.rows[0].id,userId:u.rows[0].id,eventType:"ACCOUNT_REGISTERED",requestId:req.requestId,eventData:{email:p.data.email,antiAutomation:"turnstile",timingEqualized:true}});await c.query("commit");await registrationTimingFloor(registrationStartedAt);return res.status(202).json(generic)}catch(e){await c.query("rollback");if(String(e?.code||"")==="23505"){await registrationTimingFloor(registrationStartedAt);return res.status(202).json(generic)}next(e)}finally{c.release()}
});
app.post("/api/auth/login",preAuthOrigin,authLimiter,async(req,res,next)=>{const p=authSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"invalid_credentials"});try{const ipBudget=await consumeDurableAuthBudget("login_ip",req.ip||"unknown",30,900);if(!ipBudget.allowed)return durableRateLimited(res,ipBudget);const accountBudget=await consumeDurableAuthBudget("login_account",p.data.email,12,900);if(!accountBudget.allowed)return durableRateLimited(res,accountBudget);const q=await pool.query(`select u.id,u.email,u.password_salt,u.password_hash,u.session_generation,m.tenant_id,m.role,t.name tenant_name from users u join memberships m on m.user_id=u.id join tenants t on t.id=m.tenant_id where u.email=$1 and m.status='active' order by case m.role when 'owner' then 1 else 2 end limit 1`,[p.data.email]);const row=q.rows[0];const valid=await verifyPassword(p.data.password,row?.password_salt||DUMMY_PASSWORD.salt,row?.password_hash||DUMMY_PASSWORD.hash);if(!row||!valid){metrics.authFailures++;return res.status(401).json({error:"invalid_credentials"})};const s=await createPasswordSession(pool,row.id,row.tenant_id,row.password_salt,row.password_hash,row.session_generation);if(!s){metrics.authFailures++;return res.status(401).json({error:"invalid_credentials"})}await audit(pool,{tenantId:row.tenant_id,userId:row.id,eventType:"LOGIN",requestId:req.requestId});res.setHeader("Set-Cookie",sessionCookie(s.token,s.maxAge));res.json({csrfToken:s.csrf,user:{email:row.email,role:row.role,tenantName:row.tenant_name}})}catch(e){next(e)}});
const PASSWORD_RESET_GENERIC={ok:true,message:"If that account exists, reset instructions have been sent."};
app.post("/api/auth/password-reset/request",preAuthOrigin,passwordResetRequestLimiter,async(req,res,next)=>{
  const passwordResetStartedAt=Date.now();
  try{
    const ipBudget=await consumeDurableAuthBudget("password_reset_request_ip",req.ip||"unknown",30,3600);if(!ipBudget.allowed){res.setHeader("Retry-After",String(ipBudget.retryAfter));await passwordResetTimingFloor(passwordResetStartedAt);return res.json(PASSWORD_RESET_GENERIC)}
    const emailParsed=emailSchema.safeParse(String(req.body?.email||"").trim().toLowerCase());
    if(!emailParsed.success){await passwordResetTimingFloor(passwordResetStartedAt);return res.json(PASSWORD_RESET_GENERIC)}
    const accountBudget=await consumeDurableAuthBudget("password_reset_request_account",emailParsed.data,6,3600);if(!accountBudget.allowed){await passwordResetTimingFloor(passwordResetStartedAt);return res.json(PASSWORD_RESET_GENERIC)}
    const user=await pool.query("select id,email from users where email=$1 limit 1",[emailParsed.data]);
    if(!user.rowCount){await passwordResetTimingFloor(passwordResetStartedAt);return res.json(PASSWORD_RESET_GENERIC)}
    const row=user.rows[0],recent=await pool.query("select count(*)::int n from password_reset_tokens where user_id=$1 and created_at>now()-interval '1 hour'",[row.id]);
    if(Number(recent.rows[0]?.n||0)>=6){await passwordResetTimingFloor(passwordResetStartedAt);return res.json(PASSWORD_RESET_GENERIC)}
    const raw=crypto.randomBytes(32).toString("base64url"),tokenHash=sessionHash(raw);
    const created=await pool.query("insert into password_reset_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '30 minutes') returning id",[row.id,tokenHash]);
    const resetUrl=buildPasswordResetUrl(config.PUBLIC_APP_URL,raw);
    setImmediate(()=>{void (async()=>{
      let delivered=false;
      if(resetUrl){try{await sendTransactionalEmail({to:row.email,subject:"Reset your Thebe Desk password",text:`We received a request to reset your password. Use this secure link within 30 minutes: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`});delivered=true}catch{}}
      if(!delivered)await pool.query("update password_reset_tokens set used_at=now() where id=$1 and used_at is null",[created.rows[0].id]);
    })().catch(()=>{})});
    await passwordResetTimingFloor(passwordResetStartedAt);
    return res.json(PASSWORD_RESET_GENERIC);
  }catch(e){next(e)}
});
app.post("/api/auth/password-reset/complete",preAuthOrigin,passwordResetCompleteLimiter,async(req,res,next)=>{
  const parsed=resetCompleteSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"invalid_reset"});
  const tokenHash=sessionHash(parsed.data.token);
  try{
    const ipBudget=await consumeDurableAuthBudget("password_reset_complete_ip",req.ip||"unknown",60,900);if(!ipBudget.allowed)return durableRateLimited(res,ipBudget);
    const eligible=await pool.query("select user_id from password_reset_tokens where token_hash=$1 and used_at is null and expires_at>now() limit 1",[tokenHash]);
    if(!eligible.rowCount)return res.status(400).json({error:"reset_token_invalid_or_expired"});
    const ph=await hashPassword(parsed.data.password),userId=eligible.rows[0].user_id,db=await pool.connect();
    try{
      await db.query("begin");
      const locked=await db.query("select id from users where id=$1 for update",[userId]);if(!locked.rowCount){await db.query("rollback");return res.status(400).json({error:"reset_token_invalid_or_expired"})}
      const claimed=await db.query("update password_reset_tokens set used_at=now() where token_hash=$1 and user_id=$2 and used_at is null and expires_at>now() returning user_id",[tokenHash,userId]);
      if(!claimed.rowCount){await db.query("rollback");return res.status(400).json({error:"reset_token_invalid_or_expired"})}
      await db.query("update users set password_salt=$1,password_hash=$2,session_generation=session_generation+1,password_reset_version=password_reset_version+1 where id=$3",[ph.salt,ph.hash,userId]);
      await db.query("update sessions set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
      await db.query("update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null",[userId]);
      await db.query("commit");
      res.setHeader("Set-Cookie",sessionCookie("",0));return res.json({ok:true,message:"Password updated. Please sign in again."});
    }catch(e){await db.query("rollback").catch(()=>{});throw e}finally{db.release()}
  }catch(e){next(e)}
});
app.get("/api/auth/me",auth,(req,res)=>res.json({csrfToken:req.auth.csrf_token,user:{email:req.auth.email,role:req.auth.role,tenantId:req.auth.tenant_id,tenantName:req.auth.tenant_name}}));
app.get("/api/billing/status",auth,roles("owner"),async(req,res,next)=>{try{const q=await pool.query("select status,trial_ends_at,current_period_ends_at,plan from subscriptions where tenant_id=$1",[req.auth.tenant_id]);res.json(q.rows[0]||{status:"missing"})}catch(e){next(e)}});
app.post("/api/billing/request-plan",auth,roles("owner"),async(req,res,next)=>{const p=z.object({plan:planSchema}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"invalid_plan"});try{const q=await pool.query("update subscriptions set plan=$2,updated_at=now() where tenant_id=$1 returning plan,status,trial_ends_at,current_period_ends_at",[req.auth.tenant_id,p.data.plan]);if(!q.rowCount)return res.status(404).json({error:"subscription_not_found"});await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"PLAN_PREFERENCE_CHANGED",requestId:req.requestId,eventData:{plan:p.data.plan}});res.json(q.rows[0])}catch(e){next(e)}});

app.post("/api/auth/logout",auth,async(req,res,next)=>{try{const token=parseCookies(req.headers.cookie)[SESSION_COOKIE];await pool.query("update sessions set revoked_at=now() where token_hash=$1",[sessionHash(token)]);res.setHeader("Set-Cookie",sessionCookie("",0));res.json({ok:true})}catch(e){next(e)}});
app.get("/api/account/sessions",auth,async(req,res,next)=>{try{const q=await pool.query("select id,created_at,last_seen_at,expires_at from sessions where user_id=$1 and session_generation=(select session_generation from users where id=$1) and revoked_at is null and expires_at>now() order by created_at desc limit 50",[req.auth.user_id]);res.json({items:q.rows.map(x=>({id:x.id,created_at:x.created_at,last_seen_at:x.last_seen_at,expires_at:x.expires_at,isCurrent:String(x.id)===String(req.auth.id)}))})}catch(e){next(e)}});
app.delete("/api/account/sessions/:sessionId",auth,async(req,res,next)=>{try{const sessionId=String(req.params.sessionId||"");if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))return res.status(404).json({error:"session_not_found"});const q=await pool.query("update sessions set revoked_at=now() where id=$1 and user_id=$2 and session_generation=(select session_generation from users where id=$2) and revoked_at is null and expires_at>now() returning id",[sessionId,req.auth.user_id]);if(!q.rowCount)return res.status(404).json({error:"session_not_found"});const current=String(sessionId)===String(req.auth.id);await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"SESSION_REVOKED",requestId:req.requestId,eventData:{sessionId,current}});if(current)res.setHeader("Set-Cookie",sessionCookie("",0));res.json({ok:true,current})}catch(e){next(e)}});
app.delete("/api/account/sessions",auth,async(req,res,next)=>{const c=await pool.connect();try{await c.query("begin");await c.query("update users set session_generation=session_generation+1 where id=$1",[req.auth.user_id]);await c.query("update sessions set revoked_at=now() where user_id=$1 and revoked_at is null",[req.auth.user_id]);await audit(c,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"ALL_SESSIONS_REVOKED",requestId:req.requestId});await c.query("commit");res.setHeader("Set-Cookie",sessionCookie("",0));res.json({ok:true})}catch(e){await c.query("rollback").catch(()=>{});next(e)}finally{c.release()}});

app.get("/api/state",auth,roles("owner","manager","reviewer","auditor"),async(req,res,next)=>{try{const q=await pool.query("select state,updated_at,version from app_state where tenant_id=$1",[req.auth.tenant_id]);res.json({state:projectWorkspaceStateForRole(q.rows[0]?.state||{},req.auth.role),updatedAt:q.rows[0]?.updated_at||null,version:q.rows[0]?.version||1})}catch(e){next(e)}});
app.put("/api/state",auth,roles("owner","manager"),requireEntitlement,async(req,res,next)=>{const p=stateSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"invalid_state"});try{let nextState=p.data.state;if(req.auth.role==="manager"){const cur=await pool.query("select state from app_state where tenant_id=$1",[req.auth.tenant_id]);nextState=mergeManagerWorkspaceState(cur.rows[0]?.state||{},p.data.state)}const bytes=Buffer.byteLength(JSON.stringify(nextState));if(bytes>900_000)return res.status(413).json({error:"state_too_large"});const q=await pool.query("update app_state set state=$2,updated_at=now(),version=version+1 where tenant_id=$1 and version=$3 returning version",[req.auth.tenant_id,nextState,p.data.version]);if(!q.rowCount)return res.status(409).json({error:"workspace_conflict",message:"Workspace changed on another session. Reload before saving again.",requestId:req.requestId});await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"WORKSPACE_STATE_UPDATED",requestId:req.requestId,eventData:{bytes,version:q.rows[0].version}});res.json({ok:true,version:q.rows[0].version,requestId:req.requestId})}catch(e){next(e)}});
app.get("/api/audit",auth,roles("owner","manager","reviewer","auditor"),async(req,res,next)=>{try{const q=await pool.query("select id,occurred_at as at,entity_id_text as \"companyId\",event_type as type,event_data as data from audit_events where tenant_id=$1 order by seq desc limit 500",[req.auth.tenant_id]);res.json({items:q.rows})}catch(e){next(e)}});
app.post("/api/audit",auth,(req,res)=>res.status(405).set("Allow","GET").json({error:"client_authored_audit_events_disabled",requestId:req.requestId}));

function s3(){if(!objectStoreValues.every(Boolean))return null;return new S3Client({region:config.OBJECT_STORE_REGION,endpoint:config.OBJECT_STORE_ENDPOINT||undefined,forcePathStyle:!!config.OBJECT_STORE_ENDPOINT,credentials:{accessKeyId:config.OBJECT_STORE_ACCESS_KEY_ID,secretAccessKey:config.OBJECT_STORE_SECRET_ACCESS_KEY}})}
app.post("/api/evidence/presign",auth,roles("owner","manager","reviewer"),requireEntitlement,async(req,res,next)=>{const p=evidenceSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"invalid_evidence_metadata"});if(!allowedTypes.has(p.data.contentType))return res.status(415).json({error:"unsupported_file_type"});const client=s3();if(!client)return res.status(503).json({error:"private_object_storage_not_configured"});try{const key=evidenceStagingKey(req.auth.tenant_id,p.data.companyId);const q=await pool.query("insert into evidence(tenant_id,company_id_text,category,display_name,object_key,review_date,upload_status,expected_size,content_type) values($1,$2,$3,$4,$5,$6,'pending',$7,$8) returning id",[req.auth.tenant_id,p.data.companyId,p.data.category,p.data.displayName,key,p.data.reviewDate||null,p.data.size,p.data.contentType]);const cmd=new PutObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:key,ContentType:p.data.contentType,ContentLength:p.data.size,Metadata:{tenant:req.auth.tenant_id,evidence:q.rows[0].id}});const uploadUrl=await getSignedUrl(client,cmd,{expiresIn:300});await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"EVIDENCE_UPLOAD_AUTHORIZED",companyId:p.data.companyId,requestId:req.requestId,eventData:{evidenceId:q.rows[0].id,contentType:p.data.contentType,size:p.data.size}});metrics.uploadsAuthorized++;res.status(201).json({evidenceId:q.rows[0].id,objectKey:key,uploadUrl,expiresIn:300})}catch(e){next(e)}});

app.post("/api/evidence/:id/complete",auth,roles("owner","manager","reviewer"),async(req,res,next)=>{const p=evidenceCompleteSchema.safeParse(req.body||{});if(!p.success)return res.status(400).json({error:"invalid_completion"});try{const q=await pool.query("select id,company_id_text,object_key,expected_size,content_type,upload_status from evidence where id=$1 and tenant_id=$2",[req.params.id,req.auth.tenant_id]);if(!q.rowCount||q.rows[0].upload_status!=="pending")return res.status(404).json({error:"evidence_not_found_or_not_pending"});const ev=q.rows[0],client=s3();if(!client)return res.status(503).json({error:"private_object_storage_not_configured"});let head;try{head=await client.send(new HeadObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:ev.object_key}))}catch{return res.status(409).json({error:"uploaded_object_not_found"})}const objectCheck=verifyEvidenceObjectHead(head,{expectedSize:ev.expected_size,contentType:ev.content_type,tenantId:req.auth.tenant_id,evidenceId:ev.id});if(!objectCheck.ok){const failed=await pool.query("update evidence set upload_status='failed' where id=$1 and tenant_id=$2 and upload_status='pending'",[ev.id,req.auth.tenant_id]);if(!failed.rowCount)return res.status(409).json({error:"evidence_completion_raced"});await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"EVIDENCE_UPLOAD_VERIFICATION_FAILED",companyId:ev.company_id_text,requestId:req.requestId,eventData:{evidenceId:ev.id,checks:objectCheck.checks,actualSize:objectCheck.actual.size,actualContentType:objectCheck.actual.contentType}});return res.status(409).json({error:objectCheck.checks.size?objectCheck.error:"uploaded_object_size_mismatch",checks:objectCheck.checks})}
const sourceEtag=String(head?.ETag||"").trim();if(!sourceEtag)return res.status(409).json({error:"uploaded_object_etag_missing"});const committedKey=evidenceCommittedKey(req.auth.tenant_id,ev.company_id_text,ev.id);let committed=false;try{await client.send(new CopyObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:committedKey,CopySource:s3CopySource(config.OBJECT_STORE_BUCKET,ev.object_key),CopySourceIfMatch:sourceEtag,MetadataDirective:"COPY"}));committed=true;const committedHead=await client.send(new HeadObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:committedKey}));const committedCheck=verifyEvidenceObjectHead(committedHead,{expectedSize:ev.expected_size,contentType:ev.content_type,tenantId:req.auth.tenant_id,evidenceId:ev.id});if(!committedCheck.ok)throw new Error("committed_object_verification_failed");const signatureObject=await client.send(new GetObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:committedKey,Range:"bytes=0-4095"}));const signaturePrefix=await boundedS3Prefix(signatureObject.Body,4096);if(!evidenceFileSignatureMatches(ev.content_type,signaturePrefix))throw new Error("committed_object_signature_mismatch")}catch(commitErr){if(committed)await client.send(new DeleteObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:committedKey})).catch(()=>{});return res.status(503).json({error:"evidence_object_commit_failed"})}
const scanStatus=config.MALWARE_SCAN_REQUIRED?"pending":"clean",scanJobId=config.MALWARE_SCAN_REQUIRED?crypto.randomUUID():null;const completed=await pool.query("update evidence set object_key=$5,upload_status='uploaded',scan_status=$3,uploaded_at=now(),scan_job_id=$4,scan_job_consumed_at=null where id=$1 and tenant_id=$2 and upload_status='pending' returning id",[ev.id,req.auth.tenant_id,scanStatus,scanJobId,committedKey]);if(!completed.rowCount){await client.send(new DeleteObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:committedKey})).catch(()=>{});return res.status(409).json({error:"evidence_completion_raced"})}await client.send(new DeleteObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:ev.object_key})).catch(deleteErr=>log("warn","EVIDENCE_STAGING_DELETE_FAILED",{evidenceId:ev.id,message:String(deleteErr?.message||deleteErr).slice(0,240)}));ev.object_key=committedKey;await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"EVIDENCE_UPLOAD_COMPLETED",companyId:ev.company_id_text,requestId:req.requestId,eventData:{evidenceId:ev.id,size:Number(head.ContentLength),scanStatus}});if(config.MALWARE_SCAN_REQUIRED){try{const scanUrl=await getSignedUrl(client,new GetObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:ev.object_key}),{expiresIn:300});const callback=`${config.PUBLIC_ORIGIN}/api/internal/malware-scan-result`;const r=await externalFetch(config.MALWARE_SCAN_WEBHOOK_URL,{method:"POST",headers:{"content-type":"application/json","x-scan-job-secret":config.MALWARE_SCAN_WEBHOOK_SECRET},body:JSON.stringify({evidenceId:ev.id,scanJobId,downloadUrl:scanUrl,callbackUrl:callback,contentType:ev.content_type,expectedSize:Number(ev.expected_size)})});if(!r.ok)throw new Error(`scanner_http_${r.status}`);metrics.scanJobs++;await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"EVIDENCE_SCAN_QUEUED",companyId:ev.company_id_text,requestId:req.requestId,eventData:{evidenceId:ev.id}})}catch(scanErr){const invalidated=await pool.query("update evidence set scan_status='error',scan_job_consumed_at=now() where id=$1 and tenant_id=$2 and scan_job_id=$3 and scan_job_consumed_at is null and scan_status='pending'",[ev.id,req.auth.tenant_id,scanJobId]);if(invalidated.rowCount){log("error","MALWARE_SCAN_QUEUE_FAILED",{evidenceId:ev.id,message:scanErr.message});return res.status(503).json({error:"malware_scan_unavailable",evidenceId:ev.id})}const current=await pool.query("select scan_status from evidence where id=$1 and tenant_id=$2",[ev.id,req.auth.tenant_id]);if(!current.rowCount)return res.status(404).json({error:"evidence_not_found"});return res.json({ok:true,scanStatus:current.rows[0].scan_status})}}res.json({ok:true,scanStatus})}catch(e){next(e)}});
app.get("/api/evidence/:id/download-url",auth,roles("owner","manager","reviewer","auditor"),async(req,res,next)=>{try{const q=await pool.query("select id,object_key,display_name,upload_status,scan_status,scan_sha256,scanned_at,deleted_at,storage_deleted_at,deletion_status from evidence where id=$1 and tenant_id=$2",[req.params.id,req.auth.tenant_id]);if(!q.rowCount)return res.status(404).json({error:"evidence_not_found"});const ev=q.rows[0];if(ev.deleted_at||ev.storage_deleted_at||ev.deletion_status==="deleted")return res.status(410).json({error:"evidence_deleted"});if(ev.upload_status!=="uploaded"||!ev.object_key)return res.status(409).json({error:"evidence_file_not_available"});if(ev.scan_status!=="clean"||!ev.scanned_at||!ev.scan_sha256)return res.status(409).json({error:"evidence_not_cleared_for_download",scanStatus:ev.scan_status});const client=s3();if(!client)return res.status(503).json({error:"private_object_storage_not_configured"});const url=await getSignedUrl(client,new GetObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:ev.object_key,ResponseContentDisposition:`attachment; filename*=UTF-8''${encodeURIComponent(ev.display_name)}`}),{expiresIn:180});await audit(pool,{tenantId:req.auth.tenant_id,userId:req.auth.user_id,eventType:"EVIDENCE_DOWNLOAD_AUTHORIZED",requestId:req.requestId,eventData:{evidenceId:ev.id}});res.json({downloadUrl:url,expiresIn:180})}catch(e){next(e)}});

app.post("/api/internal/malware-scan-result",async(req,res,next)=>{const p=scanResultSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"invalid_scan_result"});const sig=req.headers["x-scan-signature"]||"",expected=scanSignature(p.data.evidenceId,p.data.scanJobId,p.data.status,p.data.sha256||"");if(typeof sig!=="string"||!/^[a-f0-9]{64}$/i.test(sig)||sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return res.status(403).json({error:"invalid_scan_signature"});try{const q=await pool.query("update evidence set scan_status=$3,scan_sha256=coalesce($4,scan_sha256),scan_details=$5,scanned_at=now(),scan_job_consumed_at=now() where id=$1 and scan_job_id=$2 and scan_job_consumed_at is null and scan_status='pending' returning tenant_id,company_id_text",[p.data.evidenceId,p.data.scanJobId,p.data.status,p.data.sha256||null,p.data.details||null]);if(!q.rowCount){const exists=await pool.query("select 1 from evidence where id=$1",[p.data.evidenceId]);return res.status(exists.rowCount?409:404).json({error:exists.rowCount?"scan_job_stale_or_consumed":"evidence_not_found"})}if(p.data.status==="clean")metrics.scanClean++;if(p.data.status==="infected")metrics.scanInfected++;await audit(pool,{tenantId:q.rows[0].tenant_id,userId:null,eventType:p.data.status==="infected"?"EVIDENCE_MALWARE_DETECTED":"EVIDENCE_SCAN_COMPLETED",companyId:q.rows[0].company_id_text,requestId:req.requestId,eventData:{evidenceId:p.data.evidenceId,status:p.data.status,sha256:p.data.sha256||null}});res.json({ok:true})}catch(e){next(e)}});
app.get("/api/ops/diagnostics",auth,roles("owner","manager"),async(req,res,next)=>{try{const mig=await pool.query("select version,applied_at from schema_migrations order by applied_at desc limit 1");let storage={configured:objectStoreValues.every(Boolean),reachable:null};if(storage.configured){try{await s3().send(new HeadBucketCommand({Bucket:config.OBJECT_STORE_BUCKET}));storage.reachable=true}catch{storage.reachable=false}}res.json({service:"bw-compliance-os",version:APP_VERSION,env:config.APP_ENV,uptimeSec:Math.floor(process.uptime()),memoryMb:{rss:Math.round(process.memoryUsage().rss/1048576),heapUsed:Math.round(process.memoryUsage().heapUsed/1048576)},metrics:{...metrics,uptimeSec:Math.floor((Date.now()-metrics.startedAt)/1000)},latestMigration:mig.rows[0]||null,objectStorage:storage,malwareScanning:{required:config.MALWARE_SCAN_REQUIRED,configured:!!(safeExternalServiceUrl(config.MALWARE_SCAN_WEBHOOK_URL)&&config.MALWARE_SCAN_WEBHOOK_SECRET)},proxyTrustHops:proxyTrust.hops,requestId:req.requestId})}catch(e){next(e)}});

app.get("/api/auth/oauth/:provider/start",async(req,res,next)=>{
  try{
    const provider=req.params.provider;
    const cfg=oauthConfig(provider);
    if(!cfg) return res.status(503).json({error:"oauth_provider_not_configured"});
    const budget=await consumeDurableAuthBudget("oauth_start_ip",req.ip||"unknown",60,600);
    if(!budget.allowed)return durableRateLimited(res,budget);
    const next=nodeSafeNextPath(req.query.next||"/");
    const nonce=crypto.randomBytes(24).toString("base64url");
    const state=encodeState({provider,nonce,next,iat:Date.now()});
    res.cookie(oauthStateCookieName(provider),state,oauthCookieOptions());
    const u=new URL(cfg.authorizeUrl);
    if(provider==="google"){
      u.searchParams.set("client_id",cfg.clientId);u.searchParams.set("redirect_uri",cfg.redirectUri);
      u.searchParams.set("response_type","code");u.searchParams.set("scope",cfg.scopes);
      u.searchParams.set("state",state);u.searchParams.set("include_granted_scopes","true");
      u.searchParams.set("prompt","select_account");
    }else{
      u.searchParams.set("client_id",cfg.clientId);u.searchParams.set("redirect_uri",cfg.redirectUri);
      u.searchParams.set("response_type","code");u.searchParams.set("scope",cfg.scopes);u.searchParams.set("state",state);
    }
    res.redirect(u.toString());
  }catch(e){next(e)}
});

app.get("/api/auth/oauth/:provider/callback",async (req,res,next)=>{
  try{
    const provider=req.params.provider;
    const cfg=oauthConfig(provider);
    if(!cfg) return res.status(503).send("OAuth provider is not configured.");
    const returned=String(req.query.state||"");
    const expected=req.cookies?.[oauthStateCookieName(provider)]||"";
    if(!returned || !expected || !timingSafeTextEqual(returned,expected)) return res.status(400).send("OAuth state validation failed.");
    const state=decodeState(returned);
    if(!state || state.provider!==provider || Date.now()-state.iat>10*60*1000) return res.status(400).send("OAuth session expired.");
    if(state.mode==="link")req.auth=await loadSessionAuth(req);
    if(req.query.error){clearOauthStateCookie(res,provider);return res.redirect(`/auth?oauth_error=${encodeURIComponent(String(req.query.error))}`);}
    const code=String(req.query.code||"");if(!code) return res.status(400).send("Missing OAuth code.");
    const callbackBudget=await consumeDurableAuthBudget("oauth_callback_ip",req.ip||"unknown",30,600);
    if(!callbackBudget.allowed)return durableRateLimited(res,callbackBudget);
    const tokens=await exchangeOAuthCode(provider,code);
    const profile=await fetchOAuthProfile(provider,tokens);
    if(!profile.email) return res.status(400).send("This social account did not return an email address.");

    // Production path: upsert external identity, then link/create local user.
    // This query block assumes users/memberships/tenants/sessions exist as in the launch schema.
    const db=await pool.connect();
    try{
      await db.query("BEGIN");
      if(provider==="google" && !profile.emailVerified){
        await db.query("ROLLBACK");
        return res.status(400).send("Google did not return a verified email address.");
      }
      if(state.mode==="link"){
        if(!req.auth || req.auth.userId!==state.userId || req.auth.tenantId!==state.tenantId){
          await db.query("ROLLBACK");
          return res.status(403).send("Account-link session mismatch.");
        }
        const linkClaim=await claimExternalIdentity(db,{provider,providerId:profile.providerId,userId:req.auth.userId,email:profile.email});
        if(!linkClaim.ok){
          await db.query("ROLLBACK");
          return res.status(409).send("This social account is already linked to another BW Compliance OS user.");
        }
        await db.query(
          "insert into audit_events(tenant_id,actor_user_id,event_type,event_data) values($1,$2,'SOCIAL_IDENTITY_LINKED',$3::jsonb)",
          [req.auth.tenantId,req.auth.userId,JSON.stringify({provider,email:profile.email})]
        );
        await db.query("COMMIT");
        clearOauthStateCookie(res,provider);
        return res.redirect(nodeSafeNextPath(state.next||"/?social_linked=1"));
      }

      let identityRes=await db.query(
        "select u.id,u.email,u.display_name from external_identities e join users u on u.id=e.user_id where e.provider=$1 and e.provider_user_id=$2 limit 1",
        [provider,profile.providerId]
      ).catch(()=>({rowCount:0,rows:[]}));
      let user;
      if(identityRes.rowCount){
        user=identityRes.rows[0];
      }else{
        let userRes=await db.query("select id,email,display_name from users where lower(email)=lower($1) limit 1",[profile.email]);
        if(userRes.rowCount){
          if(provider==="facebook"){
            await db.query("ROLLBACK");
            return res.status(409).send("An account already exists with this email. Sign in with your existing method first, then link Facebook from account settings.");
          }
          user=userRes.rows[0];
        }else{
          const created=await db.query(
            "insert into users(email,display_name) values($1,$2) returning id,email,display_name",
            [profile.email,profile.name||profile.email]
          );
          user=created.rows[0];
          const tenant=await db.query("insert into tenants(name) values($1) returning id",[`${profile.name||"My"} Workspace`]);
          await db.query("insert into memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active')",[tenant.rows[0].id,user.id]);
        }
      }
      let mem=await db.query("select tenant_id,role from memberships where user_id=$1 and status='active' order by role='owner' desc limit 1",[user.id]);
      if(!mem.rowCount) throw new Error("oauth_membership_missing");

      const signinClaim=await claimExternalIdentity(db,{provider,providerId:profile.providerId,userId:user.id,email:profile.email});
      if(!signinClaim.ok){
        await db.query("ROLLBACK");
        return res.status(409).send("This social sign-in changed concurrently. Please try again.");
      }

      const oauthSession=await createSession(db,user.id,mem.rows[0].tenant_id);
      await db.query("COMMIT");
      res.setHeader("Set-Cookie",sessionCookie(oauthSession.token,oauthSession.maxAge));
      clearOauthStateCookie(res,provider);
      res.redirect(nodeSafeNextPath(state.next||"/"));
    }catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
  }catch(e){next(e)}
});


app.get("/api/account/social", requireRole("owner","manager","reviewer","auditor"), async (req,res,next)=>{
  try{
    const result=await pool.query(
      "select provider,email,created_at,updated_at from external_identities where user_id=$1 order by provider",
      [req.auth.userId]
    );
    const linked=Object.fromEntries(result.rows.map(r=>[r.provider,{linked:true,email:r.email,linkedAt:r.created_at}]));
    res.json({
      google:linked.google||{linked:false},
      facebook:linked.facebook||{linked:false},
      requestId:req.requestId
    });
  }catch(e){next(e)}
});

app.get("/api/account/social/:provider/link", requireRole("owner","manager","reviewer","auditor"), (req,res)=>{
  res.setHeader("Allow","POST");return res.status(405).json({error:"social_link_requires_csrf_protected_post",requestId:req.requestId});
});
app.post("/api/account/social/:provider/link", requireRole("owner","manager","reviewer","auditor"), (req,res)=>{
  const provider=req.params.provider;
  const cfg=oauthConfig(provider);
  if(!cfg) return res.status(503).json({error:"oauth_provider_not_configured",requestId:req.requestId});
  const nonce=crypto.randomBytes(24).toString("base64url");
  const state=encodeState({provider,nonce,next:"/?social_linked=1",iat:Date.now(),mode:"link",userId:req.auth.userId,tenantId:req.auth.tenantId});
  res.cookie(oauthStateCookieName(provider),state,oauthCookieOptions());
  const u=new URL(cfg.authorizeUrl);
  if(provider==="google"){
    u.searchParams.set("client_id",cfg.clientId);u.searchParams.set("redirect_uri",cfg.redirectUri);u.searchParams.set("response_type","code");u.searchParams.set("scope",cfg.scopes);u.searchParams.set("state",state);u.searchParams.set("include_granted_scopes","true");u.searchParams.set("prompt","select_account");
  }else{
    u.searchParams.set("client_id",cfg.clientId);u.searchParams.set("redirect_uri",cfg.redirectUri);u.searchParams.set("response_type","code");u.searchParams.set("scope",cfg.scopes);u.searchParams.set("state",state);
  }
  return res.json({authorizeUrl:u.toString(),requestId:req.requestId});
});

app.delete("/api/account/social/:provider", requireRole("owner","manager","reviewer","auditor"), async (req,res,next)=>{
  const db=await pool.connect();
  try{
    const provider=req.params.provider;
    if(!["google","facebook"].includes(provider)) return res.status(400).json({error:"unsupported_provider",requestId:req.requestId});
    await db.query("BEGIN");
    const userLock=await db.query("select password_hash is not null as has_password from users where id=$1 for update",[req.auth.userId]);
    if(!userLock.rowCount){await db.query("ROLLBACK");return res.status(404).json({error:"user_not_found",requestId:req.requestId});}
    const target=await db.query("select 1 from external_identities where user_id=$1 and provider=$2 limit 1",[req.auth.userId,provider]);
    if(!target.rowCount){await db.query("ROLLBACK");return res.json({ok:true,alreadyUnlinked:true,requestId:req.requestId});}
    const rows=await db.query("select count(*)::int as n from external_identities where user_id=$1",[req.auth.userId]);
    if(Number(rows.rows[0].n)<=1&&!userLock.rows[0]?.has_password){
      await db.query("ROLLBACK");
      return res.status(409).json({error:"last_login_method",message:"Add an email/password login before disconnecting your only social sign-in method.",requestId:req.requestId});
    }
    await db.query("delete from external_identities where user_id=$1 and provider=$2",[req.auth.userId,provider]);
    await db.query(
      "insert into audit_events(tenant_id,actor_user_id,event_type,event_data) values($1,$2,'SOCIAL_IDENTITY_UNLINKED',$3::jsonb)",
      [req.auth.tenantId,req.auth.userId,JSON.stringify({provider})]
    );
    await db.query("COMMIT");
    res.json({ok:true,requestId:req.requestId});
  }catch(e){try{await db.query("ROLLBACK")}catch{};next(e)}finally{db.release()}
});


async function sendTransactionalEmail({to,subject,text,html}){
  const provider=(process.env.EMAIL_PROVIDER||(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM?"resend":"")).toLowerCase();
  if(!provider){
    if(!isProd){
      console.log(JSON.stringify({level:"info",event:"DEV_EMAIL",to,subject,text}));
      return {accepted:true,provider:"dev-console"};
    }
    throw new Error("email_provider_not_configured");
  }
  if(provider==="resend"){
    const key=process.env.RESEND_API_KEY;
    const from=process.env.EMAIL_FROM;
    if(!key||!from) throw new Error("resend_not_configured");
    const r=await externalFetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"authorization":`Bearer ${key}`,"content-type":"application/json"},
      body:JSON.stringify({from,to:[to],subject,text,html})
    });
    if(!r.ok) throw new Error("transactional_email_failed");
    return {accepted:true,provider:"resend"};
  }
  throw new Error("unsupported_email_provider");
}

app.get("/api/account/export", requireRole("owner"), async (req,res,next)=>{
  try{
    const [user,workspace,evidence,audit,social,evidenceCount,auditCount]=await Promise.all([
      pool.query("select id,email,display_name,onboarding_complete,created_at from users where id=$1",[req.auth.userId]),
      pool.query("select state,updated_at,version from app_state where tenant_id=$1",[req.auth.tenantId]),
      pool.query("select id,company_id_text as company_id,category,display_name,review_date,verified,created_at from evidence where tenant_id=$1 order by created_at desc,id desc limit 5000",[req.auth.tenantId]),
      pool.query("select event_type,entity_type,entity_id_text as entity_id,event_data,occurred_at from audit_events where tenant_id=$1 order by occurred_at desc,seq desc limit 5000",[req.auth.tenantId]),
      pool.query("select provider,email,created_at,updated_at from external_identities where user_id=$1",[req.auth.userId]),
      pool.query("select count(*)::int n from evidence where tenant_id=$1",[req.auth.tenantId]),
      pool.query("select count(*)::int n from audit_events where tenant_id=$1",[req.auth.tenantId])
    ]);
    const workspaceState=workspace.rows[0]?.state&&typeof workspace.rows[0].state==="object"?workspace.rows[0].state:{};
    const companies=Array.isArray(workspaceState.companies)?workspaceState.companies:[];
    const cases=companies.flatMap(company=>Array.isArray(company?.cases)?company.cases.map(item=>({companyId:company.id||null,...item})):[]);
    const reviews=companies.flatMap(company=>Array.isArray(company?.reviews)?company.reviews.map(item=>({companyId:company.id||null,...item})):[]);
    res.json({
      exportedAt:new Date().toISOString(),user:user.rows[0]||null,
      workspace:{state:workspaceState,updatedAt:workspace.rows[0]?.updated_at||null,version:workspace.rows[0]?.version||1},
      companies,evidence:evidence.rows,cases,reviews,audit:audit.rows,socialIdentities:social.rows,
      exportMeta:{
        evidence:{total:Number(evidenceCount.rows[0]?.n||0),included:evidence.rows.length,limit:5000,truncated:Number(evidenceCount.rows[0]?.n||0)>5000},
        audit:{total:Number(auditCount.rows[0]?.n||0),included:audit.rows.length,limit:5000,truncated:Number(auditCount.rows[0]?.n||0)>5000}
      },
      note:"Export excludes stored document bytes. Very large evidence/audit metadata histories are capped at 5,000 entries per section; request/download remaining evidence separately."
    });
  }catch(e){next(e)}
});


app.get("/api/account/onboarding", requireRole("owner","manager","reviewer","auditor"), async (req,res,next)=>{
  try{
    const r=await pool.query("select onboarding_complete from users where id=$1",[req.auth.userId]);
    res.json({complete:!!r.rows[0]?.onboarding_complete,requestId:req.requestId});
  }catch(e){next(e)}
});

app.post("/api/account/onboarding/complete", requireRole("owner"), async (req,res,next)=>{
  try{
    await pool.query("update users set onboarding_complete=true where id=$1",[req.auth.userId]);
    await audit(pool,{tenantId:req.auth.tenantId,userId:req.auth.userId,eventType:"ONBOARDING_COMPLETED",requestId:req.requestId,eventData:{}});
    res.json({ok:true,requestId:req.requestId});
  }catch(e){next(e)}
});


async function tenantHasActiveLegalHold(tenantId){
  const r=await pool.query("select 1 from legal_holds where tenant_id=$1 and active=true limit 1",[tenantId]);
  return !!r.rowCount;
}
app.get("/api/account/deletion-status", requireRole("owner"), async (req,res,next)=>{
  try{
    const hold=await tenantHasActiveLegalHold(req.auth.tenantId);
    const r=await pool.query(
      "select id,status,reason,requested_at,reviewed_at,completed_at from deletion_requests where tenant_id=$1 order by requested_at desc limit 1",
      [req.auth.tenantId]
    );
    res.json({legalHold:hold,latest:r.rows[0]||null,requestId:req.requestId});
  }catch(e){next(e)}
});

app.get("/api/account/legal-hold", requireRole("owner"), async (req,res,next)=>{
  try{
    const r=await pool.query(
      "select id,scope,reason,active,created_at,released_at from legal_holds where tenant_id=$1 order by created_at desc",
      [req.auth.tenantId]
    );
    res.json({items:r.rows,requestId:req.requestId});
  }catch(e){next(e)}
});

app.post("/api/account/delete-request", requireRole("owner"), (_req,res)=>res.status(410).json({error:"legacy_deletion_route_disabled",use:"/api/account/deletion-request"}));

app.post("/api/account/deletion-request", requireRole("owner"), async (req,res,next)=>{
  try{
    const confirmation=String(req.body?.confirmation||"");
    if(confirmation!=="DELETE MY ACCOUNT") return res.status(400).json({error:"confirmation_required"});
    const suppliedReason=String(req.body?.reason||"Customer requested account deletion").trim().slice(0,500);
    const existing=await pool.query("select id,status,reason,requested_at from deletion_requests where tenant_id=$1 and status in ('requested','approved','blocked','processing','failed') order by requested_at desc limit 1",[req.auth.tenantId]);
    if(existing.rowCount)return res.json({ok:true,...existing.rows[0]});
    const hold=await tenantHasActiveLegalHold(req.auth.tenantId);
    const status=hold?"blocked":"requested";
    const reason=hold?`Active legal hold prevents deletion until released.${suppliedReason?` ${suppliedReason}`:""}`:suppliedReason;
    const r=await pool.query(
      "insert into deletion_requests(tenant_id,user_id,status,reason) values($1,$2,$3,$4) returning id,status,reason,requested_at",
      [req.auth.tenantId,req.auth.userId,status,reason]
    );
    await pool.query(
      "insert into audit_events(tenant_id,actor_user_id,event_type,event_data) values($1,$2,'ACCOUNT_DELETION_REQUESTED',$3::jsonb)",
      [req.auth.tenantId,req.auth.userId,JSON.stringify({requestId:r.rows[0].id,status,legalHold:hold})]
    );
    res.json({ok:true,...r.rows[0],message:hold?"Deletion request recorded but blocked by active legal hold.":"Deletion request recorded for retention review."});
  }catch(e){next(e)}
});



async function deleteEvidenceObject(objectKey){
  if(!objectKey) return {deleted:false,reason:"no_object_key"};
  const client=s3();if(!client||!config.OBJECT_STORE_BUCKET) throw new Error("object_store_not_configured");
  await client.send(new DeleteObjectCommand({Bucket:config.OBJECT_STORE_BUCKET,Key:objectKey}));
  return {deleted:true};
}

app.post("/api/internal/retention/cleanup", async (req,res,next)=>{
  try{
    if(!(await retentionSecretAuthorized(req,res)))return;
    const pendingDays=Math.max(1,Number(process.env.PENDING_UPLOAD_RETENTION_DAYS||3));
    const failedDays=Math.max(1,Number(process.env.FAILED_UPLOAD_RETENTION_DAYS||7));

    const candidates=await pool.query(
      `select e.id,e.tenant_id,e.object_key,e.upload_status,e.deletion_attempts
       from evidence e
       where e.deleted_at is null
         and e.legal_hold=false
         and not exists(select 1 from legal_holds lh where lh.tenant_id=e.tenant_id and lh.active=true)
         and (
           (e.upload_status='pending' and e.created_at < now()-($1||' days')::interval)
           or
           (e.upload_status='failed' and e.created_at < now()-($2||' days')::interval)
           or
           (e.deletion_status='error' and e.deletion_attempts < 5)
         )
       order by e.created_at asc
       limit 100`,
      [pendingDays,failedDays]
    );

    let deleted=0,errors=0,skipped=0;
    for(const row of candidates.rows){
      try{
        const hold=await tenantHasActiveLegalHold(row.tenant_id);
        if(hold){skipped++;continue}
        await pool.query(
          "update evidence set deletion_status='pending',deletion_attempts=deletion_attempts+1,deletion_error=null where id=$1",
          [row.id]
        );
        await deleteEvidenceObject(row.object_key);
        await pool.query(
          `update evidence
           set deleted_at=now(),storage_deleted_at=now(),deletion_status='deleted',deletion_error=null
           where id=$1`,
          [row.id]
        );
        await pool.query(
          "insert into audit_events(tenant_id,event_type,entity_type,entity_id_text,event_data) values($1,'EVIDENCE_STORAGE_DELETED','evidence',$2,$3::jsonb)",
          [row.tenant_id,row.id,JSON.stringify({reason:"retention_cleanup"})]
        );
        deleted++;
      }catch(err){
        errors++;
        await pool.query(
          "update evidence set deletion_status='error',deletion_error=$2 where id=$1",
          [row.id,String(err?.message||err).slice(0,500)]
        );
      }
    }
    res.json({ok:true,checked:candidates.rowCount,deleted,errors,skipped,requestId:req.requestId});
  }catch(e){next(e)}
});

app.post("/api/internal/deletion-requests/:id/approve", async (req,res,next)=>{
  try{
    if(!(await retentionSecretAuthorized(req,res)))return;
    const r=await pool.query("select * from deletion_requests where id=$1 limit 1",[req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"not_found"});
    const dr=r.rows[0];
    if(await tenantHasActiveLegalHold(dr.tenant_id))
      return res.status(409).json({error:"legal_hold_active"});
    const u=await pool.query(
      "update deletion_requests set status='approved',approved_at=now(),reviewed_at=now(),reason=null where id=$1 and status in ('requested','blocked') returning *",
      [dr.id]
    );
    if(!u.rowCount){
      const current=await pool.query("select status from deletion_requests where id=$1 limit 1",[dr.id]);
      return current.rowCount?res.status(409).json({error:"invalid_state",status:current.rows[0].status}):res.status(404).json({error:"not_found"});
    }
    await pool.query(
      "insert into audit_events(tenant_id,actor_user_id,event_type,event_data) values($1,$2,'ACCOUNT_DELETION_APPROVED',$3::jsonb)",
      [dr.tenant_id,dr.user_id,JSON.stringify({requestId:dr.id})]
    );
    res.json({ok:true,item:u.rows[0],requestId:req.requestId});
  }catch(e){next(e)}
});

app.post("/api/internal/deletion-requests/:id/complete", async (req,res,next)=>{
  let client=null,inTransaction=false;
  try{
    if(!(await retentionSecretAuthorized(req,res)))return;
    client=await pool.connect();
    await client.query("BEGIN");inTransaction=true;
    const r=await client.query("select * from deletion_requests where id=$1 for update",[req.params.id]);
    if(!r.rowCount){await client.query("ROLLBACK");inTransaction=false;return res.status(404).json({error:"not_found"})}
    const dr=r.rows[0];
    if(dr.status!=="approved"){await client.query("ROLLBACK");inTransaction=false;return res.status(409).json({error:"not_approved",status:dr.status})}
    const hold=await client.query("select 1 from legal_holds where tenant_id=$1 and active=true limit 1",[dr.tenant_id]);
    if(hold.rowCount){await client.query("ROLLBACK");inTransaction=false;return res.status(409).json({error:"legal_hold_active"})}
    const pending=await client.query(
      "select count(*)::int as n from evidence where tenant_id=$1 and object_key is not null and storage_deleted_at is null",
      [dr.tenant_id]
    );
    if(Number(pending.rows[0].n)>0){await client.query("ROLLBACK");inTransaction=false;return res.status(409).json({error:"evidence_objects_remaining",count:Number(pending.rows[0].n)})}
    const evidenceCount=await client.query("select count(*)::int n from evidence where tenant_id=$1",[dr.tenant_id]);
    const orphanCount=await client.query(`select count(*)::int n from memberships m where m.tenant_id=$1 and not exists(
      select 1 from memberships other where other.user_id=m.user_id and other.tenant_id<>m.tenant_id
    )`,[dr.tenant_id]);
    const tenantFingerprint=crypto.createHmac("sha256",config.SESSION_SECRET).update(`tenant-deletion|${dr.tenant_id}`).digest("hex");
    await client.query(`delete from users where id in (
      select m.user_id from memberships m where m.tenant_id=$1 and not exists(
        select 1 from memberships other where other.user_id=m.user_id and other.tenant_id<>m.tenant_id
      )
    )`,[dr.tenant_id]);
    await client.query(`insert into deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,orphan_users_purged)
      values($1,$2,'v2',$3,$4) on conflict(request_id) do nothing`,[dr.id,tenantFingerprint,Number(evidenceCount.rows[0]?.n||0),Number(orphanCount.rows[0]?.n||0)]);
    const deleted=await client.query("delete from tenants where id=$1",[dr.tenant_id]);
    if(deleted.rowCount!==1)throw new Error("tenant_purge_target_missing");
    await client.query("COMMIT");inTransaction=false;
    return res.json({ok:true,status:"completed",requestId:req.requestId,evidenceRecordsPurged:Number(evidenceCount.rows[0]?.n||0),orphanUsersPurged:Number(orphanCount.rows[0]?.n||0)});
  }catch(e){
    if(client&&inTransaction)try{await client.query("ROLLBACK")}catch{}
    next(e);
  }finally{client?.release()}
});


function htmlScriptNonce(){return crypto.randomBytes(18).toString("base64url")}
function nonceInlineScripts(html,nonce){return String(html||"").replace(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>/gi,`<script nonce="${nonce}"$1>`)}
function nonceInlineStyles(html,nonce){return String(html||"").replace(/<style\b([^>]*)>/gi,`<style nonce="${nonce}"$1>`)}
function nonceHtmlExecutableBlocks(html,nonce){return nonceInlineStyles(nonceInlineScripts(html,nonce),nonce)}
function objectStoreCspSource(){try{const u=new URL(String(config.OBJECT_STORE_ENDPOINT||""));return u.protocol==="https:"?u.origin:""}catch{return ""}}
function htmlContentSecurityPolicy(nonce){const objectStore=objectStoreCspSource(),connect=objectStore?`'self' ${objectStore}`:"'self'";return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; script-src-elem 'self' 'nonce-${nonce}'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src ${connect}; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests`}
function sendNonceHtml(res,html){const nonce=htmlScriptNonce();res.set("Content-Security-Policy",htmlContentSecurityPolicy(nonce));return res.send(nonceHtmlExecutableBlocks(html,nonce))}

function seoPublicOrigin(req){
  try{const raw=config.PUBLIC_ORIGIN||`${req.protocol}://${req.get("host")}`;const u=new URL(raw);u.pathname="/";u.search="";u.hash="";return u.toString()}catch{return `${req.protocol}://${req.get("host")}/`}
}
const SEO_RELEASE_LASTMOD="2026-09-11";
const SEO_GUIDE_SLUGS=["cipa-compliance-botswana","burs-tax-compliance-botswana","business-licences-botswana","employment-compliance-botswana","tender-readiness-botswana","compliance-evidence-botswana","pricing"];
function renderSeoIndex(req){
  const canonical=seoPublicOrigin(req),image=new URL("assets/gaborone-entrepreneurs-v67.webp",canonical).toString(),logo=new URL("assets/thebe-desk-icon-512.png",canonical).toString();
  return fs.readFileSync(path.join(publicDir,"index.html"),"utf8").replaceAll("__SEO_CANONICAL__",canonical).replaceAll("__SEO_OG_IMAGE__",image).replaceAll("__SEO_LOGO__",logo);
}
function renderSeoGuide(req,slug){
  const origin=seoPublicOrigin(req),canonical=new URL(`${slug}/`,origin).toString(),image=new URL("assets/gaborone-entrepreneurs-v67.webp",origin).toString(),logo=new URL("assets/thebe-desk-icon-512.png",origin).toString();
  return fs.readFileSync(path.join(publicDir,slug,"index.html"),"utf8").replaceAll("__SEO_PAGE_URL__",canonical).replaceAll("__SEO_ORIGIN__",origin).replaceAll("__SEO_OG_IMAGE__",image).replaceAll("__SEO_LOGO__",logo);
}
app.get("/robots.txt",(req,res)=>{const canonical=seoPublicOrigin(req);res.type("text/plain").set("Cache-Control","public, max-age=3600").send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /public/\nDisallow: /index.html\nSitemap: ${new URL("sitemap.xml",canonical)}\n`)});
app.get("/sitemap.xml",(req,res)=>{const origin=seoPublicOrigin(req),urls=[origin,...SEO_GUIDE_SLUGS.map(slug=>new URL(`${slug}/`,origin).toString())];res.type("application/xml").set("Cache-Control","public, max-age=3600").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(raw=>`<url><loc>${raw.replaceAll("&","&amp;").replaceAll("<","&lt;")}</loc><lastmod>${SEO_RELEASE_LASTMOD}</lastmod></url>`).join("")}</urlset>`)});
app.get("/index.html",(req,res)=>res.redirect(301,"/"));
app.get("/",(req,res)=>sendNonceHtml(res.status(200).type("html").set("Content-Language","en-BW").set("Link",`<${seoPublicOrigin(req)}>; rel=\"canonical\"`),renderSeoIndex(req)));
for(const slug of SEO_GUIDE_SLUGS){
  app.get(`/${slug}/index.html`,(req,res)=>res.redirect(301,`/${slug}/`));
  app.get(`/${slug}/index`,(req,res)=>res.redirect(301,`/${slug}/`));
  app.get(`/${slug}/`,(req,res)=>{const canonical=new URL(`${slug}/`,seoPublicOrigin(req)).toString();sendNonceHtml(res.status(200).type("html").set("Content-Language","en-BW").set("Link",`<${canonical}>; rel=\"canonical\"`),renderSeoGuide(req,slug))});
}

app.use(express.static(publicDir,{etag:true,maxAge:isProd?"5m":"0"}));
app.use("/api",(req,res)=>res.status(404).json({error:"not_found",requestId:req.requestId}));
app.use("/public",(req,res)=>res.status(404).json({error:"not_found",requestId:req.requestId}));
app.get("/{*splat}",(req,res)=>res.status(404).sendFile(path.join(publicDir,"404.html")));
app.use((err,req,res,next)=>{
  metrics.errors++;
  const status=Number(err?.status||err?.statusCode||0),type=String(err?.type||"");
  if(status===413||type==="entity.too.large"){log("warn","REQUEST_BODY_REJECTED",{requestId:req.requestId,reason:"payload_too_large"});return res.status(413).json({error:"payload_too_large",requestId:req.requestId})}
  if(status===400||type==="entity.parse.failed"){log("warn","REQUEST_BODY_REJECTED",{requestId:req.requestId,reason:"invalid_json"});return res.status(400).json({error:"invalid_json",requestId:req.requestId})}
  log("error","UNHANDLED_ERROR",{requestId:req.requestId,message:err?.message||"unknown",stack:isProd?undefined:err?.stack});
  res.status(500).json({error:"internal_error",requestId:req.requestId});
});
function handleHttpRequest(req,res){app(req,res)}
const port=config.PORT;
const server=createHardenedHttpServer(handleHttpRequest);
server.listen(port,()=>log("info","SERVER_STARTED",{version:APP_VERSION,port,env:config.APP_ENV,maxHeaderSize:HTTP_MAX_HEADER_SIZE,maxHeadersCount:HTTP_MAX_HEADERS_COUNT}));
server.requestTimeout=30_000;
server.headersTimeout=10_000;
server.keepAliveTimeout=5_000;
server.maxRequestsPerSocket=1000;
const cleanup=setInterval(()=>pool.query("delete from sessions where expires_at < now() or revoked_at < now() - interval '7 days'").catch(e=>console.error("session_cleanup",e)),60*60*1000);cleanup.unref();
async function shutdown(signal){log("info","GRACEFUL_SHUTDOWN",{signal});server.close(async()=>{try{await pool.end()}finally{process.exit(0)}});setTimeout(()=>process.exit(1),10000).unref()}
process.on("SIGTERM",()=>shutdown("SIGTERM"));process.on("SIGINT",()=>shutdown("SIGINT"));
