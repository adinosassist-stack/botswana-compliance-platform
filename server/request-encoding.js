const MUTATING=new Set(['POST','PUT','PATCH','DELETE']);
export function nodeRequestEncodingAllowed(value){const enc=String(value||'').trim().toLowerCase();return enc===''||enc==='identity'}
export function rejectEncodedApiBody(method,pathname,contentEncoding){return MUTATING.has(String(method||'').toUpperCase())&&String(pathname||'').startsWith('/api/')&&!nodeRequestEncodingAllowed(contentEncoding)}
