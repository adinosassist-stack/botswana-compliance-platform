(function installWorkspaceFocusVisibleGuard(global){
  "use strict";

  const RELEASE="20261004-workspace-focus-visible-v278";
  const STYLE_ID="thebeWorkspaceFocusVisibleGuardV278";

  function install(){
    if(document.getElementById(STYLE_ID))return false;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.dataset.release=RELEASE;
    style.textContent=`
/* V278 keyboard-focus visibility guard.
   :focus-visible keeps the treatment keyboard/modality aware and avoids mouse-click rings. */
#appShell :where(
  button,
  a[href],
  input:not([type="hidden"]),
  select,
  textarea,
  summary,
  [role="button"],
  [role="tab"],
  [role="menuitem"],
  [tabindex]:not([tabindex="-1"])
):focus-visible,
#thebeAiDock :where(
  button,
  a[href],
  input:not([type="hidden"]),
  select,
  textarea,
  summary,
  [role="button"],
  [role="tab"],
  [role="menuitem"],
  [tabindex]:not([tabindex="-1"])
):focus-visible,
#thebeAiDockPill:focus-visible{
  outline:3px solid #ffffff!important;
  outline-offset:2px!important;
  box-shadow:0 0 0 6px #075985!important;
}

@media (forced-colors:active){
  #appShell :where(
    button,a[href],input:not([type="hidden"]),select,textarea,summary,
    [role="button"],[role="tab"],[role="menuitem"],[tabindex]:not([tabindex="-1"])
  ):focus-visible,
  #thebeAiDock :where(
    button,a[href],input:not([type="hidden"]),select,textarea,summary,
    [role="button"],[role="tab"],[role="menuitem"],[tabindex]:not([tabindex="-1"])
  ):focus-visible,
  #thebeAiDockPill:focus-visible{
    outline:3px solid Highlight!important;
    outline-offset:2px!important;
    box-shadow:none!important;
  }
}
`;
    document.head.append(style);
    document.documentElement.dataset.workspaceFocusVisible=RELEASE;
    return true;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  global.ThebeWorkspaceFocusVisibleGuard=Object.freeze({release:RELEASE,install});
})(window);
