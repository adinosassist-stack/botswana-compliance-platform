(async()=>{
  const status=document.getElementById("recoveryStatus");
  const setStatus=message=>{if(status)status.textContent=message};
  try{
    setStatus("Clearing old Thebe Desk browser files…");
    if("serviceWorker" in navigator){
      const registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration=>registration.unregister()));
    }
    if("caches" in window){
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }
    setStatus("Browser files cleared. Opening the live site…");
    const target=new URL("/",location.origin);
    target.searchParams.set("recovered",String(Date.now()));
    location.replace(target.toString());
  }catch(error){
    console.error("thebe_recovery_failed",error);
    setStatus("Automatic recovery could not finish. Close this tab, reopen Thebe Desk, and refresh once.");
    document.getElementById("manualOpen")?.removeAttribute("hidden");
  }
})();
