/** Default-deny validation for future tenant-scoped document export jobs. No rendering or storage. */
export const EXPORT_FORMATS = Object.freeze(["pdf", "docx", "pptx"]);
export const EXPORT_TYPES = Object.freeze(["report", "letter", "research", "proposal", "presentation"]);
const id = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export function validateAiExportRequest(request, context) {
  if (!context || !id(context.tenantId) || !id(context.actorId) ||
      context.authenticated !== true || context.workspaceMember !== true) {
    return {ok:false, reason:"unauthorized"};
  }
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      !id(request.conversationId) || !id(request.messageId) ||
      !EXPORT_FORMATS.includes(request.format) || !EXPORT_TYPES.includes(request.documentType)) {
    return {ok:false, reason:"invalid_request"};
  }
  if (request.documentType === "presentation" && request.format === "docx") {
    return {ok:false, reason:"unsupported_combination"};
  }
  if (own(request,"tenantId") || own(request,"actorId") || own(request,"downloadUrl") ||
      own(request,"content") || own(request,"html")) {
    return {ok:false, reason:"untrusted_request_fields"};
  }
  const options=request.options ?? {};
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(key=>!["title","language","pageSize","slideCount"].includes(key)) ||
      (own(options,"title") && (typeof options.title !== "string" || options.title.length>160)) ||
      (own(options,"language") && (typeof options.language !== "string" || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(options.language))) ||
      (own(options,"pageSize") && !["A4","Letter"].includes(options.pageSize)) ||
      (own(options,"slideCount") && (!Number.isSafeInteger(options.slideCount) || options.slideCount<1 || options.slideCount>40))) {
    return {ok:false, reason:"invalid_options"};
  }
  if (request.format !== "pptx" && own(options,"slideCount")) {
    return {ok:false, reason:"invalid_options"};
  }
  return {ok:true, value:{
    tenantId:context.tenantId, actorId:context.actorId,
    conversationId:request.conversationId, messageId:request.messageId,
    format:request.format, documentType:request.documentType, options:{...options}
  }};
}
