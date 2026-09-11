(function bootstrapBwComponents(global){
  "use strict";
  function element(tag,{className="",text=null,attrs={}}={},children=[]){
    const node=document.createElement(tag);if(className)node.className=className;if(text!==null)node.textContent=String(text);
    for(const [key,value] of Object.entries(attrs)){if(value===false||value==null)continue;if(value===true)node.setAttribute(key,"");else node.setAttribute(key,String(value))}
    for(const child of children.flat()){if(child==null)continue;node.append(child instanceof Node?child:document.createTextNode(String(child)))}return node;
  }
  function renderList(target,items,renderItem,{emptyText="Nothing to show."}={}){
    if(!target)return;const frag=document.createDocumentFragment();
    if(!Array.isArray(items)||!items.length)frag.appendChild(element("div",{className:"muted small",text:emptyText}));
    else for(const item of items){const node=renderItem(item);if(node)frag.appendChild(node)}
    target.replaceChildren(frag);
  }
  global.BW=global.BW||{};global.BW.components=Object.freeze({element,renderList});
})(window);
