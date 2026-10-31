"use strict";
const registrationId = "custom-sites-v1";
let siteQueue = Promise.resolve();
const serial = fn => {
  const result = siteQueue.then(fn);
  siteQueue = result.catch(() => {});
  return result;
};
async function savedSites() {
  return SiteConfig.clean((await chrome.storage.local.get(SiteConfig.key))[SiteConfig.key]);
}
async function allowed(value) {
  return chrome.permissions.contains({origins:[SiteConfig.pattern(value)]});
}
function extensionUI(sender) {
  try {
    const url = new URL(sender.url);
    const own = new URL(chrome.runtime.getURL("manage.html"));
    return url.protocol === own.protocol && url.host === own.host && url.pathname === own.pathname;
  } catch { return false; }
}
async function syncSites() {
  const sites = await savedSites();
  const hosts = [];
  for (const value of SiteConfig.origins(sites, true)) if (await allowed(value)) hosts.push(SiteConfig.pattern(value));
  if(sites.some(s=>s.enabled && s.autoFrames) && await chrome.permissions.contains({origins:SiteConfig.wideAccess}))hosts.splice(0,hosts.length,...SiteConfig.wideAccess);
  const existing = (await chrome.scripting.getRegisteredContentScripts()).find(s => s.id === registrationId);
  if (!hosts.length) {
    if (existing) await chrome.scripting.unregisterContentScripts({ids:[registrationId]});
  } else {
    const registration = {id:registrationId, matches:[...new Set(hosts)], js:["skip-detector.js","custom-content.js"],
      allFrames:true, matchOriginAsFallback:true, runAt:"document_idle", persistAcrossSessions:true};
    if (existing) await chrome.scripting.updateContentScripts([registration]);
    else await chrome.scripting.registerContentScripts([registration]);
  }
}
async function saveSites(sites) {
  await chrome.storage.local.set({[SiteConfig.key]:SiteConfig.clean(sites)});
  await syncSites();
}
async function releaseUnused(before, after) {
  if(after.length && await chrome.permissions.contains({origins:SiteConfig.wideAccess}))return;
  const remaining = new Set(SiteConfig.origins(after).map(SiteConfig.pattern));
  const unused = [...new Set(SiteConfig.origins(before).map(SiteConfig.pattern))].filter(value => !remaining.has(value));
  if (unused.length) await chrome.permissions.remove({origins:unused});
  if(!after.length)await chrome.permissions.remove({origins:SiteConfig.wideAccess});
}
async function frameConfig(sender) {
  try {
    const top = SiteConfig.origin(sender.tab.url);
    const current = SiteConfig.origin(sender.origin || sender.url);
    const config = SiteConfig.frame(await savedSites(), top, current);
    if (!config || !await allowed(top) || !await allowed(current)) return null;
    return config;
  } catch { return null; }
}
async function notifyTab(tabId, message) {
  try { await chrome.tabs.sendMessage(tabId, message); } catch {}
}
async function completePending(expectedToken) {
  const state=await chrome.storage.session.get(["pendingSiteAdd","completedSiteAdd"]);
  const pending=state.pendingSiteAdd;
  if(!pending)return !expectedToken || state.completedSiteAdd===expectedToken?{ok:true,pending:false}:{ok:false,error:"Add request expired. Try Add again."};
  if(expectedToken && pending.token!==expectedToken)return {ok:false,error:"Another Add request replaced this one."};
  if(pending.expires<Date.now()){
    await chrome.storage.session.remove("pendingSiteAdd");return {ok:false,error:"Add request expired. Try Add again."};
  }
  if(!await chrome.permissions.contains({origins:SiteConfig.wideAccess}))return {ok:true,pending:true};
  await mutateSites({type:pending.action,origin:pending.origin});
  await chrome.storage.session.set({completedSiteAdd:pending.token});
  await chrome.storage.session.remove("pendingSiteAdd");
  const tabs=await chrome.tabs.query({url:SiteConfig.pattern(pending.origin)});
  if(Number.isInteger(pending.tabId))try{tabs.push(await chrome.tabs.get(pending.tabId));}catch{}
  for(const tab of tabs.filter((tab,index,all)=>all.findIndex(t=>t.id===tab.id)===index)){
    if(SiteConfig.sameWebsite(tab.url,pending.origin))try{
      await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["skip-detector.js","custom-content.js"]});
    }catch{}
  }
  return {ok:true,pending:false};
}
async function manage(message) {
  if (message.type === "sites-list") return {ok:true, sites:await savedSites()};
  if(message.type === "sites-prepare-add")return serial(async()=>{
    const origin=SiteConfig.origin(message.origin);
    if(SiteConfig.youtube(origin))throw new Error("YouTube is already built in.");
    if(typeof message.token!=="string" || !/^[a-zA-Z0-9-]{8,64}$/.test(message.token))throw new Error("Invalid Add request.");
    const action=message.action==="sites-auto-frames"?message.action:"sites-add";
    await chrome.storage.session.set({pendingSiteAdd:{origin,action,token:message.token,tabId:message.tabId,expires:Date.now()+60000}});
    return completePending(message.token);
  });
  if(message.type === "sites-complete-add")return serial(()=>completePending(message.token));
  if(message.type === "sites-cancel-add")return serial(async()=>{
    const pending=(await chrome.storage.session.get("pendingSiteAdd")).pendingSiteAdd;
    if(pending?.token===message.token)await chrome.storage.session.remove("pendingSiteAdd");
    return {ok:true};
  });
  if(message.type === "sites-status") {
    const tab=await chrome.tabs.get(message.tabId);
    if(!(await savedSites()).some(s=>s.enabled && SiteConfig.sameWebsite(s.origin,tab.url)))throw new Error("Add and enable this website first.");
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>{
      let status=null;try{status=JSON.parse(document.documentElement.getAttribute("data-auto-skip-custom"));}catch{}
      return {origin:location.origin,status};
    }});
    return {ok:true,frames:frames.map(f=>({frameId:f.frameId,...f.result}))};
  }
  if (message.type === "sites-start-picker") {
    const tab = await chrome.tabs.get(message.tabId);
    const top = SiteConfig.origin(tab.url);
    if (!(await savedSites()).some(s => SiteConfig.sameWebsite(s.origin,top) && s.enabled)) throw new Error("Add and enable this website first.");
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["skip-detector.js","custom-content.js"]});
    await chrome.tabs.sendMessage(tab.id,{type:"custom-start-picker"});
    return {ok:true};
  }
  if (message.type === "sites-inject") {
    const tab = await chrome.tabs.get(message.tabId);
    const top = SiteConfig.origin(tab.url);
    if (!(await savedSites()).some(s => SiteConfig.sameWebsite(s.origin,top) && s.enabled)) return {ok:true};
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["skip-detector.js","custom-content.js"]});
    return {ok:true};
  }
  return serial(()=>mutateSites(message));
}
async function mutateSites(message) {
    const before = await savedSites();
    const sites = structuredClone(before);
    const value = SiteConfig.origin(message.origin);
    if (SiteConfig.youtube(value)) throw new Error("YouTube is already built in.");
    let site = sites.find(s => s.origin === value);
    if (message.type === "sites-add") {
      if (!await allowed(value)) throw new Error("Website access was not granted. Click Add website to try again.");
      const autoFrames=await chrome.permissions.contains({origins:SiteConfig.wideAccess});
      if (site) {site.enabled = true;site.autoFrames=autoFrames || site.autoFrames;}
      else {
        if (sites.length >= 50) throw new Error("Remove a website before adding more (limit: 50).");
        sites.push({origin:value,enabled:true,autoFrames,selector:null,players:[]});
      }
    } else if (message.type === "sites-auto-frames") {
      if(!site)throw new Error("Website not found.");
      if(!await chrome.permissions.contains({origins:SiteConfig.wideAccess}))throw new Error("Allow automatic player access in Chrome first.");
      site.autoFrames=true;
    } else if (message.type === "sites-remove") {
      if (site) sites.splice(sites.indexOf(site),1);
    } else if (message.type === "sites-toggle") {
      if (!site) throw new Error("Website not found.");
      if (message.enabled && !await allowed(value)) throw new Error("Website access was revoked. Use Add website to grant it again.");
      site.enabled = !!message.enabled;
    } else if (message.type === "sites-player-add") {
      if (!site) throw new Error("Add the main website first.");
      const player = SiteConfig.origin(message.player);
      if (SiteConfig.youtube(player) || player === value) throw new Error("This address does not need to be added as an embedded player.");
      if (!await allowed(player)) throw new Error("Embedded player access was not granted.");
      if (!site.players.some(p => p.origin === player)) {
        if (site.players.length >= 30) throw new Error("Embedded player limit reached.");
        site.players.push({origin:player,selector:null});
      }
    } else if (message.type === "sites-player-remove") {
      if (!site) throw new Error("Website not found.");
      site.players = site.players.filter(p => p.origin !== SiteConfig.origin(message.player));
    } else if (message.type === "sites-reset-rule") {
      if (!site) throw new Error("Website not found.");
      if (!message.player || message.player === value) site.selector = null;
      else {
        const player = site.players.find(p => p.origin === SiteConfig.origin(message.player));
        if (player) player.selector = null;
      }
    } else throw new Error("Unknown website action.");
    await saveSites(sites);
    await releaseUnused(before,sites);
    return {ok:true,sites};
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (typeof message?.type === "string" && message.type.startsWith("sites-")) {
    if (!extensionUI(sender)) {respond({ok:false,error:"Only the extension manager can change websites."});return false;}
    manage(message).then(respond,error=>respond({ok:false,error:error.message}));
    return true;
  }
  if (message?.type === "custom-site-config") {
    frameConfig(sender).then(config=>respond({ok:true,config}),()=>respond({ok:false,config:null}));
    return true;
  }
  if (message?.type === "custom-save-selector") {
    serial(async () => {
      const config = await frameConfig(sender);
      if (!config || typeof message.selector !== "string" || !message.selector || message.selector.length > 512) throw new Error("Invalid button selection.");
      const sites = await savedSites();
      const site = sites.find(s => s.origin === config.site);
      if(!config.main && !site.players.some(p=>p.origin===config.origin))site.players.push({origin:config.origin,selector:null});
      const rule = config.main ? site : site.players.find(p => p.origin === config.origin);
      rule.selector = message.selector;
      await saveSites(sites);
      await notifyTab(sender.tab.id,{type:"custom-cancel-picker"});
      return {ok:true};
    }).then(respond,error=>respond({ok:false,error:error.message}));
    return true;
  }
  return false;
});
chrome.runtime.onInstalled.addListener(() => { serial(syncSites).catch(console.error); });
chrome.runtime.onStartup.addListener(() => { serial(syncSites).catch(console.error); });
// Permission dialogs can destroy a popup. Save intent in session storage first;
// either prepare or onAdded completes it, regardless of which event arrives first.
chrome.permissions.onAdded.addListener(()=>{serial(()=>completePending()).catch(console.error);});
chrome.permissions.onRemoved.addListener(() => {
  serial(async()=>{
    await syncSites();
    for (const tab of await chrome.tabs.query({})) await notifyTab(tab.id,{type:"custom-refresh-config"});
  }).catch(console.error);
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === "local" && changes[SiteConfig.key]) serial(syncSites).catch(console.error);
});
