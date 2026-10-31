(() => {
  "use strict";
  if (window.__autoSkipCustomController) { window.__autoSkipCustomController.refresh(); return; }
  let config = null, pending = null, lastAttempt = -Infinity, picking = false, pickerCleanup = null;
  let generation = 0,observer=null,interval=null,everEnabled=false;
  const tries=new WeakMap();
  const status = {version:"1.4.1",adapter:"custom",state:"checking",attempts:0,confirmed:0,events:[]};
  function publish(state,event) {
    status.state=state;
    if (event) {status.events.push({time:Date.now(),event});status.events=status.events.slice(-20);}
    if(everEnabled)document.documentElement.setAttribute("data-auto-skip-custom",JSON.stringify(status));
  }
  async function refresh() {
    const current=++generation;
    config=null;
    try {
      const response=await chrome.runtime.sendMessage({type:"custom-site-config"});
      if (generation!==current) return;
      config=response?.config || null;
      if (!config) stopWatching();
      else {everEnabled=true;startWatching();}
      publish(config?"watching":"disabled");
      schedule();
    } catch {config=null;stopWatching();publish("disabled");}
  }
  function startWatching(){
    if(!observer)observer=new MutationObserver(schedule);
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden","disabled","aria-disabled","aria-hidden"]});
    if(interval===null)interval=setInterval(schedule,1000);
  }
  function stopWatching(){
    stopPicker();observer?.disconnect();
    if(interval!==null){clearInterval(interval);interval=null;}
    if(pending!==null){clearTimeout(pending);pending=null;}
  }
  function eligible(button) {
    if (!button?.isConnected || button.disabled || button.getAttribute("aria-disabled")==="true" ||
      button.closest("[hidden],[inert],[aria-hidden='true']")) return false;
    if (button.matches(".jw-skip") && !button.matches(".jw-skippable")) return false;
    const link=button.closest("a[href]");
    if (link && !/^(?:#|javascript:\s*void\(0\);?$)/i.test(link.getAttribute("href"))) return false;
    const style=getComputedStyle(button), rect=button.getBoundingClientRect();
    if (style.display==="none" || style.visibility!=="visible" || style.opacity==="0" || rect.width<=0 || rect.height<=0 || rect.width>500 || rect.height>180) return false;
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    if (x<0 || y<0 || x>=innerWidth || y>=innerHeight) return false;
    const root=button.getRootNode?.();
    const hit=root?.elementFromPoint?root.elementFromPoint(x,y):document.elementFromPoint(x,y);
    return !!hit && button.contains(hit);
  }
  function candidates() {
    return SkipDetector.find(document,config.selector);
  }
  function scan() {
    pending=null;
    if (!config || picking) return;
    if(document.visibilityState!=="visible"){publish("waiting-visible-tab");return;}
    if (Date.now()-lastAttempt<2000) return;
    try {
      const button=candidates().find(eligible);
      if (!button) {publish(config.selector?"waiting-for-selected-button":"waiting-for-skip");return;}
      if((tries.get(button)||0)>=3){publish("click-not-confirmed");return;}
      lastAttempt=Date.now();status.attempts++;
      tries.set(button,(tries.get(button)||0)+1);
      const current=generation,ad=button.closest(SkipDetector.adState);
      publish("click-sent","skip-attempt");button.click();
      setTimeout(()=>{
        if(!config || current!==generation)return;
        const style=button.isConnected?getComputedStyle(button):null;
        const changed=!button.isConnected || style.display==="none" || style.visibility==="hidden" ||
          !!button.closest("[hidden],[aria-hidden='true']") || !!(ad && !ad.matches(SkipDetector.adState));
        if(changed){status.confirmed++;tries.delete(button);publish("control-responded","control-changed");}
        else publish("click-not-confirmed","no-confirmed-change");
      },650);
    } catch {publish("rule-needs-update","rule-error");}
  }
  function schedule() {if (config && pending===null) pending=setTimeout(scan,150);}
  function stopPicker() {picking=false;if(pickerCleanup){const cleanup=pickerCleanup;pickerCleanup=null;cleanup();}}
  function selectorFor(button) {
    const unique=value=>{try{return SkipDetector.query(document,value).length===1;}catch{return false;}};
    const tag=button.tagName.toLowerCase();
    if (button.id) {const value="#"+CSS.escape(button.id);if(unique(value))return value;}
    const classes=[...button.classList].filter(c=>!/(?:active|hover|focus|reset|hidden|disabled)/i.test(c)).slice(0,4);
    if(classes.length){const value=tag+classes.map(c=>"."+CSS.escape(c)).join("");if(unique(value))return value;}
    const label=button.getAttribute("aria-label");
    if(label){const value=tag+'[aria-label="'+CSS.escape(label)+'"]';if(unique(value))return value;}
    let node=button, value="";
    for(let depth=0;node?.parentElement && depth<6;depth++,node=node.parentElement){
      const index=[...node.parentElement.children].filter(n=>n.tagName===node.tagName).indexOf(node)+1;
      value=node.tagName.toLowerCase()+":nth-of-type("+index+")"+(value?">"+value:"");
      if(unique(value))return value;
    }
    throw new Error("Could not identify a unique button. Try a different Skip control.");
  }
  async function startPicker() {
    await refresh();
    if(!config)return;
    stopPicker();picking=true;
    const banner=document.createElement("div");
    banner.setAttribute("role","status");
    banner.style.cssText="position:fixed;top:12px;left:12px;right:12px;z-index:2147483647;background:#153959;color:white;padding:14px 18px;border-radius:12px;font:14px/1.4 system-ui;box-shadow:0 4px 24px #0006";
    const text=document.createElement("span");text.textContent="Auto Skip: click the actual Skip Ad button to remember it. Esc cancels. ";
    const cancel=document.createElement("button");cancel.textContent="Cancel";
    cancel.style.cssText="margin-left:8px;padding:5px 10px;cursor:pointer";
    banner.append(text,cancel);document.documentElement.append(banner);
    cancel.addEventListener("click",stopPicker);
    const key=event=>{if(event.key==="Escape"){event.preventDefault();stopPicker();}};
    const select=async event=>{
      if(banner.contains(event.target))return;
      event.preventDefault();event.stopImmediatePropagation();
      const target=event.composedPath?.()[0]||event.target;
      const button=target.closest?.("button,[role='button'],[class*='skip' i],[id*='skip' i]") || target;
      if(!button || !eligible(button)){text.textContent="Select a visible Skip button, not a link or a covered control. ";return;}
      try {
        const selector=selectorFor(button);
        const result=await chrome.runtime.sendMessage({type:"custom-save-selector",selector});
        if(!result?.ok)throw new Error(result?.error || "Selection could not be saved.");
        stopPicker();await refresh();publish("watching","button-selected");
      }catch(error){text.textContent=error.message+" ";}
    };
    document.addEventListener("click",select,true);document.addEventListener("keydown",key,true);
    const timeout=setTimeout(stopPicker,60000);
    pickerCleanup=()=>{banner.remove();document.removeEventListener("click",select,true);document.removeEventListener("keydown",key,true);clearTimeout(timeout);schedule();};
    publish("selecting-button");
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type==="custom-refresh-config"){
      refresh().then(()=>respond({ok:true}));return true;
    }
    if(message?.type==="custom-start-picker"){
      startPicker().then(()=>respond({ok:!!config}),()=>respond({ok:false}));return true;
    }
    if(message?.type==="custom-cancel-picker"){stopPicker();respond({ok:true});}
    return false;
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local" && changes.customSites){config=null;refresh();}});
  document.addEventListener("visibilitychange",schedule);
  window.__autoSkipCustomController={refresh};refresh();
})();
