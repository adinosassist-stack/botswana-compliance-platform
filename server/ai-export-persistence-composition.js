/** Unmounted assembly of D1 metadata and private Cloudflare R2 object storage.
 * This module does not register API routes, migrations, workers or schedules.
 * enabled must be the literal boolean true and requires explicit trusted bindings.
 */
import {createAiExportD1Metadata} from "./ai-export-d1-metadata.js";
import {createAiExportR2Binding} from "./ai-export-r2-binding.js";
import {createAiPrivateObjectProvider} from "./ai-export-private-object-provider.js";
import {createPrivateAiExportStore} from "./ai-document-export-private-store.js";
export function createAiExportPersistence({enabled=false,db,r2Binding,bucketName,clock=()=>Date.now(),makeId}={}){
 if(enabled!==true)return Object.freeze({enabled:false,store:null});
 if(!db||typeof db.prepare!=="function"||!r2Binding||
    typeof r2Binding.put!=="function"||typeof r2Binding.get!=="function"||
    typeof bucketName!=="string"||!bucketName.trim()||
    typeof clock!=="function")throw new TypeError("private_export_bindings_required");
 const metadata=createAiExportD1Metadata({db,clock,...(makeId?{makeId}:{})});
 const privateR2=createAiExportR2Binding({binding:r2Binding,clock});
 const objects=createAiPrivateObjectProvider({
  bucket:bucketName,putObject:privateR2.putObject,getObject:privateR2.getObject,clock
 });
 const store=createPrivateAiExportStore({metadata,objects,clock});
 return Object.freeze({enabled:true,store});
}
