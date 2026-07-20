# Private Alpha Stabilization

Use this checklist before preparing a public GitHub snapshot.

## Automated Checks

Run these as separate commands:

```sh
npm run typecheck
npm run build
npm run release:check
npm run public:check
```

Expected current state:

- `typecheck` passes.
- `build` passes.
- `release:check` passes, with a known warning about broad reading-mode host matches.
- `public:check` passes only when private agent folders and local data exports are absent from the candidate copy.

## Fresh Install Smoke Test

1. Build with `npm run build`.
2. Load `dist` as an unpacked extension in Chromium or Brave.
3. Test with empty extension storage.
4. Open settings and confirm defaults are usable without Microsoft, DeepL, Ollama, LM Studio, or Anki running.

## Feature Smoke Test

- Video mode toggle opens/closes overlay controls.
- Reading mode text selection shows the ylang icon and word-bubble selector.
- DeepL helper opens only extension-managed DeepL windows and does not modify user-opened DeepL tabs.
- Microsoft Translator failure gives a clear message when no key is configured.
- Local LLM features stay hidden/disabled unless configured.
- Anki export gives clear feedback when AnkiConnect is unavailable.
- Learned Items can edit, select, clear selected translations, delete selected items, and keep Anki status visible.

## Storage And Data Safety

- No API keys in source files.
- No local extension storage dumps in the repo.
- No subtitles, translations, screenshots, or audio snippets in the repo.
- LLM debug data is opt-in and local-only.
- Screenshot/audio capture behavior is documented before release.
