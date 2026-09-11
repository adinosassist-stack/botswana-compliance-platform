(function bootstrapBwState(global){
  "use strict";
  function clone(value){return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}
  function deepFreeze(value,seen=new WeakSet()){
    if(!value||typeof value!=="object"||seen.has(value))return value;seen.add(value);Object.freeze(value);for(const v of Object.values(value))deepFreeze(v,seen);return value;
  }
  function createStore(initialState){
    let snapshot=deepFreeze(clone(initialState)),version=0;const listeners=new Set();
    const emit=()=>{for(const listener of listeners){try{listener(snapshot,version)}catch(error){console.error("Workspace store listener failed",error)}}};
    return Object.freeze({
      getState:()=>snapshot,
      getVersion:()=>version,
      replace(next){snapshot=deepFreeze(clone(next));version++;emit();return snapshot},
      update(updater){const current=snapshot,next=updater(current);if(next===undefined)throw new TypeError("State updater must return a new state object");if(next===current)throw new TypeError("State updater must return a new object");snapshot=deepFreeze(clone(next));version++;emit();return snapshot},
      subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}
    });
  }
  global.BW=global.BW||{};global.BW.state=Object.freeze({createStore});
})(window);
