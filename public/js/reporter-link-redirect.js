(()=>{
  const hash=String(location.hash||"");
  const path=location.pathname.replace(/\/+$/,"")||"/";
  if(path==="/report"&&!document.querySelector('script[data-reporter-money-v331]')){
    const script=document.createElement("script");
    script.src="/js/reporter-money-v331.js?v=20261011a";
    script.dataset.reporterMoneyV331="1";
    script.async=false;
    document.head.appendChild(script);
  }
  if(path==="/report"&&!document.querySelector('script[data-reporter-evidence-v332]')){
    const evidence=document.createElement("script");
    evidence.src="/js/reporter-evidence-v332.js?v=20261011a";
    evidence.dataset.reporterEvidenceV332="1";
    evidence.async=false;
    document.head.appendChild(evidence);
  }
  if(hash.startsWith("#report=")){
    if(path==="/report")return;
    location.replace("/report/?entry=legacy-link&v=20260923e"+hash);
    return;
  }
  if(path!=="/"&&path!=="/home.html")return;
  if(!document.querySelector('link[data-public-marketing-v249]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="/assets/public-marketing-v249.css?v=20261010a";
    link.dataset.publicMarketingV249="1";
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-public-marketing-v249]')){
    const script=document.createElement("script");
    script.src="/js/public-marketing-v249.js?v=20261010a";
    script.dataset.publicMarketingV249="1";
    script.async=false;
    document.head.appendChild(script);
  }
  if(!document.querySelector('link[data-market-conversion-v11]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="/assets/market-conversion-v11.css?v=20261013b";
    link.dataset.marketConversionV11="1";
    document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-market-compact-v12]')){
    const compact=document.createElement("link");
    compact.rel="stylesheet";
    compact.href="/assets/market-compact-v12.css?v=20261013a";
    compact.dataset.marketCompactV12="1";
    document.head.appendChild(compact);
  }
  if(!document.querySelector('link[data-market-conversion-v13]')){
    const conversion=document.createElement("link");
    conversion.rel="stylesheet";
    conversion.href="/assets/market-conversion-v13.css?v=20261013a";
    conversion.dataset.marketConversionV13="1";
    document.head.appendChild(conversion);
  }
  if(!document.querySelector('link[data-market-layout-v14]')){
    const layout=document.createElement("link");
    layout.rel="stylesheet";
    layout.href="/assets/market-layout-v14.css?v=20261013a";
    layout.dataset.marketLayoutV14="1";
    document.head.appendChild(layout);
  }
  if(!document.querySelector('script[data-market-conversion-v11]')){
    const script=document.createElement("script");
    script.src="/js/market-conversion-v11.js?v=20261013b";
    script.dataset.marketConversionV11="1";
    script.async=false;
    script.addEventListener("error",()=>{
      const photo=document.querySelector('#botswana .country-photo');
      if(photo){
        photo.remove();
        const grid=document.querySelector('#botswana .country-grid');
        if(grid)grid.style.gridTemplateColumns="1fr";
      }
    },{once:true});
    document.head.appendChild(script);
  }
  if(!document.querySelector('script[data-market-conversion-v13]')){
    const conversion=document.createElement("script");
    conversion.src="/js/market-conversion-v13.js?v=20261013a";
    conversion.dataset.marketConversionV13="1";
    conversion.async=false;
    document.head.appendChild(conversion);
  }
  if(!document.querySelector('script[data-conversion-funnel-v14]')){
    const funnel=document.createElement("script");
    funnel.src="/js/conversion-funnel-v14.js?v=20261013b";
    funnel.dataset.conversionFunnelV14="1";
    funnel.async=false;
    document.head.appendChild(funnel);
  }
})();
