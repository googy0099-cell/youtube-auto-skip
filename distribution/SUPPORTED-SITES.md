# Validation — 1.4.1 preview

No custom websites are predefined. Detection is generic DOM inspection, not a site allowlist. YouTube's previous input engine remains unchanged.

36 automated tests pass: general English/Thai and additional Skip Ad labels; nonstandard controls and open shadow trees; countdown and unrelated-control rejection; hidden/disabled/covered/navigation controls; unconfirmed click reporting; arbitrary iframe origins under configured top-level websites only; www/HTTP/HTTPS aliases; adding arbitrary origins without creating or navigating tabs; popup permission completion after popup destruction and worker restart; both permission-event orderings; expired/cancelled requests; denial without saving; file-open guidance; pause/remove; permission revocation; unchanged YouTube input checks.

1.4 has not yet been validated against a new live public ad in installed Chrome. Automated and controlled DOM evidence must not be presented as universal website support. The prior 1.3 manager had real Chrome fixture validation; the YouTube engine had a real-ad success on 2026-10-29. Those are historical results, not new 1.4 live results.

Some players reject synthetic clicks, expose no Skip control, or put controls in canvas/closed shadow trees. No guarantee is made for every website, platform or ad. Windows, Linux, Safari, Firefox and mobile have not been validated.

Origin-fallback registration follows Chrome's scripting API: https://developer.chrome.com/docs/extensions/reference/api/scripting#type-RegisteredContentScript
