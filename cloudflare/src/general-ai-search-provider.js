/**
 * Read-only Brave Web Search adapter. Server-side API key required.
 * Uses a fixed HTTPS search endpoint; never fetches arbitrary result URLs.
 * Snippets are treated as untrusted evidence.
 */
export function createGeneralAiSearchProvider({apiKey,fetchImpl=globalThis.fetch}={}){
  if(typeof apiKey!=="string"||!apiKey.trim())throw Error("research_provider_not_configured");
  return async function research({query}={}){
    const q=String(query||"").trim().slice(0,500);
    if(!q)throw Error("invalid_search_query");
    const endpoint=new URL("https://api.search.brave.com/res/v1/web/search");
    endpoint.searchParams.set("q",q);
    endpoint.searchParams.set("count","8");
    const controller=new AbortController();
    const deadline=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetchImpl(endpoint.href,{
        method:"GET",redirect:"error",signal:controller.signal,
        headers:{"accept":"application/json","x-subscription-token":apiKey}
      });
      if(!response.ok)throw Error("research_provider_unavailable");
      const data=await response.json();
      const hits=Array.isArray(data?.web?.results)?data.web.results:[];
      return hits.slice(0,8).map(row=>({
        url:row.url,title:row.title,
        excerpt:String(row.description||"").replace(/<[^>]*>/g," ").slice(0,1800),
        publishedAt:/^\d{4}-\d\d-\d\d/.test(String(row.page_age||""))?String(row.page_age).slice(0,10):null,
        retrievedAt:new Date().toISOString()
      }));
    }finally{clearTimeout(deadline)}
  };
}
