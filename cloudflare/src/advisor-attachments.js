// Chat attachments are transient request data, separate from compliance evidence.
export const ADVISOR_ATTACHMENT_BODY_BYTES=3*1024*1024;
const MAX_FILE_BYTES=1024*1024,MAX_TOTAL_BYTES=2*1024*1024;
const TYPES={txt:"text/plain",md:"text/markdown",csv:"text/csv",json:"application/json",pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
const TEXT_EXTENSIONS=new Set(["txt","md","csv","json"]);
const failure=(error,message)=>({ok:false,error,message});

export function validateAdvisorAttachments(value){
  if(value===undefined)return {ok:true,files:[]};
  if(!Array.isArray(value)||value.length>3)return failure("invalid_attachments","Choose up to three files.");
  const files=[];let total=0;
  for(const item of value){
    if(!item||typeof item!=="object"||typeof item.name!=="string"||typeof item.data!=="string")return failure("invalid_attachment","The attachment is not valid.");
    const name=item.name.replace(/[\u0000-\u001f\u007f/\\]/g,"_").slice(0,120),ext=name.split(".").pop().toLowerCase(),type=TYPES[ext];
    if(!type)return failure("unsupported_attachment_type","Choose PDF, Word, Excel, PNG, JPEG, WebP or a text file.");
    if(!item.data.length||item.data.length>Math.ceil(MAX_FILE_BYTES/3)*4||(item.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)))return failure("invalid_attachment_data","The file is empty, invalid or larger than 1 MB.");
    let bytes;try{bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0))}catch{return failure("invalid_attachment_data","The attachment could not be decoded.")}
    total+=bytes.length;
    if(!bytes.length||bytes.length>MAX_FILE_BYTES||total>MAX_TOTAL_BYTES)return failure("attachment_size_limit","Choose files up to 1 MB each and 2 MB combined.");
    const starts=(signature)=>signature.every((n,i)=>bytes[i]===n);
    if((ext==="pdf"&&!starts([37,80,68,70,45]))||(ext==="png"&&!starts([137,80,78,71,13,10,26,10]))||(["jpg","jpeg"].includes(ext)&&!starts([255,216,255]))||(ext==="webp"&&(!starts([82,73,70,70])||new TextDecoder().decode(bytes.slice(8,12))!=="WEBP"))||(["docx","xlsx"].includes(ext)&&!starts([80,75,3,4])))return failure("attachment_type_mismatch","The file contents do not match its file type.");
    if(TEXT_EXTENSIONS.has(ext)){
      try{if(new TextDecoder("utf-8",{fatal:true}).decode(bytes).includes("\0"))throw new Error()}catch{return failure("invalid_attachment_text","Save the text file as UTF-8 and try again.")}
    }
    files.push({name,type,ext,bytes});
  }
  return {ok:true,files};
}

export async function readAdvisorAttachments(ai,files){
  const documents=[];let remaining=32000;
  for(const [index,file] of files.entries()){
    let text;
    if(TEXT_EXTENSIONS.has(file.ext))text=new TextDecoder().decode(file.bytes);
    else{
      if(typeof ai?.toMarkdown!=="function")throw Object.assign(new Error("Document reading is unavailable. Try a text file."),{code:"attachment_reader_unavailable"});
      let timer;
      try{
        const converted=await Promise.race([
          Promise.resolve().then(()=>ai.toMarkdown({name:file.name,blob:new Blob([file.bytes],{type:file.type})})),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Document reading timed out.")),25000)})
        ]);
        const result=Array.isArray(converted)?converted[0]:converted;
        if(!result||result.format==="error"||typeof result.data!=="string")throw new Error("The file could not be read. Try another file or export it as text.");
        text=result.data;
      }finally{clearTimeout(timer)}
    }
    text=text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g," ").trim();
    if(!text)throw new Error("The file has no readable content. Try another file.");
    const limit=Math.min(12000,remaining),truncated=text.length>limit;
    documents.push({ref:`FILE-${index+1}`,name:file.name,content:text.slice(0,limit),truncated});
    remaining-=Math.min(text.length,limit);
  }
  return documents;
}
