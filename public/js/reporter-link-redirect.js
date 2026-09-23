(()=>{
  const hash=String(location.hash||"");
  if(!hash.startsWith("#report="))return;
  const path=location.pathname.replace(/\/+$/,"")||"/";
  if(path==="/app")return;
  location.replace("/app/"+hash);
})();
