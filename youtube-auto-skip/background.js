"use strict";

const active = new Set();
const attempts = new Map();
function isYouTube(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      ["www.youtube.com", "m.youtube.com"].includes(parsed.hostname);
  } catch { return false; }
}

chrome.tabs.onRemoved.addListener(tabId => attempts.delete(tabId));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "youtube-skip-click") return false;
  const tabId = sender.tab?.id;
  // The tab and origin always come from Chrome, never from message arguments.
  if (!Number.isInteger(tabId) || sender.frameId !== 0 ||
      !isYouTube(sender.url) || !isYouTube(sender.tab.url)) {
    respond({ok: false, error: "invalid-sender"});
    return false;
  }
  const {x, y} = message;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
      x > 100000 || y > 100000) {
    respond({ok: false, error: "invalid-position"});
    return false;
  }
  if (active.has(tabId) || Date.now() - (attempts.get(tabId) ?? -Infinity) < 1500) {
    respond({ok: false, error: "throttled"});
    return false;
  }
  active.add(tabId);
  attempts.set(tabId, Date.now());
  (async () => {
    const target = {tabId};
    let attached = false;
    try {
      await chrome.debugger.attach(target, "1.3");
      attached = true;
      // No Runtime evaluation, network inspection, or browsing-history access.
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x, y,
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
      });
      return {ok: true};
    } catch (error) {
      return {ok: false, error: String(error.message || error).slice(0, 250)};
    } finally {
      if (attached) {
        try { await chrome.debugger.detach(target); } catch {}
      }
      active.delete(tabId);
    }
  })().then(respond);
  return true;
});
