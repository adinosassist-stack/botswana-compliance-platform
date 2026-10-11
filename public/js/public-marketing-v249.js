(()=>{
  "use strict";
  const storyRelease="20261011-public-story-v249-preserved";
  const unifiedDockRelease="20261011-unified-dock-voice-v330";
  import(`/js/public-marketing-v249-base.js?release=${storyRelease}`)
    .then(()=>import(`/js/thebe-unified-dock-v330.js?release=${unifiedDockRelease}`))
    .catch(error=>console.error("Public Thebe experience failed to load",error));
})();
