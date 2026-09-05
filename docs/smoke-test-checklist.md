# Manual Smoke-Test Checklist

Run this before a public alpha snapshot.

## Build And Package

- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run release:check` passes with only documented warnings.
- `npm run release:check:chromium` passes with only documented warnings.
- `npm run release:check:firefox` passes with only documented warnings.
- `npm run public:check` passes with 0 warnings.
- Load `dist/` as an unpacked extension in Chrome/Chromium.
- Load `dist/firefox/manifest.json` as a temporary add-on in Firefox for Firefox-specific checks.

## Fresh Install

- Open settings with empty extension storage.
- Confirm default source/target languages are visible.
- Confirm local LLM features are disabled unless explicitly enabled.
- Confirm media capture controls are not offered in the alpha.

## NRK Video Mode

- Open an NRK episode with subtitles.
- Confirm original and translated subtitle lines render.
- Select one word, select a range with shift-click, then clear selection.
- Open the cog panel and toggle original/translated line visibility.
- Copy the episode script.
- Import aligned translations and confirm the transcript is saved.
- Switch to another episode in the same season without refreshing and confirm ylang reloads the subtitle source.

## Translation Providers

- DeepL helper opens only an extension-managed DeepL tab/window and does not modify normal user DeepL tabs.
- Microsoft Translator reports a useful error when the key/region is missing or invalid.
- Local LLM reports unavailable status clearly when the server is offline.
- Local LLM streams visible output when available.

## Reading Mode

- Select normal webpage text and confirm the ylang reading icon appears.
- Press Space or Select and confirm word bubbles appear without clipping the viewport.
- Try Translate, Grammar, Learn, and Unlearn where local LLM/provider settings allow it.

## Learned Items

- Save a word, phrase, sentence, grammar item, and attempt.
- Edit original text, translation, and notes.
- Select multiple items, including shift-click range selection.
- Export Backup JSON and confirm the downloaded file contains learned items plus custom sets.
- Import Backup JSON into a fresh or test profile and confirm items and custom sets reappear.
- Clear selected translations.
- Delete selected items.
- Confirm deleting a ylang item does not delete the corresponding Anki note.

## Anki

- With Anki closed, export reports that AnkiConnect is unavailable.
- With Anki and AnkiConnect running, export creates/updates notes.
- Re-export unchanged items and confirm unchanged notes are skipped.
- Confirm language-specific deck names use the configured deck prefix.

## Documentation

- README limitations match current behavior.
- Privacy and permissions docs match the current manifest.
- No copyrighted subtitles, translations, media, API keys, or private local artifacts are present in the public candidate.
