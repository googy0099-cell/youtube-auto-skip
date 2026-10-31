# Privacy — YouTube Auto Skip 1.4.1

No developer server, account, analytics, advertising SDK, remote code or extension-owned network requests. No data is uploaded to the developer.

Local Chrome storage contains website origins, enabled/paused status, automatic-player preference, optional individual player associations and selected CSS button selectors. Selectors can contain button IDs, classes or accessibility labels. No page paths, video titles, browsing history, cookies, passwords or general form input are stored. Remove deletes a website's settings; uninstall removes extension storage. This extension does not sync settings.

YouTube is installed by default. On adding a custom website, Chrome requests optional access to all HTTP/HTTPS websites because embedded players can originate from arbitrary domains. This is broad access, not an individual-domain grant. A small loader can run in granted frames and asks whether their top-level website is configured. Full DOM scanning and click timers start only for enabled configured websites. Unrelated websites remain inactive.

The popup reads its originating tab's URL and displays frame origins and bounded diagnostic state for Check detection. Add does not navigate or create tabs; Open in this tab navigates only after an explicit click. These details remain local. Page diagnostics contain version, state, counters and timestamps (up to 20 custom events; 30 YouTube events) and clear on refresh. The page can read these attributes. Website behavior after a click can make the website's own normal network requests.

Debugger is a powerful existing permission, used only to send validated browser mouse input on top-level HTTPS YouTube and detached afterward. There is no debugger network inspection, cookie access or JavaScript evaluation. Storage holds local settings; scripting registers local detection files and reads requested frame status; activeTab remembers the source website.

Pause retains permissions. Removing a website disables it; broad optional access is retained while another custom website needs arbitrary embedded players, and released when the last custom website is removed. Users may revoke access through Chrome too.

Publisher identity and contact have not been supplied for this preview. Before public store submission, add real contact information and host this policy. This document does not imply store approval.

Pending Add requests store only origin, action, token and source tab ID in Chrome session memory. They cannot be applied after 60 seconds and are cleared when processed or when the browser session ends. This permits saving after Chrome closes a permission-request popup.
