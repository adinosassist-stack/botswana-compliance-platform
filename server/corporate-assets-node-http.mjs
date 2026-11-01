/** Opt-in Node HTTP bridge. Register only behind existing server auth and feature gate. */
export function createAssetsNodeHttpHandler({handle,featureEnabled}={}){
 if(typeof handle!=='function'||typeof featureEnabled!=='function')throw new TypeError('assets_node_dependencies_required');
 return async function assetsNodeHttp(req,res){
  let path;
  try{path=new URL(req.url,'http://local.invalid').pathname}catch{path='/'}
  if(!['/api/assets','/api/assets/maintenance','/api/assets/insurance'].includes(path))return false;
  const respond=(status,body,headers={})=>{
   res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers,'cache-control':'no-store','x-content-type-options':'nosniff'});
   res.end(JSON.stringify(body));
  };
  let enabled=false;
  try{enabled=await featureEnabled(req)}catch{}
  if(enabled!==true){respond(404,{error:'not_found'});return true}
  try{
   const output=await handle({method:req.method,path,rawRequest:req});
   if(!output||!Number.isInteger(output.status)||output.status<100||output.status>599)throw new Error('invalid_adapter_response');
   respond(output.status,output.body,output.headers);return true;
  }catch{respond(503,{error:'assets_unavailable'});return true}
 };
}
