(function loadExecutivePersonalizationBundle(global){
  "use strict";

  // Compatibility contract for the exact preserved v180 personalization core loaded first below.
  // Keep these markers declarative: the implementation remains in executive-personalization-v180.js.
  const RELEASE="20260929-v180";
  const LEGACY_CONTRACT=Object.freeze({
    roleFraming:Object.freeze(["Management priority today","Your priority today"]),
    actionSelector:"#ownerActionPanel .owner-action-list .owner-action",
    actionHandoff:"action.sourceButton.click()",
    ownerRevenueGate:'isOwner()&&revenueText.includes("no monthly target projection yet")',
    ownerCashGate:'isOwner()&&cashText.includes("Not configured")',
    ownerLabourGate:'isOwner()&&labourText.includes("Not configured")',
    reportingEvidence:'revenueText.includes("needs more reporting history")',
    salesEvidence:'salesText.includes("Record enough resolved quotations")'
  });

  const scripts=[
    "/js/executive-personalization-v180.js?v=20260929-v180",
    "/js/owner-first-home-v328.js?v=20261015-owner-attention-v329"
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

  global.ThebeExecutivePersonalizationBundle=Object.freeze({
    release:RELEASE,
    legacyContract:LEGACY_CONTRACT,
    layers:Object.freeze(scripts.slice())
  });

  scripts.reduce((chain,src)=>chain.then(()=>load(src)),Promise.resolve()).catch(error=>{
    console.error("[Thebe] executive personalization bundle unavailable",error);
  });
})(window);
