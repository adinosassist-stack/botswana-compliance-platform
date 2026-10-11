(()=>{
  "use strict";

  const RELEASE="20261011-unified-dock-voice-v330";
  const STYLE_HREF=`/assets/thebe-unified-dock-v330.css?v=${RELEASE}`;
  const STORE_KEY="thebe_voice_profile_v1";
  const VOICES=Object.freeze({
    female:Object.freeze({id:"marin",label:"Female voice",description:"Warm, clear and conversational"}),
    male:Object.freeze({id:"cedar",label:"Male voice",description:"Deeper, calm and conversational"})
  });
  let selectedProfile=readPreference();
  let lastRealtimeChannel=null;

  function readPreference(){
    try{
      const value=String(localStorage.getItem(STORE_KEY)||"female").toLowerCase();
      return Object.hasOwn(VOICES,value)?value:"female";
    }catch{return "female"}
  }

  function savePreference(value){
    selectedProfile=Object.hasOwn(VOICES,value)?value:"female";
    try{localStorage.setItem(STORE_KEY,selectedProfile)}catch{}
    window.dispatchEvent(new CustomEvent("thebe:voice-preference",{detail:{profile:selectedProfile,voice:VOICES[selectedProfile].id}}));
    return selectedProfile;
  }

  function installStyles(){
    if(document.querySelector(`link[href^="/assets/thebe-unified-dock-v330.css"]`))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href=STYLE_HREF;
    document.head.append(link);
  }

  function safeSendVoicePreference(channel){
    if(!channel||channel.readyState!=="open")return false;
    const voice=VOICES[selectedProfile]?.id||VOICES.female.id;
    try{
      channel.send(JSON.stringify({
        type:"session.update",
        session:{audio:{output:{voice}}}
      }));
      window.dispatchEvent(new CustomEvent("thebe:voice-preference-applied",{detail:{profile:selectedProfile,voice}}));
      return true;
    }catch{return false}
  }

  function installRealtimePreferenceBridge(){
    const Proto=window.RTCPeerConnection?.prototype;
    if(!Proto||Proto.__thebeVoicePreferenceV330)return;
    const original=Proto.createDataChannel;
    if(typeof original!=="function")return;
    Object.defineProperty(Proto,"__thebeVoicePreferenceV330",{value:true,configurable:false});
    Proto.createDataChannel=function(label,...args){
      const channel=original.call(this,label,...args);
      if(String(label||"")==="oai-events"){
        lastRealtimeChannel=channel;
        channel.addEventListener("open",()=>safeSendVoicePreference(channel),{once:true});
      }
      return channel;
    };
  }

  function settingsHost(dock){
    return dock.querySelector(".thebe-ai-header")||dock.querySelector(".thebe-ai-scroll")||dock;
  }

  function buildSettings(dock){
    if(!dock||dock.querySelector("[data-thebe-voice-settings-v330]"))return;
    const host=settingsHost(dock);
    const wrap=document.createElement("div");
    wrap.className="thebe-voice-settings-v330";
    wrap.dataset.thebeVoiceSettingsV330="1";

    const button=document.createElement("button");
    button.type="button";
    button.className="thebe-voice-settings-trigger-v330";
    button.setAttribute("aria-expanded","false");
    button.setAttribute("aria-label","Thebe voice settings");
    button.textContent="Voice";

    const panel=document.createElement("div");
    panel.className="thebe-voice-settings-panel-v330";
    panel.hidden=true;
    panel.setAttribute("role","group");
    panel.setAttribute("aria-label","Choose Thebe voice");

    const title=document.createElement("strong");
    title.textContent="Voice";
    const note=document.createElement("span");
    note.className="thebe-voice-settings-note-v330";
    note.textContent="Choose the voice used for new voice conversations.";
    panel.append(title,note);

    for(const [key,profile] of Object.entries(VOICES)){
      const label=document.createElement("label");
      label.className="thebe-voice-option-v330";
      const radio=document.createElement("input");
      radio.type="radio";
      radio.name="thebe-voice-profile";
      radio.value=key;
      radio.checked=selectedProfile===key;
      const copy=document.createElement("span");
      const name=document.createElement("b");
      name.textContent=profile.label;
      const description=document.createElement("small");
      description.textContent=profile.description;
      copy.append(name,description);
      label.append(radio,copy);
      radio.addEventListener("change",()=>{
        if(!radio.checked)return;
        savePreference(key);
        if(lastRealtimeChannel?.readyState==="open"){
          note.textContent="Voice saved. It will be used when you start the next voice conversation.";
        }else{
          note.textContent="Voice saved.";
        }
      });
      panel.append(label);
    }

    button.addEventListener("click",()=>{
      const open=panel.hidden;
      panel.hidden=!open;
      button.setAttribute("aria-expanded",open?"true":"false");
    });
    document.addEventListener("click",event=>{
      if(panel.hidden||wrap.contains(event.target))return;
      panel.hidden=true;
      button.setAttribute("aria-expanded","false");
    });
    document.addEventListener("keydown",event=>{
      if(event.key!=="Escape"||panel.hidden)return;
      panel.hidden=true;
      button.setAttribute("aria-expanded","false");
      button.focus();
    });

    wrap.append(button,panel);
    host.prepend(wrap);
  }

  function unifyDock(){
    const dock=document.getElementById("thebeAiDock")||document.querySelector(".thebe-ai-dock");
    if(!dock)return false;
    dock.dataset.unifiedDockV330="1";
    buildSettings(dock);
    return true;
  }

  function boot(){
    installStyles();
    installRealtimePreferenceBridge();
    if(unifyDock())return;
    if(typeof MutationObserver!=="function")return;
    const observer=new MutationObserver(()=>{if(unifyDock())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  window.ThebeVoicePreferences=Object.freeze({
    release:RELEASE,
    get:()=>({profile:selectedProfile,...VOICES[selectedProfile]}),
    set:savePreference,
    options:()=>Object.entries(VOICES).map(([profile,value])=>({profile,...value}))
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
