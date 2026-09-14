import fs from 'fs';
const server=fs.readFileSync(new URL('../server/server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
const mustServer=['HttpOnly','SameSite=Lax','csrf_failed','origin_failed','timingSafeEqual','req.auth.tenant_id','authLimiter','private_object_storage_not_configured','helmet(','rateLimit(','client_authored_audit_events_disabled','roles("owner","manager")','sessionHash(token)','workspace_conflict','EVIDENCE_DOWNLOAD_AUTHORIZED','HeadObjectCommand','uploaded_object_size_mismatch','verifyEvidenceObjectHead','MALWARE_SCAN_REQUIRED must be true in production','CopyObjectCommand','sha256_required_for_scan_verdict','evidence_deleted','MALWARE_SCAN_REQUIRED','scan_status','evidence_not_cleared_for_download','requireEntitlement','subscription_required','secretEnv('];
for(const x of mustServer) if(!server.includes(x)) throw new Error('Missing server security control: '+x);

if(!server.includes('if(!nodeFetchMetadataAllowsBrowserMutation(req.headers["sec-fetch-site"])||!nodeRequestOriginAllowed(req.headers.origin,config.PUBLIC_ORIGIN))return res.status(403).json({error:"origin_failed"})')||!server.includes('if(!timingSafeTextEqual(req.headers["x-csrf-token"],req.auth.csrf_token))return res.status(403).json({error:"csrf_failed"})')) throw new Error('SameSite=Lax requires Fetch Metadata + exact-Origin + CSRF protection on authenticated mutations');
if(!server.includes('app.get("/api/account/social/:provider/link"')||!server.includes('social_link_requires_csrf_protected_post')||!server.includes('app.post("/api/account/social/:provider/link"')) throw new Error('Account linking must remain POST-only behind authenticated mutation protection');
if(!html.includes('function safeId(s)')) throw new Error('Missing stored-XSS ID hardening');
if(!html.includes('escapeHtml(e.name)')||html.includes('sel.innerHTML=store.companies')) throw new Error('Stored-XSS rendering regression');
if(/localStorage\s*\.\s*(getItem|setItem|removeItem|clear)/.test(html)) throw new Error('Production frontend must not use localStorage calls');
if(!html.includes('async function bootstrap()')) throw new Error('Missing auth bootstrap');
if(html.includes('renderAll();applyRoleUi();bootstrap()')) throw new Error('Recursive bootstrap regression');
if(!html.includes('id="addCompanyBtn"')||!html.includes('role==="owner"')) throw new Error('Company creation UI role gate missing');
for(const x of ['tenant_id','sessions','audit_events','rule_versions','upload_status','scan_status','subscriptions']) if(!schema.includes(x)) throw new Error('Missing schema control: '+x);
if(!/create table if not exists app_state\([^;]*version integer not null default 1\)/i.test(schema)) throw new Error('Missing schema control: app_state numeric integer version contract');
if(/create table if not exists app_state\([^;]*version bigint/i.test(schema)) throw new Error('Stale schema control: app_state.version must not be bigint');
console.log('Security regression checks passed');
