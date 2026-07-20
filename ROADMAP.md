# ylang Roadmap

`ylang` is a privacy-first language learning overlay for video, audio, articles, PDFs, EPUBs, and other browser-readable media. The first target is NRK TV dual subtitles for Norwegian learning, but the architecture should be general enough to support YouTube, generic HTML5 players, local files, VLC, and reading workflows without a rewrite.

## Product Principles

- Open source the tool, not subtitles, translations, media clips, or user learning data.
- Keep user content local by default. No central subtitle database, no shared subtitle packs, and no uploaded copyrighted material.
- Treat translations as user-owned local transformations of content the user can already access.
- Prefer accurate, close-to-original translations for learning over polished localization.
- Make every learning artifact traceable: source URL/file, title, timestamp/page, original text, translation, and user edits.
- Build provider adapters around a stable core so NRK is the first implementation, not a hard-coded one-off.
- Video snippets are optional long-term. Audio-only and screenshot-plus-audio should become first-class modes only after capture is reliable and clearly user-controlled.
- When the project is ready to become public, initialize a clean public repository at the very end. Do not publish private assistant conversations, private notes, local test artifacts, user data, private debugging dumps, or other development-session context.

## Primary Use Cases

1. Watch NRK with Norwegian subtitles plus a close translation.
2. Watch YouTube with original captions plus translated captions.
3. Save subtitle lines as Anki-ready sentence cards.
4. Later, capture pronunciation/context through audio, screenshot plus audio, or low-res video snippets when browser/player support is reliable.
5. Save words and phrases from articles, PDFs, EPUBs, and webpages.
6. Ask for grammar explanations, literal glosses, natural translations, examples, and vocabulary breakdowns.
7. Use local LLMs or user-provided API keys without sending data to a ylang server.

## Current Implementation State

The current repository contains a Chrome/Chromium Manifest V3 extension MVP focused on NRK TV.

Implemented:

- NRK content script for `tv.nrk.no`.
- Full NRK WebVTT timed subtitle loading through the playback manifest when available.
- Rendered NRK subtitle observation as a fallback.
- ylang-controlled dual subtitle overlay synced to `video.currentTime`.
- Source and target language selectors populated from current Microsoft Translator and DeepL translation-language support.
- First-letter keyboard jumping for long language selectors.
- Clickable original-word chips with shift-click range selection.
- Configurable single-key selection clearing, default `d`.
- Local per-cue translation cache keyed by source, target language, and normalized cue text.
- Compact DeepL web helper popup that is reused instead of repeatedly recreated.
- DeepL source-field injection and best-effort target translation readback for full-line translations.
- Selected-word DeepL lookup that does not overwrite full-line subtitle translations.
- Microsoft Translator API provider with user-supplied key and optional region.
- Optional local OpenAI-compatible LLM provider for full-line translation, selected-word translation notes, and compact grammar explanations.
- Local LLM settings status detection plus a guided setup checklist for Ollama, LM Studio, and other OpenAI-compatible local servers.
- Translate-on-pause for supported providers, skipping cues that already have saved/imported translations.
- In-video Episode panel for copying the current timed script and importing aligned line-by-line translations.
- Local learning item store for words, phrases, sentences, grammar notes, and learner translation attempts.
- Learn/Unlearn subtitle action with occurrence merging instead of duplicate item spam.
- Dedicated Learned Items page for editing saved translation/notes, refreshing the list, clearing translations, bulk-filling empty translations, deleting entries, and exporting to Anki through local AnkiConnect.
- Learned Items can be grouped into named learning sets. Built-in sets are grouped by source language and cannot be renamed; custom sets can be created, renamed, and used as manual groupings without changing the real source/target languages on items.
- Screenshot and audio-snippet capture are disabled in the current alpha because browser/player support has not been reliable enough.
- Learned Items management can delete image and audio attachments from older local test builds.
- Selected-word/phrase translation hint cache reused for Learn items and original-word hover hints.
- Non-contiguous phrase selection stores bracketed skipped words, for example `liker [deg] mye` or `liker [..] mye`.
- In-player quick settings panel for toggling original/translation lines, transcript mode, episode controls, and full settings.
- Local-LLM-only subtitle actions are hidden unless the local LLM is enabled and configured.
- Local saved transcript records for previous episodes, with copy/delete management in full settings.
- Popup toggles for video and reading modes.
- Reading mode adds a small action icon beside selected webpage text, with Translate, Learn, word-wise Select, and Grammar actions after selection refinement.
- Options page for languages, provider settings, subtitle mode, layout, shortcuts, and saved transcript management.
- YouTube now has an experimental rendered-caption adapter. Generic native-track probing exists in code but is not broadly enabled on every website yet.

Known current limitations:

- DeepL result readback depends on DeepL's live page DOM and can break if DeepL changes selectors.
- Chrome extensions cannot make the DeepL popup truly always-on-top at the OS level.
- Saved transcripts are local extension-storage records, not IndexedDB yet.
- Episode script import expects one translated line per original cue.
- Media capture is disabled in the current alpha. Future capture work should be capability-detected, opt-in, and conservative around copyright-sensitive media.
- Content scripts must remain self-contained classic scripts; avoid shared chunks/imports in `content.js` and `deepl.js` build output.

## Legal And Privacy Boundaries

- Do not distribute NRK, Netflix, YouTube, publisher, or third-party subtitles.
- Do not host translated subtitle files.
- Do not provide a public shared translation database by default.
- Do not scrape or bypass access controls. The extension should operate on content available in the user's own browsing session.
- Local caches should be stored in IndexedDB or extension storage.
- Any cloud translation or LLM call must be explicit and user-configured.
- Export/import is for personal use. Add clear documentation around copyright-sensitive media exports.
- The final open-source repository should contain source code, documentation, tests, and clean fixtures only. It should not contain private development logs, private prompts, generated local caches, media captures, translations, or personal learning data.

## Architecture Overview

The core should be independent of any single website.

## Browser Strategy

Build `ylang` as a cross-browser WebExtension, with Chrome/Chromium as the first supported runtime and Firefox as a deliberate follow-up.

### Recommendation

- Primary MVP target: Chrome/Chromium Manifest V3.
- Keep source code browser-neutral by using `webextension-polyfill` and `browser.*` style APIs.
- Generate separate manifests/build outputs for Chrome and Firefox.
- Test early on Chrome, Edge/Brave if easy, and Firefox once the NRK/YouTube MVP works.

### Why Chrome/Chromium First

- Most users watch YouTube in Chrome/Chromium-family browsers.
- One build can later cover Chrome, Edge, Brave, Vivaldi, and other Chromium browsers.
- Manifest V3 is the current publishing path for Chrome Web Store.
- Media and overlay behavior on major streaming sites is most often tested by sites against Chromium.
- Better initial reach if `ylang` is published.

### Why Keep Firefox Support

- Firefox is important for open-source and privacy-minded users.
- It may be friendlier for some power-user extension workflows.
- Firefox can be a useful fallback if Chrome restrictions make a feature awkward.
- Cross-browser support keeps the project healthier and less dependent on one extension platform.

### Practical Browser Risks

The hard part is not the browser choice itself. The hard parts are site- and API-specific:

- Whether subtitle tracks are exposed to the page.
- Whether rendered subtitles can be observed reliably.
- Whether injected overlays survive player fullscreen, shadow DOM, and site rerenders.
- Whether screenshots from video are blocked by CORS or DRM-related restrictions.
- Whether audio/video capture is allowed by browser APIs for the active media source.
- Whether Manifest V3 background/service-worker limits affect long-running translation or capture tasks.

Design implication: build graceful fallbacks for each feature and treat media capture as capability-detected, not guaranteed.

### Core Modules

- `MediaSession`: current source, playback state, title, episode/video id, duration, URL.
- `CueStore`: timed subtitles/captions, observed cue history, normalized text, translation state.
- `TranslationEngine`: close translation, natural translation, literal gloss, grammar explanation, vocabulary notes.
- `LearningItemStore`: saved sentences, words, phrases, article snippets, notes, tags, review status.
- `MediaCapture`: screenshot, audio clip, optional low-res video snippet.
- `CardExporter`: AnkiConnect, `.apkg`, CSV/TSV, JSON export.
- `AdapterRegistry`: selects the right player/subtitle/document adapter.
- `InsightProbe`: assisted detection when automatic adapters fail.

### Adapter Interfaces

```ts
interface PlayerAdapter {
  id: string;
  canAttach(): Promise<boolean>;
  attach(): Promise<MediaSession>;
  getCurrentTime(): number;
  seek(timeSeconds: number): Promise<void>;
  isPlaying(): boolean;
  onTimeUpdate(callback: () => void): () => void;
}

interface SubtitleAdapter {
  id: string;
  canReadTrack(): Promise<boolean>;
  loadCues(): Promise<SubtitleCue[]>;
  observeCurrentCue(callback: (cue: ObservedCue) => void): () => void;
}

interface DocumentAdapter {
  id: string;
  canAttach(): Promise<boolean>;
  getSelectionContext(): Promise<TextSelectionContext>;
  extractReadableText?(): Promise<DocumentText>;
}

interface TranslationAdapter {
  id: string;
  translate(request: TranslationRequest): Promise<TranslationResult>;
  explainGrammar?(request: GrammarRequest): Promise<GrammarResult>;
  analyzeWords?(request: WordAnalysisRequest): Promise<WordAnalysisResult>;
}

interface CardExporter {
  id: string;
  createOrUpdate(note: LearningNote): Promise<ExportResult>;
}
```

## Translation Strategy

The default translation mode should be "close learning translation":

- Preserve sentence structure where readable.
- Keep idioms literal when useful, with a separate idiom note.
- Avoid smoothing away particles, modal verbs, tense/aspect, negation, and pronouns.
- Preserve names, places, and culturally specific words unless a gloss is needed.
- Keep subtitle line length readable.

Each saved line can store:

- Original sentence.
- Close translation.
- Optional natural translation.
- Literal gloss.
- Vocabulary list.
- Grammar explanation.
- User edits.
- Provider/model used.
- Timestamp and source metadata.

## LLM And Translation Providers

Support user-configured providers:

- Local LLM via OpenAI-compatible endpoint, for example Ollama, LM Studio, llama.cpp server.
- OpenAI-compatible API.
- DeepL API.
- Future: local dictionary/morphology tools for supported languages.

Provider config should include:

- Base URL.
- API key, stored in extension storage.
- Model name.
- Target language.
- Preferred translation style.
- Privacy indicator: local, user API, or external service.

## Assisted Detection: "Inspect Source" Mode

Avoid naming this "Troubleshoot". Use a calmer product name such as:

- `Inspect Source`
- `Find Captions`
- `Scan Page`
- `Detect Media`
- `Source Check`

Recommended name: **Inspect Source**.

When normal detection fails, the user can click **Inspect Source**. It should:

1. Collect a privacy-scoped page snapshot:
   - video/audio elements and attributes
   - text tracks
   - shadow DOM hints where accessible
   - subtitle-like DOM nodes
   - relevant network/resource URLs visible to the page
   - player framework clues
2. Redact cookies, tokens, auth headers, query secrets, and unrelated page text.
3. Send the structured snapshot to the configured local/API LLM only after user confirmation.
4. Ask the LLM to propose adapter selectors or extraction strategies.
5. Let the user preview and approve the proposed detection.
6. Store site-specific recipes locally.

This should never attempt to bypass DRM, authentication, geo restrictions, or paywalls.

## Phase 1: NRK MVP

Goal: reliable dual subtitles on NRK with local translation cache.

- [x] Browser extension scaffold.
- [x] Content script for `tv.nrk.no`.
- [x] Detect `tv-player`, `video`, and `tv-player-subtitles`.
- [x] Observe `.tv-player-subtitle-text` as the first fallback.
- [x] Normalize line breaks and hyphenation:
  - `viktig-\nheten` -> `viktigheten`
  - preserve meaningful line breaks only for display.
- [x] Overlay second subtitle line below NRK subtitles.
- [x] Store translations locally by source id, cue text hash, target language, provider, and style.
- [x] Add minimal settings:
  - source language
  - target language
  - translation provider
  - font size
  - subtitle position
  - show/hide translation
- [ ] Add privacy note in settings.

## Phase 2: Full Subtitle Track Loading

Goal: pre-translate locally per episode instead of translating only visible lines.

- [x] Discover NRK player metadata and subtitle/caption URLs available to the browser.
- [x] Parse WebVTT sources into normalized `SubtitleCue[]`.
- [x] Build per-episode copy/import workflow through the in-video Episode panel.
- [ ] Pre-translate current episode locally through configured provider.
- [ ] Show translation progress.
- [ ] Handle cue edits and retranslation.
- [ ] Store cue timing and translated text in IndexedDB.
- [x] Fallback to DOM observation if no track is available.
- [x] Add optional OpenAI-compatible local LLM provider for per-cue translation and grammar actions.

## Phase 3: Learning, Anki, And Media Capture

Goal: turn subtitles into high-quality flashcards.

### Sentence Mining

- Save current cue as a card candidate.
- Save previous/current/next cue context.
- Add tags:
  - language
  - source site
  - show/channel
  - episode/video id
  - grammar topic
  - user tags
- Add star/save button near subtitles.
- Add replay current cue button.
- Add auto-pause after cue option.
- Add "explain grammar" and "break down words" actions.
- [x] Save words, phrases, sentences, grammar notes, and learner attempts locally.
- [x] Merge repeat word/phrase saves into occurrences instead of creating duplicate items.
- [x] Add dedicated learning item delete/edit flow.
- [x] Preserve non-contiguous selected phrase patterns with configurable bracketed gaps.
- [x] Cache selected-word/phrase translations for hover hints and future Learn saves.
- [x] Store learner translation attempts separately from trusted translations.
- [x] Add named learning sets so items can be grouped by source language or custom study sets.
- [ ] Add language-specific prompt templates or prompt overrides so grammar explanations can be written in the learner's desired explanation language instead of always following English prompt wording.
- [ ] Re-enable screenshot capture only after a reliable capability check and privacy warning.
- [ ] Re-enable audio snippets only after reliable timing, buffer behavior, and player support checks.
- [x] Allow deleting image/audio attachments from Learned Items management.
- [ ] Add richer manual-attempt practice mode for listening/transcription exercises.

### Anki Integration

Start with AnkiConnect before building a custom Anki app.

- [x] Add first AnkiConnect export button against `http://127.0.0.1:8765`.
- [x] Create the default `ylang` deck if missing.
- [x] Create a custom `ylang Subtitle Card` note type if missing.
- [x] Create or update notes by stable `YlangId`.
- [x] Store Anki note id locally after creation/update.
- [x] Upload existing screenshot/audio media into AnkiConnect and reference it from cards.
- Support `.apkg` or CSV/TSV export as fallback.
- Allow updating translations, screenshots, audio, or notes after a card already exists.
- Word and phrase cards should support click-selected words from ylang-controlled subtitles and reading mode.
- A selected multi-word phrase should preserve the full sentence example and the abstracted phrase pattern.
- If selected phrase parts have skipped words between them, keep up to `maxPhraseGapWords` visible inside brackets.
- If the gap is larger than the setting, collapse it as `[..]`.

Example:

```text
Selected: komme + hjem
Sentence: å komme seg endelig hjem
Stored phrase: komme [seg endelig] hjem
Example: å **komme** seg endelig **hjem**
```

If the gap setting is `1`, the stored phrase becomes:

```text
komme [..] hjem
```

For the card back:

- Use the existing fully translated subtitle sentence when available.
- Use DeepL or another configured provider for the short word/phrase translation when possible.
- Store both the phrase translation and the full sentence translation.

Suggested stable note identity:

```text
source:nrk
programId:MUHH32000118
cueStartMs:7500
cueTextHash:...
languagePair:no-en
```

Suggested Anki fields:

- `Original`
- `TranslationClose`
- `TranslationNatural`
- `Gloss`
- `Grammar`
- `Vocabulary`
- `Audio`
- `Image`
- `Video`
- `SourceTitle`
- `SourceUrl`
- `Timestamp`
- `ContextBefore`
- `ContextAfter`
- `YlangId`

### Media Capture Modes

Support three modes:

1. **Audio clip only**
   - Default media mode.
   - Small and pronunciation-focused.
   - Capture cue start minus 300ms to cue end plus 500ms by default.

2. **Screenshot plus audio**
   - Best learning mode.
   - Capture screenshot from video at cue midpoint or user-selected frame.
   - Allow screenshot size/quality settings.
   - Add audio clip for pronunciation.

3. **Low-res video snippet**
   - Optional.
   - Use conservative default resolution and bitrate.
   - Allow manual trim and preview.
   - Document copyright-sensitive nature.

Browser limitations:

- Canvas screenshot may fail if CORS taints the video.
- MediaRecorder may fail on protected streams.
- Some sites prevent direct capture.

Fallbacks:

- Timestamped card without media.
- Screenshot only.
- User-selected image upload.
- Native companion app later.

## Phase 4: Open Source Polish

Goal: make `ylang` understandable, safe, and contributor-friendly.

- Publish extension source.
- Add architecture docs.
- Add privacy model docs.
- Add provider adapter docs.
- Add local-only default configuration.
- Add tests for cue normalization, cache keys, and adapter selection.
- Add example mock player pages for development.
- Add no-subtitle-data policy.
- Add contribution guidelines for new site adapters.
- Add threat model:
  - token leakage
  - accidental page text upload
  - copyrighted media export
  - malicious adapter recipes

## Phase 5: Generalize To More Players And Languages

Goal: make `ylang` work beyond NRK.

### YouTube Ready

YouTube should be supported early, not as an afterthought.

- [x] Detect YouTube watch pages for the video content script.
- Use available caption tracks when accessible through the page/player.
- [x] Fallback to observing rendered caption DOM.
- Sync overlay to YouTube video time.
- Support YouTube captions, auto-captions, and user-uploaded captions where available.
- Let users select source caption language and target language.
- Preserve source URL, video id, channel, title, and timestamp in saved notes.
- Avoid scraping private data or bypassing restrictions.

### Generic HTML5 Players

- Detect `<video>` and `<audio>` elements.
- Read native `<track kind="subtitles|captions">`.
- Parse VTT cues.
- Overlay subtitles when captions exist.
- Offer manual subtitle file import for local/user-provided `.srt` or `.vtt`.

### Other Browser Players

Potential adapters:

- YouTube
- NRK
- generic HTML5
- Vimeo where captions are available
- local browser video files
- podcast/audio transcript pages
- language-learning sites with user-accessible captions

Each adapter should declare:

- domains
- detection selectors
- subtitle source strategy
- playback sync method
- capture capability
- known limitations

### VLC And Local Desktop Mode

Treat VLC as a later companion mode, not a browser extension feature.

Options:

- Use VLC HTTP API when enabled to read playback time and control seeking.
- Parse local `.srt`, `.vtt`, `.ass`, or `.ssa` subtitle files.
- Create Anki cards from local media plus subtitle timing.
- Optional always-on-top subtitle overlay.
- Optional native media clipping using ffmpeg if the user provides local files.

This likely requires a local desktop companion app.

## Phase 6: Reading Mode For Articles, PDFs, And EPUBs

Goal: use the same learning pipeline while reading.

### Web Articles

- Browser selection popup for selected text.
- Actions:
  - translate closely
  - natural translation
  - explain grammar
  - save word
  - save sentence
  - add to Anki
- Save page title, URL, selected sentence, surrounding paragraph, and language.
- Readability extraction for cleaner context.

### PDFs In Browser

- Support browser PDF viewer selection where possible.
- Fallback to selected text from page.
- Store page number if detectable.
- Allow manual context cleanup.

### EPUBs In Browser

- Support browser-based EPUB readers where accessible.
- Detect selected text and surrounding paragraph.
- Store book title, chapter, location if accessible.
- Avoid requiring DRM circumvention.

### Vocabulary System

- Save words and phrases independent of Anki.
- Track occurrences across subtitles/articles/books.
- Add morphology/lemma where possible.
- Add example sentences from user-saved sources.
- Add spaced repetition export.

### Much Later: Suggested Bubble Learning

- Consider fast local NLP or lightweight ML to suggest which word-bubble combinations are likely worth learning.
- Possible UI: pre-created or highlighted bubbles in a special color for candidate words, collocations, or phrases the user may not know yet.
- Treat this as speculative and low priority. It could easily feel noisy or patronizing for advanced users, and it would be incomplete if the user also learns in other tools.
- Avoid requiring the user to mark every known word just to make suggestions work. If it cannot remain optional, local-only, and low-friction, do not build it.
- No cloud/user-profile inference should be required for this feature.

## Data Model Sketch

```ts
type SourceKind = "video" | "audio" | "article" | "pdf" | "epub" | "local-file";

interface SourceRef {
  kind: SourceKind;
  provider: string;
  url?: string;
  localPathHash?: string;
  title?: string;
  creator?: string;
  programId?: string;
  episodeId?: string;
  videoId?: string;
  pageNumber?: number;
  chapter?: string;
}

interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  normalizedText: string;
  language: string;
}

interface LearningNote {
  ylangId: string;
  source: SourceRef;
  original: string;
  sourceLanguage: string;
  targetLanguage: string;
  translationClose?: string;
  translationNatural?: string;
  gloss?: string;
  grammar?: string;
  vocabulary?: VocabularyItem[];
  contextBefore?: string;
  contextAfter?: string;
  timestampMs?: number;
  media?: MediaAttachment[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  ankiNoteId?: number;
}

interface MediaAttachment {
  type: "audio" | "image" | "video";
  localBlobId: string;
  mimeType: string;
  durationMs?: number;
  width?: number;
  height?: number;
}
```

## Suggested Repository Structure

```text
ylang/
  apps/
    extension/
    desktop-companion/
  packages/
    core/
    adapters/
      nrk/
      youtube/
      generic-html5/
      documents/
    translation/
      deepl/
      openai-compatible/
      local-llm/
    anki/
    media-capture/
    ui/
  docs/
    privacy.md
    adapter-development.md
    anki.md
    media-capture.md
    inspect-source.md
  tests/
    fixtures/
```

## Near-Term Build Plan

1. Scaffold browser extension and core package.
2. Implement NRK DOM-observed subtitle overlay.
3. Implement local translation cache.
4. Add OpenAI-compatible/local LLM provider config.
5. Add YouTube adapter skeleton and generic HTML5 adapter skeleton.
6. Add sentence save model.
7. Add AnkiConnect create/update flow.
8. Add audio-only card capture where browser APIs permit.
9. Add screenshot-plus-audio capture fallback.
10. Add Inspect Source snapshot generator with local-only preview before any LLM call.

## Open Questions

- Which target language should be default: English, German, or user-selected during onboarding?
- Should the default translation provider be DeepL, local OpenAI-compatible endpoint, Microsoft Translator, or another OpenAI-compatible cloud?
- How much media capture should be enabled by default given copyright sensitivity?
- Should `ylang` have account/sync later, or stay strictly local-first?
- Should user-created translations be shareable at all, or only exportable for personal use?
- What is the first non-NRK target after YouTube: generic local files, articles, or PDFs?
