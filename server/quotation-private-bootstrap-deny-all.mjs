/**
 * DENY-ALL, SOURCE-ONLY bootstrap for a standard quotation rehearsal Worker.
 *
 * Do not deploy under PREPARE_QUOTATION_AUTH_PRIVATE_WORKER_VERSION_ONLY:
 * that authorization prohibits even a transient public URL, which the initial
 * standard Worker creation cannot atomically exclude.
 *
 * A completely new, explicit owner + independent thusico scope is necessary
 * before installing this deny-all bootstrap. This file contains no auth code,
 * tenants, secrets, bindings, handlers, logs, redirects or external requests.
 */
const denialHeaders = Object.freeze({
  'content-type':'text/plain; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-robots-tag':'noindex, nofollow'
});
const deny = () => new Response('Not Found', {
  status:404,
  headers:denialHeaders
});
export default Object.freeze({
  fetch(){return deny();}
});
