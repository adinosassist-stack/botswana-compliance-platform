(()=>{
  const hash=String(location.hash||"");
  if(!hash.startsWith("#report="))return;
  const path=location.pathname.replace(/\/+$/,"")||"/";
  if(path==="/report")return;
  location.replace("/report/"+hash);
})();
