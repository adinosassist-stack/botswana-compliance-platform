import {releaseSourceSha} from './client-runtime-identity.js';

const DOCK_RECOVERY_GEOMETRY_SRC='/js/thebe-dock-recovery-geometry-v269.js';
const LIVE_PREVIEW_FALLBACK_SRC='/js/thebe-live-preview-fallback-v272.js';

export function versionReleaseAssets(html,sha=releaseSourceSha()){
  if(!/^[0-9a-f]{40}$/.test(sha))return String(html||'');
  let source=String(html||'');
  if(!source.includes(DOCK_RECOVERY_GEOMETRY_SRC))source=source.replace(/<\/body\s*>/i,`<script src="${DOCK_RECOVERY_GEOMETRY_SRC}" defer></script>\n</body>`);
  if(!source.includes(LIVE_PREVIEW_FALLBACK_SRC))source=source.replace(/<\/body\s*>/i,`<script src="${LIVE_PREVIEW_FALLBACK_SRC}" defer></script>\n</body>`);
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
  return new Response(versionReleaseAssets(await response.text()),{status:response.status,statusText:response.statusText,headers});
}
