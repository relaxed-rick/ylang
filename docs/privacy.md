# ylang Privacy Draft

ylang is intended to be local-first. This document is a draft for the eventual public privacy policy.

## Data Stored Locally

ylang may store the following in browser extension storage:

- settings and shortcuts,
- source and target languages,
- saved subtitle cue translations,
- saved episode transcript records,
- learned words, phrases, sentences, grammar notes, and learner attempts,
- media attachments from older local test builds, if present,
- Anki note IDs and export hashes,
- optional local LLM debug records when debug is enabled.

## Data Sent To User-Configured Services

ylang does not use a ylang server.

Depending on the user's settings and actions, selected text or subtitle text may be sent to:

- DeepL web pages opened by the extension,
- Microsoft Translator API using the user's key,
- a local or remote OpenAI-compatible LLM endpoint configured by the user,
- local AnkiConnect at `http://127.0.0.1:8765`.

Local LLM features are disabled by default. Microsoft Translator requires a user-supplied key. Anki export requires local Anki plus AnkiConnect.

## Data Not Distributed By ylang

ylang should not ship or publish:

- subtitles,
- translated subtitle files,
- media clips,
- user learning data,
- API keys,
- AI-agent development context or transcripts.

## User Control

Screenshot and audio-snippet capture are disabled in the current alpha because browser and player support has not been reliable enough.

Users should be able to delete learned items, translations, transcripts, existing media attachments, and debug records from the extension UI.

Deleting a learned item in ylang removes local ylang data only. It does not delete any Anki note that was previously created through AnkiConnect.

Removing or uninstalling the browser extension deletes ylang data stored in `chrome.storage.local`. Reloading or updating the same unpacked extension should keep the data. Use **Learned Items -> Export Backup JSON** before uninstalling if you want a local backup of words, phrases, attempts, custom sets, and Anki metadata. Use **Import Backup JSON** to merge that backup into a fresh profile later.
