import {releaseSourceSha} from './client-runtime-identity.js';

const DOCK_RECOVERY_GEOMETRY_SRC='/js/thebe-dock-recovery-geometry-v269.js';
const LIVE_PREVIEW_FALLBACK_SRC='/js/thebe-live-preview-fallback-v272.js';
const LIVE_EVIDENCE_SRC='/js/thebe-live-evidence-v274.js';
const LIVE_EVAL_COCKPIT_SRC='/js/thebe-voice-eval-panel-v275.js';
const WORKSPACE_TEXT_LAYOUT_SRC='/js/workspace-text-layout-guard-v276.js';
const WORKSPACE_PROPERTY_ROUTE_ISOLATION_SRC='/js/workspace-property-route-isolation-v277.js';
const WORKSPACE_FOCUS_VISIBLE_SRC='/js/workspace-focus-visible-v278.js';
const OWNER_FOCUS_STRIP_SRC='/js/owner-focus-strip-v296.js';
const MONEY_WORKSPACE_SRC='/js/money-workspace-v307.js';
const PROTECT_WORKSPACE_SRC='/js/protect-workspace-v308.js';

function injectAtFinalClosingTag(source,tag,markup){
  const pattern=new RegExp(`<\\/${tag}\\s*>`, 'gi');
  let match,last=null;while((match=pattern.exec(source)))last=match;
  return last?source.slice(0,last.index)+markup+source.slice(last.index):source;
}

export function versionReleaseAssets(html,sha=releaseSourceSha(),options={}){
  if(!/^[0-9a-f]{40}$/.test(sha))return String(html||'');
  let source=String(html||'');
  if(!source.includes(DOCK_RECOVERY_GEOMETRY_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${DOCK_RECOVERY_GEOMETRY_SRC}" defer></script>\n`);
  if(!source.includes(LIVE_PREVIEW_FALLBACK_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${LIVE_PREVIEW_FALLBACK_SRC}" defer></script>\n`);
  if(options?.includeVoiceEvidence===true&&!source.includes(LIVE_EVIDENCE_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${LIVE_EVIDENCE_SRC}" defer></script>\n`);
  if(options?.includeVoiceEvidence===true&&!source.includes(LIVE_EVAL_COCKPIT_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${LIVE_EVAL_COCKPIT_SRC}" defer></script>\n`);
  if(options?.includeWorkspaceFixes===true&&!source.includes(WORKSPACE_TEXT_LAYOUT_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${WORKSPACE_TEXT_LAYOUT_SRC}" defer></script>\n`);
  if(options?.includeWorkspaceFixes===true&&!source.includes(WORKSPACE_PROPERTY_ROUTE_ISOLATION_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${WORKSPACE_PROPERTY_ROUTE_ISOLATION_SRC}" defer></script>\n`);
  if(options?.includeWorkspaceFixes===true&&!source.includes(WORKSPACE_FOCUS_VISIBLE_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${WORKSPACE_FOCUS_VISIBLE_SRC}" defer></script>\n`);
  if(options?.includeWorkspaceFixes===true&&!source.includes(OWNER_FOCUS_STRIP_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${OWNER_FOCUS_STRIP_SRC}" defer></script>\n`);
  if(options?.includeWorkspaceFixes===true&&!source.includes(MONEY_WORKSPACE_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${MONEY_WORKSPACE_SRC}" defer></script>\n`);
  if(options?.includeWorkspaceFixes===true&&!source.includes(PROTECT_WORKSPACE_SRC))source=injectAtFinalClosingTag(source,"body",`<script src="${PROTECT_WORKSPACE_SRC}" defer></script>\n`);
  source=source.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)=["'])(\/(?:js|assets)\/[^"']+)(["'][^>]*>)/gi,(_match,start,path,end)=>{
    const url=new URL(path.replaceAll('&amp;','&'),'https://thebe.invalid');
    url.searchParams.set('release',sha);
    return start+(url.pathname+url.search+url.hash).replaceAll('&','&amp;')+end;
  });
  source=source.replace(/<meta\b[^>]*\bname=["']thebe-assets-release["'][^>]*>\s*/gi,'');
  return source.replace(/<\/head\s*>/i,`<meta name="thebe-assets-release" content="${sha}">\n</head>`);
}

export async function applyAssetReleaseIdentity(request,response){
  if(!['GET','HEAD'].includes(request.method)||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('etag');
  headers.set('cache-control','no-store, max-age=0, must-revalidate');
  headers.set('cdn-cache-control','no-store');
  if(request.method==='HEAD')return new Response(null,{status:response.status,statusText:response.statusText,headers});
  let includeVoiceEvidence=false;
  let includeWorkspaceFixes=false;
  try{
    const pathname=new URL(request.url).pathname;
    includeVoiceEvidence=pathname==='/app'||pathname==='/app/';
    includeWorkspaceFixes=includeVoiceEvidence;
  }catch{}
  return new Response(versionReleaseAssets(await response.text(),releaseSourceSha(),{includeVoiceEvidence,includeWorkspaceFixes}),{status:response.status,statusText:response.statusText,headers});
}
