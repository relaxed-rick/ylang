# Changelog

All notable user-facing changes to ylang should be recorded here.

## Unreleased

- Added release-readiness checks for packaged extension output and public repository boundaries.
- Added local-first docs for privacy, permissions, Anki, local LLM setup, player support, and troubleshooting.
- Added GitHub issue templates for bugs, site adapter requests, and feature requests.
- Added a contextual copyleft AI license draft.
- Added third-party notices, a smoke-test results template, and a public snapshot helper script.
- Disabled new screenshot and audio-snippet capture for the alpha.
- Improved NRK subtitle source reload when switching episodes inside the same single-page session.
- Improved Learned Items selection order so row checkboxes appear before expand arrows.
- Added experimental Netflix timed-subtitle loading for full-script workflows when Netflix exposes subtitle metadata/text to the active page.
- Added Netflix manifest subtitle-profile prompting so the Episode translation panel can show a timed transcript when available.
- Added an in-player transcript fetch retry button.
- Added more specific Netflix timed-transcript diagnostics in the Episode panel.
- Added a restricted background-fetch fallback for Netflix subtitle CDN URLs exposed by the active page.
- Added parallel Chromium/Firefox packaging output with a Firefox manifest transform.
- Added duplicate-injection guards around generated content scripts.
- Changed pause-triggered DeepL flow so Space in the DeepL helper resumes playback in the source video tab.

## 0.1.0-alpha

- Initial private alpha target for a Chrome/Chromium MV3 extension.
- Focused on NRK TV subtitle learning, DeepL helper workflow, Microsoft Translator, optional local LLM actions, local Learned Items, and AnkiConnect export.
