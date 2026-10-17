(function(global){
  "use strict";
  const RELEASE="20261015-people-directory-ux";

  function employeeItems(register){
    return [...register.querySelectorAll(":scope > .item")];
  }

  function normalise(value){
    return String(value||"").toLocaleLowerCase().trim();
  }

  function mountDirectorySearch(){
    const root=document.getElementById("employees");
    const register=document.getElementById("employeeRegister");
    if(!root||!register)return false;
    if(root.querySelector(".employee-directory-tools-v20261015"))return true;

    const panel=root.querySelector(".employee-register-panel")||register.parentElement;
    const heading=root.querySelector(".employee-register-head");
    if(!panel)return false;

    const tools=document.createElement("div");
    tools.className="employee-directory-tools-v20261015";
    tools.setAttribute("role","search");
    tools.setAttribute("aria-label","Search employee directory");

    const search=document.createElement("input");
    search.type="search";
    search.className="employee-directory-search-v20261015";
    search.placeholder="Search name, role or work detail";
    search.autocomplete="off";
    search.spellcheck=false;
    search.setAttribute("aria-label","Search employees");

    const clear=document.createElement("button");
    clear.type="button";
    clear.className="employee-directory-clear-v20261015";
    clear.textContent="Clear";
    clear.disabled=true;

    const count=document.createElement("span");
    count.className="employee-directory-count-v20261015";
    count.setAttribute("role","status");
    count.setAttribute("aria-live","polite");

    const empty=document.createElement("div");
    empty.className="employee-directory-empty-v20261015";
    empty.textContent="No employees match this search.";
    empty.hidden=true;

    function applyFilter(){
      const query=normalise(search.value);
      const items=employeeItems(register);
      let visible=0;
      for(const item of items){
        const match=!query||normalise(item.textContent).includes(query);
        item.hidden=!match;
        if(match)visible+=1;
      }
      clear.disabled=!query;
      count.textContent=query?`${visible} of ${items.length} employees`:`${items.length} employees`;
      empty.hidden=visible!==0||items.length===0;
    }

    search.addEventListener("input",applyFilter);
    clear.addEventListener("click",()=>{
      search.value="";
      applyFilter();
      search.focus();
    });

    tools.append(search,clear,count);
    if(heading)heading.insertAdjacentElement("afterend",tools);else panel.insertBefore(tools,register);
    register.insertAdjacentElement("afterend",empty);

    const observer=new MutationObserver(applyFilter);
    observer.observe(register,{childList:true,subtree:true,characterData:true});
    applyFilter();
    return true;
  }

  function scheduleMount(){
    mountDirectorySearch();
    global.setTimeout?.(mountDirectorySearch,80);
    global.setTimeout?.(mountDirectorySearch,300);
  }

  global.addEventListener("thebe:workspace-view-change",event=>{
    if(String(event?.detail?.id||"")==="employees")scheduleMount();
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scheduleMount,{once:true});else scheduleMount();

  global.ThebePeopleDirectoryUX=Object.freeze({release:RELEASE,mount:mountDirectorySearch});
})(window);
