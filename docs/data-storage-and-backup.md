# Data Storage And Backup

ylang stores alpha user data in browser extension storage, specifically `chrome.storage.local`.

Chrome documents `storage.local` as local extension storage that persists through cache and history clearing, but is cleared when the extension is removed. In practice:

- reloading or updating the same unpacked extension should keep ylang data,
- disabling and re-enabling the extension should keep ylang data,
- removing or uninstalling the extension deletes its local extension storage,
- loading ylang in a new browser profile starts with empty storage and does not touch data in the old profile.

## What ylang Stores

The important local keys are:

- `ylang:settings`: settings, shortcuts, provider config, UI colors, and feature toggles,
- `ylang:learning-items:index`: learned-item and attempt index,
- `ylang:learning-item:<id>`: learned words, phrases, sentences, grammar notes, attempts, local translations, occurrences, Anki note IDs, and any legacy media attachments,
- `ylang:learning-collections:index`: custom learned-item sets,
- `ylang:saved-transcripts:index` and `ylang:saved-transcript:<id>`: saved episode transcript records,
- `ylang:translation:<hash>` and `ylang:selection-hints:<hash>`: local translation cache and selected-word hints,
- `ylang:llm-debug:last`: optional local LLM debug record when debug is enabled.

## Before A Fresh Install

If you want a truly fresh install in the same browser profile:

1. Open ylang settings.
2. Open **Learned Items**.
3. Click **Export Backup JSON**.
4. Optionally export to Anki too, if Anki is your external study system.
5. Go to `chrome://extensions` or `brave://extensions`.
6. Remove ylang.
7. Rebuild with `npm run build`.
8. Load the `dist` folder again with **Load unpacked**.

For testing without deleting existing data, use a second Chrome/Brave profile and load `dist` there.

## Backup Scope

**Export Backup JSON** exports learned items, attempts, custom sets, local translations stored inside those items, occurrences, Anki IDs/export hashes, and legacy media attachments embedded in learned items.

It is a ylang data backup, not an Anki deck. Anki export still goes through AnkiConnect and is meant for study cards, not for restoring ylang metadata.

Use **Import Backup JSON** on the same page to merge a backup into the current browser profile. Import keeps stable item IDs, adds missing items, updates older matching items from the backup, and leaves newer local items unchanged.
