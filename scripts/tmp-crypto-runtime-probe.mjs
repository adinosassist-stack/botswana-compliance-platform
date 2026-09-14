const enc=new TextEncoder();
const input=enc.encode('runtime-probe-input');

async function test(iterations){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const started=Date.now();
  try{
    const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
    return {ok:true,iterations,elapsedMs:Date.now()-started,bytes:new Uint8Array(bits).length};
  }catch(error){
    return {ok:false,iterations,elapsedMs:Date.now()-started,errorName:String(error?.name||''),errorMessage:String(error?.message||error).slice(0,200)};
  }
}

export default {
  async fetch(request){
    if(new URL(request.url).pathname!=='/probe')return new Response('not found',{status:404});
    const results=[];
    for(const iterations of [10000,99999,100000,100001,120000])results.push(await test(iterations));
    return Response.json({runtime:'cloudflare-remote-preview',results},{headers:{'cache-control':'no-store'}});
  }
};
