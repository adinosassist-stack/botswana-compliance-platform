/** Bounded, format-independent document model for the future renderer. */
const types=new Set(["paragraph","heading","bullet"]);
const plain=value=>typeof value==="string"&&value.length>0&&value.length<=12000&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function validateExportDocument(model){
 if(!model||typeof model!=="object"||Array.isArray(model)||
    !plain(model.title)||model.title.length>160||
    !Array.isArray(model.blocks)||model.blocks.length<1||model.blocks.length>300)
   return {ok:false,reason:"invalid_document"};
 let chars=model.title.length;
 const blocks=[];
 for(const block of model.blocks){
   if(!block||typeof block!=="object"||Array.isArray(block)||
      !types.has(block.type)||!plain(block.text)||
      (block.type==="heading"&&block.text.length>240))
     return {ok:false,reason:"invalid_block"};
   chars+=block.text.length;
   if(chars>120000)return {ok:false,reason:"document_too_large"};
   blocks.push({type:block.type,text:block.text});
 }
 const references=model.references??[];
 if(!Array.isArray(references)||references.length>100)return {ok:false,reason:"invalid_references"};
 const safeReferences=[];
 for(const reference of references){
   if(!reference||!plain(reference.label)||reference.label.length>200||
      typeof reference.url!=="string"||reference.url.length>2000)
     return {ok:false,reason:"invalid_reference"};
   let parsed;
   try{parsed=new URL(reference.url)}catch{return {ok:false,reason:"invalid_reference"}}
   if(parsed.protocol!=="https:"||parsed.username||parsed.password)
     return {ok:false,reason:"invalid_reference"};
   safeReferences.push({label:reference.label,url:parsed.href});
 }
 return {ok:true,value:{title:model.title,blocks,references:safeReferences}};
}
