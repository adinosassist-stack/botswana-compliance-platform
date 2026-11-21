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
/** Caller must supply an already authorized PDF Blob; never use a public URL. */
export async function shareDocumentPdf({navigatorApi,blob,filename,message}={}) {
  if(!(blob instanceof Blob)||blob.type!=="application/pdf"||blob.size<8||blob.size>20*1024*1024)
    throw new TypeError("invalid_pdf");
  // MIME type/extension can be forged. Refuse obviously non-PDF payloads
  // before offering an attachment to native sharing (no network or upload).
  const header=new Uint8Array(await blob.slice(0,5).arrayBuffer());
  if(header.length!==5||header.some((byte,i)=>byte!==[37,80,68,70,45][i]))
    throw new TypeError("invalid_pdf");
  if(typeof filename!=="string"||!/^[a-zA-Z0-9_-]{1,80}\.pdf$/.test(filename))throw new TypeError("invalid_filename");
  if(!message||typeof message.title!=="string"||typeof message.text!=="string")throw new TypeError("invalid_message");
  if(typeof File==="undefined")return Object.freeze({shared:false,reason:"file_api_unavailable"});
  const file=new File([blob],filename,{type:"application/pdf"});
  if(typeof navigatorApi?.share!=="function"||typeof navigatorApi?.canShare!=="function"||!navigatorApi.canShare({files:[file]}))return Object.freeze({shared:false,reason:"native_share_unavailable"});
  await navigatorApi.share({files:[file],title:message.title,text:message.text});
  return Object.freeze({shared:true});
}
