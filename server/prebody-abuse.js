const RULES=Object.freeze({
  "/api/auth/register":Object.freeze({scope:"prebody_register_ip",limit:20,windowSeconds:3600,maxBodyBytes:16*1024,originProtected:true}),
  "/api/auth/login":Object.freeze({scope:"prebody_login_ip",limit:30,windowSeconds:900,maxBodyBytes:8*1024,originProtected:true}),
  "/api/auth/password-reset/request":Object.freeze({scope:"prebody_password_reset_request_ip",limit:30,windowSeconds:3600,maxBodyBytes:4*1024,originProtected:true}),
  "/api/auth/password-reset/complete":Object.freeze({scope:"prebody_password_reset_complete_ip",limit:60,windowSeconds:900,maxBodyBytes:8*1024,originProtected:true}),
  "/api/internal/malware-scan-result":Object.freeze({scope:"prebody_malware_scan_callback_ip",limit:600,windowSeconds:600,maxBodyBytes:16*1024,originProtected:false})
});
const INTERNAL_MAINTENANCE_PREFIXES=Object.freeze([
  "/api/internal/retention/cleanup",
  "/api/internal/deletion-requests/"
]);
export function nodePreBodyAbuseRule(method,pathname){
  if(String(method||"").toUpperCase()!=="POST")return null;
  const path=String(pathname||"");
  if(RULES[path])return RULES[path];
  if(INTERNAL_MAINTENANCE_PREFIXES.some(prefix=>path.startsWith(prefix)))return Object.freeze({scope:"prebody_internal_maintenance_ip",limit:120,windowSeconds:600,maxBodyBytes:8*1024,originProtected:false});
  return null;
}
export const NODE_PREBODY_ABUSE_RULES=RULES;
