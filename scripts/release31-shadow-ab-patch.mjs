import fs from 'node:fs';

const source='scripts/production-synthetic-browser-wrapper.mjs';
const target='scripts/.shadow-transport-ab.mjs';
let text=fs.readFileSync(source,'utf8');

const helper=String.raw`
async function installShadowTransport(page){
  await page.addInitScript(()=>{
    const nativeFetch=globalThis.fetch.bind(globalThis);
    globalThis.fetch=(input,init)=>{
      try{
        const raw=input instanceof Request?input.url:String(input);
        const url=new URL(raw,location.href);
        const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
        if(method==='GET'&&url.origin===location.origin&&url.pathname==='/'&&url.searchParams.has('__thebe_api_path')){
          const logical=String(url.searchParams.get('__thebe_api_path')||'');
          if(logical==='/api'||logical.startsWith('/api/')){
            const shadow=new URL(logical==='/api'?'/__thebe_api':'/__thebe_api'+logical.slice(4),url.origin);
            const logicalQuery=url.searchParams.get('__thebe_api_query');
            if(logicalQuery)shadow.search=logicalQuery.startsWith('?')?logicalQuery:'?'+logicalQuery;
            if(input instanceof Request){
              const replacement=new Request(shadow.href,{
                method:input.method,
                headers:input.headers,
                credentials:input.credentials,
                cache:input.cache,
                redirect:input.redirect,
                referrer:input.referrer,
                referrerPolicy:input.referrerPolicy,
                integrity:input.integrity,
                keepalive:input.keepalive,
                mode:input.mode,
                signal:input.signal
              });
              return nativeFetch(replacement,init);
            }
            return nativeFetch(shadow.href,init);
          }
        }
      }catch{}
      return nativeFetch(input,init);
    };
  });
}
`;

const marker='async function runBrowserProof(credentials){';
const desktop='    const page=await desktop.newPage();';
const mobile='    const mobilePage=await mobile.newPage();';
if(!text.includes(marker)||text.split(desktop).length!==2||text.split(mobile).length!==2)throw new Error('canonical wrapper shape drifted');
text=text.replace(marker,helper+'\n'+marker);
text=text.replace(desktop,desktop+'\n    await installShadowTransport(page);');
text=text.replace(mobile,mobile+'\n    await installShadowTransport(mobilePage);');
fs.writeFileSync(target,text);
console.log('SHADOW_TRANSPORT_AB_WRAPPER_READY');
