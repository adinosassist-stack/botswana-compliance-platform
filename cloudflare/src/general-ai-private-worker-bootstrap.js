/**
 * Inert, private-only initial Worker bootstrap.
 * No Queue handler, bindings, provider calls, tenant data, or business logic.
 * Deploying this alone does not enable customer AI or Queue consumption.
 */
export default {
  fetch() {
    return new Response('Service unavailable', {
      status: 503,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  },
};
