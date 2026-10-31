(() => {
  "use strict";
  const selector = ".ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-container button";
  let pending = null;
  let sending = false;
  let lastAttempt = -Infinity;
  let wasAd = false;
  const status = {version: "1.4.1", scans: 0, attempts: 0, delivered: 0, events: []};
  function publish(event, metadata = {}) {
    status.heartbeat = Date.now();
    if (event) {
      status.events.push({time: Date.now(), event, ...metadata});
      status.events = status.events.slice(-30);
    }
    document.documentElement.setAttribute("data-youtube-auto-skip", JSON.stringify(status));
  }
  publish("loaded");

  async function scan() {
    pending = null;
    status.scans++;
    const player = document.querySelector("#movie_player");
    const ad = !!player?.classList.contains("ad-showing");
    if (ad !== wasAd) {
      const video = player?.querySelector("video");
      publish(ad ? "ad-start" : "ad-end", {
        position: video?.currentTime ?? null,
        duration: Number.isFinite(video?.duration) ? video.duration : null,
      });
      wasAd = ad;
    }
    publish();
    if (!ad || document.visibilityState !== "visible" || sending ||
        Date.now() - lastAttempt < 2000) return;
    for (const button of player.querySelectorAll(selector)) {
      if (!button.isConnected || button.disabled ||
          button.getAttribute("aria-disabled") === "true" ||
          button.closest("[hidden],[inert],[aria-hidden='true']")) continue;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      if (style.display === "none" || style.visibility !== "visible" ||
          style.opacity === "0" || rect.width <= 0 || rect.height <= 0) continue;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      // Do not click a different control if an overlay covers the skip button.
      const hit = document.elementFromPoint(x, y);
      if (!hit || !button.contains(hit)) continue;
      sending = true;
      lastAttempt = Date.now();
      status.attempts++;
      publish("click-request");
      try {
        const result = await chrome.runtime.sendMessage({type: "youtube-skip-click", x, y});
        if (result?.ok) {
          status.delivered++;
          publish("input-delivered");
        } else {
          publish("input-rejected", {error: result?.error || "no-response"});
        }
      } catch (error) {
        publish("input-error", {error: String(error.message || error).slice(0, 250)});
      } finally { sending = false; }
      break;
    }
  }
  function schedule() {
    if (pending === null) pending = setTimeout(scan, 100);
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "style", "hidden", "disabled", "aria-disabled", "aria-hidden"],
  });
  setInterval(schedule, 1000);
  document.addEventListener("yt-navigate-finish", schedule);
  document.addEventListener("visibilitychange", schedule);
  schedule();
})();
