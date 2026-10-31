# YouTube Auto Skip

A small Chrome extension that clicks available Skip Ad controls. YouTube is built in; add your own websites from a compact toolbar popup.

**Beta 1.4.1.** Generic website support varies. The latest version has automated test coverage; a fresh live public-ad result has not been verified for this version. Ads without an available Skip control are not bypassed.

## Try it

[Download the 1.4.1 Beta community ZIP](https://github.com/googy0099-cell/youtube-auto-skip/raw/refs/heads/main/downloads/youtube-auto-skip-1.4.1-community.zip), extract it, then open `chrome://extensions`, enable Developer mode and choose **Load unpacked**. Select the `youtube-auto-skip` folder containing `manifest.json`. Chrome 119+ required.

Click the toolbar icon, add a website and approve access. No settings tab opens. Pause or remove websites from the same popup. Read the [English guide](distribution/INSTALL-EN.md) or [คู่มือภาษาไทย](distribution/INSTALL-TH.md).

## Access and privacy

YouTube uses Chrome's debugger permission for browser mouse input. Custom websites request optional access to all HTTP/HTTPS origins to reach arbitrary embedded players. The loader stays inactive under websites that are not enabled in your list. Settings stay local; there is no developer server or analytics. See the [privacy policy](distribution/PRIVACY-EN.md).

## Development

No npm install required. Run `node --test tests/*.test.cjs`. Build ZIPs with `python3 scripts/build_release.py`.

## Feedback and support

Please report browser version, expected behavior and the error or detector status. Remove account details, private links and unrelated tabs from screenshots. Financial support is optional; no donation account has been connected yet.

Independent project. Not affiliated with YouTube or Google. Licensed under the [MIT License](LICENSE): use, modify and redistribute while retaining the copyright and license notice.
