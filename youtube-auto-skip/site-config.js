"use strict";
const SiteConfig = (() => {
  const key = "customSites";
  function origin(value) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Enter a website address.");
    const raw = value.trim();
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname || url.hostname.includes("*")) {
      throw new Error("Use a specific HTTP or HTTPS website, without a password or wildcards.");
    }
    return url.origin;
  }
  function youtube(value) {
    try { return ["www.youtube.com", "m.youtube.com"].includes(new URL(value).hostname); } catch { return false; }
  }
  // Chrome host permissions do not distinguish ports. The saved frame rule does.
  function pattern(value) {
    const url = new URL(origin(value));
    return url.protocol + "//" + url.hostname + "/*";
  }
  function origins(sites, enabledOnly = false) {
    return [...new Set(sites.filter(s => !enabledOnly || s.enabled).flatMap(s => [s.origin, ...s.players.map(p => p.origin)]))];
  }
  const wideAccess=["https://*/*","http://*/*"];
  function sameWebsite(a,b) {
    try {
      const x=new URL(origin(a)),y=new URL(origin(b));
      return x.hostname.replace(/^www\./,"")===y.hostname.replace(/^www\./,"") && x.port===y.port;
    } catch {return false;}
  }
  function frame(sites, top, current) {
    const site = sites.find(s => sameWebsite(s.origin,top) && s.enabled);
    if (!site) return null;
    if (sameWebsite(site.origin,current)) return {site:site.origin, origin:current, main:true, selector:site.selector || null};
    const player = site.players.find(p => p.origin === current);
    return player || site.autoFrames ? {site:site.origin, origin:current, main:false, selector:player?.selector || null} : null;
  }
  function clean(sites) {
    if (!Array.isArray(sites)) return [];
    const seen = new Set();
    return sites.slice(0, 50).flatMap(s => {
      try {
        const value = origin(s.origin);
        if (youtube(value) || seen.has(value)) return [];
        seen.add(value);
        const players = [], playerSeen = new Set();
        for (const p of (Array.isArray(s.players) ? s.players : []).slice(0, 30)) {
          try {
            const host = origin(p.origin);
            if (host === value || youtube(host) || playerSeen.has(host)) continue;
            playerSeen.add(host);
            players.push({origin:host, selector:typeof p.selector === "string" ? p.selector.slice(0, 512) : null});
          } catch {}
        }
        return [{origin:value, enabled:s.enabled !== false, autoFrames:s.autoFrames===true, selector:typeof s.selector === "string" ? s.selector.slice(0,512) : null, players}];
      } catch { return []; }
    });
  }
  return {key, origin, pattern, youtube, origins, frame, clean,wideAccess,sameWebsite};
})();
if (typeof module !== "undefined") module.exports = SiteConfig;
