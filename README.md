# ylang

`ylang` is a local-first language learning overlay for subtitles, video, and reading. The current implementation is a Chrome/Chromium WebExtension MVP focused on NRK TV.

> Alpha status: ylang is currently intended for unpacked-extension testing from source. Site adapters may break, broad reading-mode permissions are still being hardened, media capture is disabled, and the contextual copyleft AI license is a draft that needs legal review before a wider public release.

## Current Phase 1 Capabilities

- Detects NRK's rendered subtitle text on `tv.nrk.no`.
- Normalizes subtitle line breaks and simple hyphenation.
- Adds a ylang translation overlay to the player.
- Stores user-provided translations locally in extension storage.
- Provides source and target language selectors populated from current Microsoft Translator and DeepL translation-language support.
- Supports first-letter keyboard jumping in the language selectors.
- Provides DeepL web, Microsoft Translator, and optional local LLM translation helpers.
- Opens DeepL in a compact extension-managed popup, reuses the existing popup/tab, and updates it with the current subtitle text.
- Can read back a full-line DeepL result and save it into the lower ylang subtitle line.
- Supports Microsoft Translator API as an optional user-key provider.
- Supports an optional local OpenAI-compatible LLM provider for full-line translations, selected-word translation notes, and grammar explanations.
- Shows local LLM readiness in settings and includes a guided Ollama/LM Studio setup checklist with copyable launch/pull commands.
- Copies the current subtitle with `Ctrl+C` when no other text is selected.
- Sends the current subtitle to DeepL with `Ctrl+Shift+L`.
- Can translate the current subtitle when the video pauses, skipping cues that already have a saved/imported translation.
- Provides large toolbar-popup toggles for video watching and text reading modes.
- Text reading mode shows a small ylang icon beside selected webpage text, with Translate, Learn, and word-wise Select actions; Select mode also enables Grammar explanations for selected word chips.
- Original subtitle words are individually selectable chips, including shift-click range selection.
- Clears selected word chips with a configurable single-key shortcut, default `d`.
- Saves words, phrases, full sentences, grammar notes, and learner translation attempts as local learning items.
- Provides a dedicated Learned Items page for editing translations/notes, refreshing the list, clearing translations, moving items between named learning sets, bulk-filling empty translations, deleting saved items, and exporting to Anki through AnkiConnect.
- Exports and imports a local Learned Items backup JSON for words, phrases, attempts, custom sets, local item translations, occurrences, Anki IDs, and legacy media attachments.
- Learned Items use built-in source-language sets by default; custom sets can be created and renamed for manual study grouping.
- Exports learned items to Anki with a custom `ylang Subtitle Card` note type, stable IDs, update-or-create behavior, and stored Anki note IDs.
- Screenshot and audio-snippet capture are disabled in the current alpha because browser/player support is not reliable enough yet.
- Saves non-contiguous selected phrases with bracketed skipped words, for example `liker [deg] mye` or `liker [..] mye` depending on the configured gap limit.
- Caches selected-word/phrase translations from DeepL, Microsoft Translator, and local LLM lookups for reuse in Learn items and word hover hints.
- Provides an in-player cog panel for original/translation visibility, transcript mode, episode translation controls, and full settings.
- Hides local-LLM-only subtitle actions unless the local LLM is enabled and configured.
- Loads NRK's full WebVTT subtitle track through the playback manifest when available.
- Syncs ylang subtitles to `video.currentTime` from parsed timed cues.
- Falls back to observing rendered NRK subtitles if track loading fails.
- Provides an in-video Episode panel for copying the full timed script and importing aligned line-by-line translations.
- Saves and deletes local episode transcripts, with a saved-transcript manager in the full settings page.
- Includes popup and options pages.
- Builds as a Chrome/Chromium MV3 extension.
- Includes NRK support, a Netflix rendered-subtitle fallback, and an experimental YouTube rendered-caption adapter.

## Known Limitations

- Reading mode currently uses broad `http://*/*`, `https://*/*`, and `file:///*` content-script matches. This is acceptable for private alpha testing, but it is a store-review and trust concern that should be hardened later.
- Site support is partly adapter-specific. NRK is the most complete adapter; Netflix and YouTube currently rely on rendered subtitle observation; generic native HTML5 track probing exists in code but is not broadly injected on every website yet.
- Generic dynamic probing can help with native video tracks and visible subtitle DOM, but it cannot reliably handle DRM players, cross-origin iframes, closed shadow DOM, canvas-rendered captions, or inaccessible caption APIs.
- Screenshot and audio capture are disabled for this alpha.
- The contextual copyleft AI license is a project-specific draft and needs legal review before a wider public release.

## Build

```sh
npm install
npm run typecheck
npm run build
npm run release:check
npm run public:check
```

For release-readiness checks, run typecheck, build, release check, and public boundary check as separate commands.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select the `dist` folder.
5. Open an NRK TV episode with Norwegian subtitles.
6. Set **Translation helper** to `DeepL web helper`, `Microsoft Translator API`, or `Local LLM` in ylang settings if you want assisted translation.
7. Use the extension popup to turn video watching mode on/off.

## Notes

- The tool does not ship, host, or distribute subtitles.
- Translations are local user data.
- ylang data is stored in browser extension storage. Reloading/updating the same unpacked extension should keep it, but removing/uninstalling the extension deletes the local extension storage.
- Learning items are local user data. Anki export uses local AnkiConnect at `http://127.0.0.1:8765` and does not contact a ylang server.
- Use **Learned Items -> Export Backup JSON** before uninstalling if you want to keep a backup of learned words, phrases, attempts, and custom sets. Use **Import Backup JSON** to merge that backup into a fresh profile.
- Deleting a learned item in ylang does not delete the linked Anki note. Current Anki sync creates, updates, recreates missing notes, or skips unchanged notes; it does not mirror deletions into Anki.
- `dist` is generated by `npm run build`. It is the unpacked extension output, not the source of truth, and should normally be rebuilt rather than edited.
- Screenshot and audio capture are disabled for this alpha. Existing media attachments from older local test builds can still be deleted from Learned Items.
- Local LLM support is disabled by default and only calls the configured localhost/OpenAI-compatible endpoint when you use a local-LLM feature.
- Phase 2 uses local, per-session subtitle track loading. The extension still does not ship or host subtitle data.
- License, setup, release planning, changelog, contribution notes, private-alpha stabilization, public-repo boundaries, privacy boundaries, permissions, third-party notices, player support, troubleshooting, local LLM setup, Anki setup, data storage/backup, and smoke testing live in `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/license-notes.md`, `docs/release-plan.md`, `docs/private-alpha-stabilization.md`, `docs/public-repo-boundary.md`, `docs/privacy.md`, `docs/permissions.md`, `docs/third-party-notices.md`, `docs/player-support.md`, `docs/troubleshooting.md`, `docs/llm-setup.md`, `docs/anki.md`, `docs/data-storage-and-backup.md`, `docs/smoke-test-checklist.md`, and `docs/smoke-test-results-template.md`.

## License

ylang currently uses a project-specific contextual copyleft AI license draft. In short: normal extension use and source sharing are allowed, but using the code or docs to train closed-weight generative AI models is not allowed. This license text needs legal review before a larger public release.
