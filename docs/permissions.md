# ylang Permission Rationale

This document tracks why each browser permission exists and what should be reduced before publication.

## Current Permissions

- `storage`: saves settings, translations, transcripts, learned items, existing media metadata, Anki IDs, and optional debug data.
- `tabs`: manages and reuses the extension-created DeepL helper tab/window.
- `system.display`: Chromium package only; lists available screens so the extension-created DeepL helper window can be positioned on a user-selected monitor.

## Current Host Permissions

- `https://tv.nrk.no/*`: NRK video subtitle overlay.
- `https://www.netflix.com/*`: Netflix video overlay, rendered subtitle observation, and experimental loading of subtitle text already exposed to the active Netflix page.
- `https://*.nflxvideo.net/*`: fallback fetch for Netflix timed subtitle URLs exposed by the active Netflix page. Background fetches are additionally limited to HTTPS `nflxvideo.net` URLs that look like subtitle downloads and not `/range/` video chunks.
- `https://www.youtube.com/*`: experimental YouTube rendered-caption adapter on watch pages.
- `https://on.orf.at/*`: experimental ORF ON rendered-subtitle adapter on video pages.
- `https://www.deepl.com/*`: extension-managed DeepL helper interaction.
- `https://api.cognitive.microsofttranslator.com/*`: Microsoft Translator API calls.
- `https://psapi.nrk.no/*` and `https://undertekst.nrk.no/*`: NRK subtitle track loading.
- `http://127.0.0.1/*` and `http://localhost/*`: local LLM servers and AnkiConnect.
- `http://*/*`, `https://*/*`, and `file:///*` reading mode matches: text-selection tools on webpages, PDFs, EPUB readers, and local documents.

Screenshot and audio-snippet capture are disabled in the current alpha, so there is no active capture permission flow.

## Pre-Publication Hardening

- Consider moving broad reading-mode access to optional host permissions.
- Consider requiring explicit user enablement per site for reading mode.
- Re-check whether `file:///*` should be omitted from the published default.
- Firefox packaging removes `system.display`; DeepL placement should degrade to fallback placement there.
- Keep DeepL modifications restricted to extension-created DeepL tabs wherever technically possible.
- Document local host access clearly: ylang talks to user-configured local services, not a ylang backend.
