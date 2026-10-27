import assert from "node:assert/strict";
import {test} from "node:test";
import {renderAiDocument} from "../server/ai-document-renderer.js";
import {hasExpectedAiExportSignature} from "../server/ai-export-artifact-signature.js";
const model={title:"Thebe export qualification",blocks:[
 {type:"heading",text:"Summary"},
 {type:"paragraph",text:"Monthly revenue P 3,500"},
 {type:"bullet",text:"Evidence reviewed"}
],references:[{label:"Reference",url:"https://example.org/report"}]};
test("actual renderer output matches each export container guard",async()=>{
 for(const format of ["pdf","docx","pptx"]){
  const output=await renderAiDocument(model,format);
  assert.equal(Buffer.isBuffer(output),true);
  if(!hasExpectedAiExportSignature(output,format)&&format!=="pdf"){
    // Generated synthetic fixture only: report ZIP metadata, never document contents.
    let end=-1;for(let i=output.length-22;i>=Math.max(0,output.length-65557);i--){
      if(output.readUInt32LE(i)===0x06054b50&&i+22+output.readUInt16LE(i+20)===output.length){end=i;break}
    }
    const names=[];let entrySummary=[];
    if(end!==-1){
      const count=output.readUInt16LE(end+10),start=output.readUInt32LE(end+16),size=output.readUInt32LE(end+12);
      let off=start;
      for(let i=0;i<Math.min(2000,count)&&off+46<=end;i++){
        if(output.readUInt32LE(off)!==0x02014b50)break;
        const nl=output.readUInt16LE(off+28),extra=output.readUInt16LE(off+30),comment=output.readUInt16LE(off+32);
        const name=output.toString("utf8",off+46,off+46+nl);names.push(name);
        entrySummary.push({name,flags:output.readUInt16LE(off+8),method:output.readUInt16LE(off+10),packed:output.readUInt32LE(off+20),expanded:output.readUInt32LE(off+24)});
        off+=46+nl+extra+comment;
      }
      console.error("Generated OOXML structural diagnostic",{format,length:output.length,count,start,size,end,entries:names.length,endsAtEnd:start+size===end,necessary:["[Content_Types].xml","_rels/.rels","ppt/presentation.xml"].map(name=>[name,names.includes(name)]),sample:entrySummary.slice(0,15)});
    }else console.error("Missing ZIP EOCD on synthetic fixture",{format,length:output.length,prefix:output.subarray(0,4).toString("hex")});
  }
  assert.equal(hasExpectedAiExportSignature(output,format),true,format);
  for(const wrong of ["pdf","docx","pptx"].filter(x=>x!==format)){
   assert.equal(hasExpectedAiExportSignature(output,wrong),false,format+" spoofed as "+wrong);
  }
 }
});
