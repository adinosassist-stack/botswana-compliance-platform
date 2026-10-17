// Boundary fake implements the documented R2 conditional-write contract.
export class Bucket {
  rows=new Map(); version=0; waiting=[]; race=false; failAfterCommit=false;
  async get(key){
    const row=this.rows.get(key);
    if(this.race&&key.endsWith('/manifest.json')){
      await new Promise(resolve=>{this.waiting.push(resolve);if(this.waiting.length===2){this.race=false;this.waiting.splice(0).forEach(fn=>fn());}});
    }
    if(!row)return null;
    return {etag:row.etag,text:async()=>row.data,body:row.data};
  }
  async put(key,data,options={}){
    await this.beforePut?.(key,data,options);
    const row=this.rows.get(key),condition=options.onlyIf;
    if(condition?.etagMatches&&row?.etag!==condition.etagMatches)return null;
    if(condition?.etagDoesNotMatch==='*'&&row)return null;
    const etag=String(++this.version);
    this.rows.set(key,{etag,data:typeof data==='string'?data:new Uint8Array(data)});
    await this.afterPut?.(key,data,options);
    if(this.failAfterCommit&&key.endsWith('/manifest.json')){this.failAfterCommit=false;throw new Error('lost acknowledgement');}
    return {etag};
  }
  async delete(key){for(const item of Array.isArray(key)?key:[key])this.rows.delete(item);}
  async list({prefix,limit=100}){const keys=[...this.rows.keys()].filter(k=>k.startsWith(prefix)).sort();return {objects:keys.slice(0,limit).map(key=>({key})),truncated:keys.length>limit};}
}
