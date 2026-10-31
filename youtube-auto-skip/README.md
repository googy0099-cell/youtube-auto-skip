# YouTube Auto Skip 1.4.1

YouTube is built in. Add any HTTP/HTTPS website yourself; no movie websites are predefined.

## Install or update

Extract the community ZIP. In desktop Chrome 119+, open `chrome://extensions`, enable Developer mode, choose Load unpacked and select the `youtube-auto-skip` folder containing manifest.json. For an existing installation, replace files in its existing folder, click its Reload arrow and refresh already-open video pages. Do not install a second copy.

Click the extension icon in Chrome to open a compact 360-pixel popup; it does not open a settings tab. Opening manage.html as a normal file cannot access the extension. A community ZIP is a preview, not a double-click installer or an approved store listing.

## Add and use a website

Enter its URL and click Add website, or click Add current website. Chrome asks once for access to all HTTP/HTTPS websites: players can come from arbitrary third-party domains. The extension only scans and clicks under enabled websites in your list. If access is declined, the website is not added.

Adding saves the website without opening a browser tab. Detection starts on an already-open matching website, or when you visit it later. Open in this tab is an explicit shortcut if you want to navigate there. Start the video normally. Embedded domains are included automatically; there is no per-player setup in the normal flow. Entries from older versions have Enable automatic players to grant this access and upgrade their behavior.

Detection uses Skip Ad text, accessibility labels and ad-skip identifiers, including custom controls and open shadow trees. Plain Skip requires ad-state evidence so Skip intro is not selected. Hidden, disabled, covered, countdown and navigation-link controls are avoided. This is generic DOM detection, not a maintained list of supported websites.

Check detection shows per-frame state, attempts and observed control responses. Sending a click does not count as confirmed: the control must disappear, become hidden or leave its ad state. That observation still does not prove a whole ad network's behavior. After three ineffective attempts on the same control, the detector stops retrying it.

If necessary, Choose a Skip button lets you select an unfamiliar control once. Reset button restores automatic detection. Pause stops custom detection and retains settings. Remove deletes that website and stops existing controllers. Broad optional access stays while other custom entries need it and is released when the last entry is removed.

Settings retain origins rather than page paths. Common www/non-www and HTTP/HTTPS forms are treated as the same website; explicit nondefault ports remain distinct. Open website returns to a saved website. No browsing history or page paths are stored.

## Limits

Some players reject scripted clicks, draw controls inside a canvas or hide them in closed shadow trees. Skipping cannot be guaranteed on every website. Unskippable ads are not bypassed. YouTube keeps its existing browser-input engine; Chrome may show a debugger notice, and another debugger on the same tab can conflict.

English interface; Thai instructions included. See PRIVACY-EN.md and SUPPORTED-SITES.md. Independent project, not affiliated with YouTube or Google.
