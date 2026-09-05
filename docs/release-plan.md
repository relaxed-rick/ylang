# ylang Release Plan

This is the working checklist for publishing ylang as an open-source browser extension on GitHub. Browser-store publishing is a later, stricter track; see `docs/browser-compatibility.md` for Chrome/Firefox notes.

## Release Principle

The public repository should be initialized cleanly at the end of private development. Do not publish AI chat context, agent transcripts, scratch prompts, local debug dumps, personal learning data, subtitles, translations, media captures, or generated extension storage.

## Pre-Release Gates

- Run `npm run typecheck`, `npm run build`, `npm run release:check:all`, and `npm run public:check` as separate commands.
- Follow `docs/private-alpha-stabilization.md`.
- Follow `docs/public-repo-boundary.md` before creating the public GitHub repository.
- Test a fresh install with empty extension storage.
- Test NRK video mode, Netflix rendered subtitle mode, reading mode, DeepL helper, Microsoft Translator, local LLM offline/online, and AnkiConnect offline/online.
- Verify `dist/manifest.json`, `dist/chromium/manifest.json`, and `dist/firefox/manifest.json` contain no unexpected permissions or generated source-only paths.
- Verify built content scripts do not contain top-level `import` or `export`.
- Confirm screenshots/audio capture remain disabled for the alpha.
- Confirm no API keys, local model names, local URLs beyond defaults, or user data are committed.

## GitHub Publish Blockers

- Clean public snapshot has not been prepared yet.
- License choice needs review because the current contextual copyleft AI license is project-specific and not OSI-approved.
- Fresh-install smoke testing needs to be recorded with `docs/smoke-test-checklist.md`.
- Third-party wording lives in `docs/third-party-notices.md`; review it before publishing.

## Later Store Blockers

- Permission review: reduce broad reading-mode access where practical, ideally through optional host permissions or a clear enablement flow.
- Store listing: prepare screenshots, concise description, detailed description, support contact, category, and privacy disclosures.
- Store release packaging: zip only the relevant built extension output, not source, node_modules, or local artifacts. Use `dist/chromium` for Chrome Web Store and `dist/firefox` for Firefox AMO experiments.

## Suggested Release Stages

1. **Private Alpha**
   Use unpacked extension only. Focus on correctness, storage migration safety, and UX rough edges.

2. **Source-Available Beta**
   Create the clean public repo, add docs, issues, and a warning that site adapters may break.

3. **Chrome Web Store Draft**
   Upload a draft package, answer privacy questions honestly, and resolve permission warnings.

4. **Firefox Port**
   Test the generated Firefox-compatible package, test AMO signing requirements, verify Chrome-specific APIs such as `chrome.system.display` degrade cleanly, and smoke-test local LLM/Anki/DeepL flows.

5. **Public Release**
   Tag a release, attach the built extension zip, publish store listing, and keep a changelog.

## Near-Term Release Work

- Record a fresh-install smoke test with `docs/smoke-test-results-template.md`.
- Decide whether the draft contextual copyleft AI license is acceptable for the first public alpha.
- Use `npm run public:snapshot -- <empty-target-directory>` when preparing a clean public candidate.
- Use `npm run public:sync -- <public-repo-directory>` to update the public repo from the private workspace through an allowlisted clean snapshot. The original `scripts/sync-public-repo.ps1` entry point remains available on Windows.
- Keep an Experimental settings section for custom player helper prompts as a post-alpha feature unless it becomes necessary before release.
- Keep a permissions hardening pass for reading mode on the later store track.
