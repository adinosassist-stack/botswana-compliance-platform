(function bootstrapBwDialogService(global){
  "use strict";
  let active=null;
  function focusable(root){return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.offsetParent!==null)}
  function button(label,className="btn",type="button"){const el=document.createElement("button");el.type=type;el.className=className;el.textContent=String(label||"");return el}
  function fieldError(text=""){const el=document.createElement("div");el.className="muted small";el.setAttribute("role","alert");el.textContent=text;return el}
  function closeActive(value){if(!active)return;const {root,previous,resolve,onKey}=active;active=null;document.removeEventListener("keydown",onKey,true);root.remove();if(previous?.focus)previous.focus();resolve(value)}
  function createBase({title="Confirm action",message="",confirmLabel="Continue",cancelLabel="Cancel",danger=false}={}){
    if(active)closeActive(null);
    const previous=document.activeElement,root=document.createElement("div"),box=document.createElement("div"),head=document.createElement("div"),heading=document.createElement("h2"),copy=document.createElement("p"),body=document.createElement("div"),actions=document.createElement("div"),cancel=button(cancelLabel,"btn alt"),confirm=button(confirmLabel,danger?"btn danger":"btn");
    root.className="modal open bw-dialog-service";root.setAttribute("role","dialog");root.setAttribute("aria-modal","true");root.setAttribute("aria-hidden","false");
    box.className="modalbox";head.className="between row";heading.textContent=String(title||"Confirm action");heading.id=`bwDialogTitle_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;root.setAttribute("aria-labelledby",heading.id);copy.className="muted";copy.textContent=String(message||"");body.className="stack";actions.className="actions";
    head.appendChild(heading);box.append(head);if(message)box.append(copy);box.append(body,actions);actions.append(cancel,confirm);root.appendChild(box);document.body.appendChild(root);
    return {root,box,body,actions,cancel,confirm,previous};
  }
  function wire(base,{resolveValue,getValue,validate}={}){
    return new Promise(resolve=>{
      const finish=value=>closeActive(value),onKey=e=>{
        if(!active||active.root!==base.root)return;
        if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();finish(null);return}
        if(e.key!=="Tab")return;const items=focusable(base.root);if(!items.length){e.preventDefault();return}const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();e.stopImmediatePropagation();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();e.stopImmediatePropagation();first.focus()}
      };
      active={root:base.root,previous:base.previous,resolve,onKey};document.addEventListener("keydown",onKey,true);
      base.cancel.addEventListener("click",()=>finish(null));base.root.addEventListener("click",e=>{if(e.target===base.root)finish(null)});
      base.confirm.addEventListener("click",()=>{const value=getValue?getValue():resolveValue;if(validate&&!validate(value))return;finish(value)});
      requestAnimationFrame(()=>{const items=focusable(base.root);(items.find(el=>el.matches("input,textarea,select"))||base.confirm||items[0])?.focus()});
    });
  }
  function askConfirm({title="Confirm action",message="",confirmLabel="Confirm",cancelLabel="Cancel",danger=false}={}){
    const base=createBase({title,message,confirmLabel,cancelLabel,danger});return wire(base,{resolveValue:true});
  }
  function askPrompt({title="Enter details",message="",defaultValue="",placeholder="",confirmLabel="Continue",cancelLabel="Cancel",multiline=false,type="text",required=false,minLength=0,maxLength=1200,exactValue="",options=null,danger=false}={}){
    const base=createBase({title,message,confirmLabel,cancelLabel,danger}),label=document.createElement("label"),labelText=document.createElement("span"),error=fieldError();labelText.textContent=title;
    let input;
    if(Array.isArray(options)&&options.length){input=document.createElement("select");for(const item of options){const opt=document.createElement("option"),value=typeof item==="string"?item:item?.value,label=typeof item==="string"?item:item?.label;opt.value=String(value??"");opt.textContent=String(label??value??"");input.appendChild(opt)}input.value=String(defaultValue??"")}
    else if(multiline){input=document.createElement("textarea");input.rows=4;input.value=String(defaultValue??"");input.placeholder=String(placeholder||"")}
    else{input=document.createElement("input");input.type=type;input.value=String(defaultValue??"");input.placeholder=String(placeholder||"")}
    input.setAttribute("aria-label",title);if(maxLength&&"maxLength" in input)input.maxLength=Math.max(1,Number(maxLength)||1200);label.append(labelText,input);base.body.append(label,error);
    const validate=value=>{const text=String(value??"");let msg="";if(required&&!text.trim())msg="This field is required.";else if(minLength&&text.trim().length<minLength)msg=`Enter at least ${minLength} characters.`;else if(exactValue&&text!==exactValue)msg=`Type ${exactValue} exactly to continue.`;error.textContent=msg;if(msg){input.focus();return false}return true};
    input.addEventListener("input",()=>{if(error.textContent)error.textContent=""});
    return wire(base,{getValue:()=>String(input.value??""),validate});
  }
  global.BW=global.BW||{};global.BW.dialog=Object.freeze({confirm:askConfirm,prompt:askPrompt});
})(window);
