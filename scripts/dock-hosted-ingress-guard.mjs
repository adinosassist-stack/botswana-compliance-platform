/** Offline/read-only qualification of the proposed Dock staging ingress.
 * Caller must supply complete current inventory, independently reviewed exact
 * tester email allowlist, and known Access application ID. No mutations.
 */
export const DOCK_HOST="dock-staging.thebedesk.com";
export const DOCK_WORKER="bw-dock-research-workspace-staging";
export const AI_WORKER="bw-general-ai-staging";
export const PRIVATE_DOCK_BACKEND="bw-dock-private-ai-staging";
const fail=(ok,msg)=>{if(!ok)throw Error(msg)};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const email=/^[^@\s*]+@[^@\s*]+\.[^@\s*]+$/;
const hostOnly=x=>String(x||"").replace(/^https:\/\//,"").split("/")[0].toLowerCase();
function mayCover(uri){
  const h=hostOnly(uri);
  return h===DOCK_HOST || h==="*.thebedesk.com" || h.includes("*")&&DOCK_HOST.endsWith(h.split("*").pop());
}
function exactApp(app){
  if(!app||app.type!=="self_hosted"||app.domain!==DOCK_HOST||!app.aud)return false;
  if(app.self_hosted_domains!==undefined&&(!Array.isArray(app.self_hosted_domains)||app.self_hosted_domains.some(h=>h!==DOCK_HOST)))return false;
  if(app.destinations!==undefined){
    if(!Array.isArray(app.destinations)||app.destinations.length!==1)return false;
    const d=app.destinations[0];
    if(d.type!=="public"||d.uri!==DOCK_HOST||d.overrides?.length)return false;
  }
  return app.session_duration==="15m" && app.options_preflight_bypass!==true && app.skip_interstitial!==true;
}
export function verifyDockIngress({apps,policies,domains,routes,workspaceSubdomain,backendSubdomain,appId,testerEmails,inventoryComplete,phase}={}){
  fail(inventoryComplete===true&&[apps,policies,domains,routes].every(Array.isArray),"complete_inventory_required");
  fail(phase==="before-attach"||phase==="after-attach","invalid_phase");
  fail(uuid.test(appId||""),"qualified_access_id_required");
  fail(Array.isArray(testerEmails)&&testerEmails.length>0&&testerEmails.length<=5&&testerEmails.every(e=>email.test(e)&&e===e.toLowerCase())&&new Set(testerEmails).size===testerEmails.length,"reviewed_tester_allowlist_required");
  const matching=apps.filter(a=>mayCover(a.domain)||(a.self_hosted_domains||[]).some(mayCover)||(a.destinations||[]).some(d=>mayCover(d.uri)||["all_workers","all_preview_workers"].includes(d.type)));
  fail(matching.length===1&&matching[0].id===appId&&exactApp(matching[0]),"exact_access_application_required");
  fail(policies.length===1&&policies[0].decision==="allow","sole_allow_policy_required");
  const p=policies[0];
  fail(Array.isArray(p.include)&&p.include.length===testerEmails.length&&p.include.every(i=>Object.keys(i).length===1&&Object.keys(i.email||{}).length===1&&typeof i.email?.email==="string"),"explicit_email_policy_required");
  fail(JSON.stringify(p.include.map(i=>i.email.email.toLowerCase()).sort())===JSON.stringify([...testerEmails].sort()),"tester_allowlist_mismatch");
  fail((p.exclude||[]).length===0&&(p.require||[]).length===0,"unreviewed_policy_condition");
  fail(p.session_duration===undefined||p.session_duration===null||p.session_duration==="15m","access_policy_session_too_long");
  for(const s of [workspaceSubdomain,backendSubdomain])fail(s?.enabled===false&&s?.previews_enabled===false,"worker_direct_ingress_enabled");
  fail(!routes.some(r=>r.script===DOCK_WORKER||r.script===AI_WORKER||r.script===PRIVATE_DOCK_BACKEND||mayCover(r.pattern)),"unreviewed_worker_route");
  fail(!domains.some(d=>d.service===AI_WORKER||d.service===PRIVATE_DOCK_BACKEND||d.hostname==="ai-staging.thebedesk.com"),"backend_public_domain");
  const found=domains.filter(d=>d.hostname===DOCK_HOST||d.service===DOCK_WORKER);
  if(phase==="before-attach")fail(found.length===0,"dock_domain_already_attached");
  else fail(found.length===1&&found[0].hostname===DOCK_HOST&&found[0].service===DOCK_WORKER&&found[0].zone_name==="thebedesk.com"&&found[0].enabled===true&&found[0].previews_enabled===false,"dock_domain_mismatch");
  return Object.freeze({ok:true,phase,host:DOCK_HOST,privateBackend:true,explicitTesterPolicy:true,accessLifetimeMinutes:15});
}
