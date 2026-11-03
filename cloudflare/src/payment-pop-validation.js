// Receipt bytes are untrusted. Validation does not confirm bank settlement.
export const MAX_POP_BYTES = 3670016;
export function validatePopUpload(bytes, name, contentType) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || bytes.length > MAX_POP_BYTES) throw new Error("invalid_pop_size");
  const extensions = {"application/pdf":[".pdf"],"image/jpeg":[".jpg",".jpeg"],"image/png":[".png"]};
  const type = String(contentType || "").toLowerCase();
  const filename = String(name || "").toLowerCase();
  if (!extensions[type] || filename.length > 120 || !extensions[type].some(ext => filename.endsWith(ext))) throw new Error("invalid_pop_type");
  if (filename.includes("/") || filename.includes("\\") || /[\u0000-\u001f\u007f]/.test(filename)) throw new Error("invalid_pop_name");
  const pdf = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  if (!(type === "application/pdf" && pdf || type === "image/jpeg" && jpg || type === "image/png" && png)) throw new Error("pop_signature_mismatch");
  return {bytes:bytes.length,contentType:type,scanStatus:"pending"};
}
export function popViewPermitted(item) {
  return item?.scan_status === "clean" && item?.deleted_at == null;
}
