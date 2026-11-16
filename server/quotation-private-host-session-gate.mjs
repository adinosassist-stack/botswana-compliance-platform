/**
 * Inert, source-only, private quotation host/session trust gate.
 * The host must supply real cookie-to-session and active-membership verifiers.
 * Importing does not mount routes, deploy, register a PDF, or grant approvals.
 * No user-controlled tenant or company field is forwarded to the handlers.
 */
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = code => { throw Error(code); };
const reject = (status, code) => new Response(JSON.stringify({ok:false,error:code}), {
  status, headers:{'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store','x-content-type-options':'nosniff'}
});
const role = value => typeof value === 'string' ? value.toLowerCase() : '';
const safeMethod = method => method === 'GET' || method === 'HEAD';

/**
 * A clean result here is NOT proof that callbacks are production-authentic.
 * Separately review host verifier implementations and qualify them in private
 * staging before any Worker binding or exposure.
 */
export function createQuotationPrivateHostSessionGate({
  environment, enabled=false, expectedTenantId, allowedPrivateOrigin,
  readVerifiedSession, verifyActiveMembership, verifyMutation,
  quotationHandlers
}={}) {
  if (enabled !== true || environment !== 'quotation-private-staging')
    fail('quotation_host_gate_disabled');
  if (!uuid(expectedTenantId) || typeof allowedPrivateOrigin !== 'string' ||
      typeof readVerifiedSession !== 'function' ||
      typeof verifyActiveMembership !== 'function' ||
      typeof verifyMutation !== 'function' ||
      typeof quotationHandlers?.handle !== 'function')
    fail('quotation_host_gate_unconfigured');
  let origin;
  try {
    const parsed = new URL(allowedPrivateOrigin);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash ||
        !parsed.hostname || parsed.hostname === 'thebedesk.com' ||
        parsed.hostname === 'www.thebedesk.com' ||
        parsed.hostname.endsWith('.workers.dev') ||
        parsed.hostname.includes('localhost'))
      fail('quotation_private_origin_required');
    origin = parsed.origin;
  } catch { fail('quotation_private_origin_required'); }
  return Object.freeze({
    async handle(request) {
      if (!(request instanceof Request)) return reject(400,'invalid_request');
      const url = new URL(request.url);
      if (url.origin !== origin) return reject(404,'not_found');
      const method = request.method.toUpperCase();
      if (!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))
        return reject(405,'method_not_allowed');
      let session;
      try { session = await readVerifiedSession({request}); }
      catch { return reject(401,'quotation_unauthenticated'); }
      if (!session || session.authenticated !== true ||
          !uuid(session.tenantId) || session.tenantId !== expectedTenantId ||
          !uuid(session.userId))
        return reject(401,'quotation_unauthenticated');
      const actor = Object.freeze({userId:session.userId, tenantId:session.tenantId,
        role:role(session.role)});
      let active;
      try {
        active = await verifyActiveMembership({request,actor,
          tenantId:expectedTenantId,userId:actor.userId});
      } catch { return reject(403,'quotation_membership_unverified'); }
      if (!active || active.active !== true ||
          active.tenantId !== expectedTenantId ||
          active.userId !== actor.userId ||
          !['owner','admin','manager','staff'].includes(role(active.role)) ||
          role(active.role) !== actor.role)
        return reject(403,'quotation_membership_unverified');
      if (!safeMethod(method)) {
        if (!['owner','admin','manager'].includes(actor.role))
          return reject(403,'quotation_write_denied');
        if (request.headers.get('origin') !== origin)
          return reject(403,'quotation_origin_denied');
        let validMutation;
        try { validMutation = await verifyMutation({request,actor,
          companyId:expectedTenantId}); }
        catch { return reject(403,'quotation_mutation_denied'); }
        if (validMutation !== true) return reject(403,'quotation_mutation_denied');
      }
      try {
        return await quotationHandlers.handle({request,actor,companyId:expectedTenantId});
      } catch { return reject(500,'quotation_handler_failed'); }
    }
  });
}
