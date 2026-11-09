/**
 * Intentionally inert Thebe Life private staging Worker.
 * No route dispatch, asset serving, API endpoints, auth surface, or D1 queries.
 * Even when uploaded to Cloudflare, this module cannot serve Life data.
 */
export default {
  async fetch() {
    return new Response(JSON.stringify({error:'private_staging_unavailable'}),{
      status:404,
      headers:{
        'content-type':'application/json; charset=utf-8',
        'cache-control':'no-store',
        'x-content-type-options':'nosniff',
        'x-robots-tag':'noindex, nofollow'
      }
    });
  }
};
