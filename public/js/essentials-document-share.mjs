/** Essentials: user-initiated document sharing; no WhatsApp provider or automatic send. */
export function buildDocumentShare({kind,reference,customerName,amountBwp}={}) {
  if (!["quotation","invoice"].includes(kind)) throw new TypeError("invalid_kind");
  const clean=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(v)?v.trim():null;
  const ref=clean(reference,80), customer=clean(customerName,150);
  if(!ref||!customer) throw new TypeError("invalid_document");
  if(typeof amountBwp!=="string"||!/^(0|[1-9]\d{0,9})\.\d{2}$/.test(amountBwp))throw new TypeError("invalid_amount");
  const title=kind==="quotation"?"Quotation":"Invoice";
  return Object.freeze({title:`${title} ${ref}`,text:`${title} ${ref} for ${customer} — BWP ${amountBwp}. Please see the attached PDF.`});
}
const preparedFiles=new WeakSet();
/** Validate and prepare before the user taps Share. No network or upload. */
export async function prepareDocumentPdf({blob,filename}={}) {
  if(!(blob instanceof Blob)||blob.size<8||blob.size>20*1024*1024)
    throw new TypeError("invalid_pdf");
  // Some mobile file pickers return generic MIME metadata for saved PDFs.
  if(!["application/pdf","application/octet-stream",""].includes(blob.type))
    throw new TypeError("invalid_pdf");
  // MIME type/extension can be forged. Refuse obviously non-PDF payloads
  // before offering an attachment to native sharing (no network or upload).
  const header=new Uint8Array(await blob.slice(0,5).arrayBuffer());
  if(header.length!==5||header.some((byte,i)=>byte!==[37,80,68,70,45][i]))
    throw new TypeError("invalid_pdf");
  if(typeof filename!=="string"||!/^[a-zA-Z0-9_-]{1,80}\.pdf$/.test(filename))throw new TypeError("invalid_filename");
  if(typeof File==="undefined")return null;
  const file=new File([blob],filename,{type:"application/pdf"});
  preparedFiles.add(file);
  return file;
}
/** Call directly inside the click handler: no await or asynchronous file read before share. */
export async function sharePreparedDocumentPdf({navigatorApi,file,message}={}) {
  if(!message||typeof message.title!=="string"||typeof message.text!=="string")throw new TypeError("invalid_message");
  if(file===null)return Object.freeze({shared:false,reason:"file_api_unavailable"});
  if(!preparedFiles.has(file))throw new TypeError("unprepared_pdf");
  if(typeof navigatorApi?.share!=="function"||typeof navigatorApi?.canShare!=="function"||!navigatorApi.canShare({files:[file]}))return Object.freeze({shared:false,reason:"native_share_unavailable"});
  // File only, so Android share targets receive the attachment, not a URL or text.
  await navigatorApi.share({files:[file]});
  return Object.freeze({shared:true});
}
/** Compatibility wrapper. Interactive UIs must use the two-stage API above. */
export async function shareDocumentPdf({navigatorApi,blob,filename,message}={}) {
  const file=await prepareDocumentPdf({blob,filename});
  return sharePreparedDocumentPdf({navigatorApi,file,message});
}
