(function loadExecutivePersonalizationBundle(){
  "use strict";
  const scripts=[
    "/js/executive-personalization-v180.js?v=20260929-v180",
    "/js/owner-first-home-v328.js?v=20261015-owner-first-home-v328"
  ];
  function load(src){
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=src;
      script.async=false;
      script.dataset.thebeExecutiveBundle="true";
      script.addEventListener("load",resolve,{once:true});
      script.addEventListener("error",()=>reject(new Error(`Failed to load ${src}`)),{once:true});
      document.head.append(script);
    });
  }
  scripts.reduce((chain,src)=>chain.then(()=>load(src)),Promise.resolve()).catch(error=>{
    console.error("[Thebe] executive personalization bundle unavailable",error);
  });
})();
