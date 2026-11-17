// #2578: inert isolated staging bootstrap: no public handlers, no data access.
// Intentionally independent of the large production runtime and synthetic D1.
// Do not add routes or Worker preview URLs without independent approval.
export default {
 async fetch(){return new Response('Not Found',{status:404,headers:{
   'cache-control':'no-store','content-type':'text/plain; charset=utf-8',
   'x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'
 }});}
};
