"use strict";
const $=id=>document.getElementById(id);
if(location.protocol!=="chrome-extension:" || !globalThis.chrome?.runtime?.id){
  $("notice").textContent="Open this manager from the YouTube Auto Skip icon in Chrome. This downloaded file cannot access extension settings. To install: chrome://extensions → Developer mode → Load unpacked → select the youtube-auto-skip folder.";
  $("notice").className="error";
  for(const control of document.querySelectorAll("button,input"))control.disabled=true;
}else{
let targetTab=null,sites=[];
function notice(text,error=false){$("notice").textContent=text;$("notice").className=error?"error":"success";}
async function send(message){const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error||"The extension did not respond. Reload it and try again.");return response;}
function button(text,action,kind="secondary"){
  const node=document.createElement("button");node.type="button";node.textContent=text;node.className=kind;
  node.addEventListener("click",async()=>{node.disabled=true;try{await action();}catch(error){notice(error.message,true);}finally{node.disabled=node.dataset.stayDisabled==="true";}});return node;
}
async function inject(){if(targetTab)try{await send({type:"sites-inject",tabId:targetTab.id});}catch{notice("Saved. Refresh the website to activate the new settings.");}}
async function change(message){await send(message);await render();await inject();}
async function useWebsite(origin,url=origin,activate=false){
  if(!targetTab || !SiteConfig.sameWebsite(targetTab.url,origin)){
    const tabs=await chrome.tabs.query({url:SiteConfig.pattern(origin)});
    const existing=tabs.find(t=>SiteConfig.sameWebsite(t.url,origin));
    if(!existing && !activate)return;
    targetTab=existing || await chrome.tabs.update(targetTab.id,{url,active:true});
    targetTab={...targetTab,url:targetTab.url||targetTab.pendingUrl||url};
  }
  if(activate)await chrome.tabs.update(targetTab.id,{active:true});
}
async function requestSave(origin,action="sites-add"){
  const token=crypto.randomUUID();
  const preparation=send({type:"sites-prepare-add",origin,action,token,tabId:targetTab?.id});
  preparation.catch(()=>{});
  // Both calls start synchronously during this click. Background intent survives
  // popup destruction, and onAdded can finish without a UI callback.
  let granted;
  try{granted=await chrome.permissions.request({origins:SiteConfig.wideAccess});}
  catch(error){await preparation.catch(()=>{});send({type:"sites-cancel-add",token}).catch(()=>{});throw error;}
  const prepared=await preparation;
  if(!granted){await send({type:"sites-cancel-add",token});throw new Error("Access was declined. No website added.");}
  if(prepared.pending)await send({type:"sites-complete-add",token});
}
async function automaticPlayers(origin){
  await requestSave(origin,"sites-auto-frames");await render();notice("Automatic players enabled.");
}
async function add(value){
  const origin=SiteConfig.origin(value);
  if(SiteConfig.youtube(origin))throw new Error("YouTube is already built in.");
  await requestSave(origin);
  await useWebsite(origin);await render();$("website").value="";notice("Saved. Detection runs when you open this website.");
}
function renderSite(site){
  const card=document.createElement("div");card.className="site";
  const head=document.createElement("div");head.className="site-head";
  const name=document.createElement("strong");name.textContent=site.origin;
  const state=document.createElement("span");state.className="badge";state.textContent=site.enabled?"Active":"Paused";head.append(name,state);
  const mode=document.createElement("p");mode.className="hint";mode.textContent=(site.selector?"Selected button saved":"Automatic button detection")+(site.autoFrames?" · Embedded players included":" · Embedded access needs enabling");
  const actions=document.createElement("div");actions.className="actions";
  actions.append(button(site.enabled?"Pause":"Enable",async()=>{await change({type:"sites-toggle",origin:site.origin,enabled:!site.enabled});notice(site.enabled?"Website paused.":"Website enabled.");}),
    button("Remove",async()=>{await change({type:"sites-remove",origin:site.origin});notice("Website removed. Its unused optional access has been released.");},"danger"));
  if(site.selector)actions.append(button("Reset button",()=>change({type:"sites-reset-rule",origin:site.origin})));
  actions.prepend(button("Open in this tab",async()=>{await useWebsite(site.origin,site.origin,true);window.close();}));
  if(!site.autoFrames)actions.append(button("Enable automatic players",()=>automaticPlayers(site.origin)));
  card.append(head,mode,actions);
  for(const player of site.players){
    const line=document.createElement("div");line.className="player";
    const label=document.createElement("p");label.className="address";label.textContent="Player: "+player.origin;
    line.append(label,button("Remove player",()=>change({type:"sites-player-remove",origin:site.origin,player:player.origin}),"danger"));
    if(player.selector)line.append(button("Reset selected button",()=>change({type:"sites-reset-rule",origin:site.origin,player:player.origin})));
    card.append(line);
  }
  return card;
}
async function render(){
  sites=(await send({type:"sites-list"})).sites;$("sites").replaceChildren();$("site-count").textContent=sites.length;
  if(!sites.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="No other websites added. YouTube is ready to use.";$("sites").append(empty);}
  for(const site of sites)$("sites").append(renderSite(site));
  const top=targetTab?(()=>{try{return SiteConfig.origin(targetTab.url);}catch{return null;}})():null;
  const current=sites.find(s=>SiteConfig.sameWebsite(s.origin,top) && s.enabled);
  $("current-tools").hidden=!current;$("current-site").textContent=top||"";
  $("add-current").disabled=!top || SiteConfig.youtube(top);
  if(top)$("add-current").textContent="Add current website · "+new URL(top).hostname;
}
$("add-form").addEventListener("submit",async event=>{event.preventDefault();try{await add($("website").value);}catch(error){notice(error.message,true);}});
$("add-current").addEventListener("click",async()=>{try{await add(targetTab.url);}catch(error){notice(error.message,true);}});
$("pick-button").addEventListener("click",async()=>{
  try{await send({type:"sites-start-picker",tabId:targetTab.id});window.close();}
  catch(error){notice(error.message,true);}
});
$("check-status").addEventListener("click",async()=>{
  try{
    const result=await send({type:"sites-status",tabId:targetTab.id});
    const descriptions={"watching":"Watching for Skip","waiting-for-skip":"No Skip control available yet","waiting-for-selected-button":"Selected button not visible","waiting-visible-tab":"Return to the website to detect","click-sent":"Click sent; checking result","control-responded":"Control responded","click-not-confirmed":"Click had no confirmed effect","disabled":"Not active","rule-needs-update":"Selected rule needs updating"};
    const lines=result.frames.filter(f=>f.status).map(f=>f.origin+": "+(descriptions[f.status.state]||f.status.state)+" (attempts "+f.status.attempts+", responses "+(f.status.confirmed||0)+")");
    notice(lines.length?lines.join("\n"):"Detector not loaded yet. Refresh the website. If access was revoked, add the website again.",!lines.length);
  }catch(error){notice(error.message,true);}
});
$("detect-players").addEventListener("click",async()=>{
  try{
    const top=SiteConfig.origin(targetTab.url);
    const results=await chrome.scripting.executeScript({target:{tabId:targetTab.id,allFrames:true},func:()=>Array.from(document.querySelectorAll("iframe[src]")).map(frame=>frame.src)});
    const hosts=[...new Set(results.flatMap(result=>result.result||[]).flatMap(value=>{try{return [SiteConfig.origin(value)];}catch{return [];}}))].filter(host=>host!==top && !SiteConfig.youtube(host));
    $("players").replaceChildren();
    if(!hosts.length){const text=document.createElement("p");text.className="hint";text.textContent="No embedded player found yet. Start the player, then try again.";$("players").append(text);}
    for(const host of hosts){
      const row=document.createElement("div");row.className="player";
      const label=document.createElement("p");label.className="address";label.textContent=host;
      const existing=sites.find(s=>s.origin===top)?.players.some(p=>p.origin===host);
      const enable=button(existing?"Already enabled":"Enable this player",async()=>{
        const granted=await chrome.permissions.request({origins:[SiteConfig.pattern(host)]});
        if(!granted)throw new Error("Player access was declined.");
        await change({type:"sites-player-add",origin:top,player:host});notice("Player enabled. If the current player is already open, refresh the website once.");enable.textContent="Already enabled";enable.dataset.stayDisabled="true";
      });enable.disabled=!!existing;row.append(label,enable);$("players").append(row);
    }
    if(hosts.length)notice("These are embedded domains found on this page; they may include ads. Enable only the video player you recognize.");
  }catch(error){notice(error.message,true);}
});
$("full-manager").addEventListener("click",()=>{if(targetTab)chrome.tabs.update(targetTab.id,{active:true});});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.customSites)render().catch(error=>notice(error.message,true));});
(async()=>{
  try{
    const tabId=Number(new URL(location.href).searchParams.get("tab"));
    if(tabId)targetTab=await chrome.tabs.get(tabId);
    else targetTab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
    await render();
  }catch(error){notice(error.message,true);}
})();
}
