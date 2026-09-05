# Browser Compatibility

ylang is currently tested primarily as a Chrome/Chromium MV3 extension. A Firefox package is generated for experimental testing.

## Current Support

- Chrome and Chromium-based browsers: primary target.
- Brave: expected to work like Chromium, with some browser-specific UI and dark-mode quirks.
- Edge: likely close to Chrome, but not part of the current smoke-test checklist yet.
- Firefox: experimental package output exists at `dist/firefox` after `npm run build`; it still needs real browser smoke testing before it is called supported.

## Firefox Publishing

Mozilla publishes Firefox extensions through addons.mozilla.org, also called AMO. Current Mozilla docs describe submitting through the Add-ons Developer Hub with a Firefox account and say Firefox add-ons must be signed by Mozilla before normal users can install them.

I did not find a current Mozilla documentation requirement for a Chrome-style one-time developer registration fee. Treat Firefox publishing as likely free to submit, but still subject to Mozilla signing, review, policies, and account requirements.

Relevant docs:

- https://addons.mozilla.org/developers/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons

## Firefox Porting Notes

The codebase is WebExtension-shaped, but these pieces need a real Firefox pass:

- Firefox supports the WebExtensions model and many Chrome-compatible APIs, but browser differences must be handled explicitly rather than assuming the Chromium package is drop-in.
- For Manifest V3, Firefox currently uses background scripts/event pages rather than Chrome-style extension background service workers. The Firefox package emits a manifest with `background.scripts`.
- `chrome.system.display` may not be available in Firefox. DeepL multi-monitor placement needs a graceful fallback.
- MV3 background/service-worker behavior differs between browsers and should be tested with Firefox's current extension runtime.
- Some code still calls `chrome.*` directly. Firefox usually supports many Chrome-compatible extension APIs, but the safer long-term path is to keep using a small browser API wrapper where practical.
- Host permissions and file access prompts differ. Reading mode should eventually move toward optional/site-scoped permissions before store submission.
- Localhost access for Ollama, LM Studio, and AnkiConnect must be tested in Firefox.
- Content scripts for NRK, Netflix, YouTube, and ORF ON use DOM observation and should be portable in principle, but each site adapter needs real Firefox testing.
- Netflix support needs special Firefox testing because ylang injects a page-context hook and fetches subtitle CDN URLs through the extension background context.

## Parallel Firefox Build Plan

The current packaging path keeps one TypeScript source tree and produces two browser-specific extension outputs:

- `dist/chromium`: current Chrome/Brave/Edge MV3 package.
- `dist/firefox`: Firefox MV3 package with a Firefox manifest transform.

The Firefox manifest transform currently:

- replaces Chrome's `background.service_worker` with Firefox `background.scripts`,
- removes Chromium-only `system.display` permission so DeepL placement falls back gracefully,
- removes Chromium's `match_origin_as_fallback` content-script key,
- keep content-script matches and host permissions explicit,
- keeps the same source assets, popup, options page, content scripts, and site adapters where possible.

Firefox smoke tests still need to cover NRK, Netflix, YouTube, ORF ON, DeepL helper fallback placement, local LLM, Microsoft Translator, and AnkiConnect.

This should be treated as a parallel packaging/testing target, not a fork. Browser-specific code should stay behind small compatibility helpers or manifest build transforms.

## Loading The Firefox Package

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on**.
4. Select `dist/firefox/manifest.json`.
5. Re-test browser-specific permissions and site adapters before publishing to AMO.

## Store Split

- GitHub release: best for source, issue tracking, and developer/manual alpha installs.
- Chrome Web Store: best path for normal Chrome/Brave/Edge users.
- Firefox AMO: best path for normal Firefox users once the Firefox port passes manual testing.
