(()=>{
  const hash=String(location.hash||"");
  const path=location.pathname.replace(/\/+$/,"")||"/";
  if(hash.startsWith("#report=")){
    if(path!=="/report")location.replace("/report/?entry=legacy-link&v=20260923e"+hash);
    return;
  }
  if(path!=="/"&&path!=="/home.html")return;
  if(!document.querySelector('link[data-public-marketing-v249]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="/assets/public-marketing-v249.css?v=20261009a";
    link.dataset.publicMarketingV249="1";
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-public-marketing-v249]')){
    const script=document.createElement("script");
    script.src="/js/public-marketing-v249.js?v=20261009a";
    script.dataset.publicMarketingV249="1";
    script.async=false;
    document.head.appendChild(script);
  }
})();
