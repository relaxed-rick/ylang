# Change Intake

Short, high-level implementation notes live here first so the release changelog does not depend on memory.

When a user-facing or release-relevant change lands, add one compact bullet under **Unreleased Intake**. Before a tagged release, fold the relevant bullets into `CHANGELOG.md`.

## Unreleased Intake

- Added a cross-platform Node-based public-repository sync command alongside the original Windows PowerShell helper.
- Refreshed lockfile-pinned build dependencies to patched Vite, PostCSS, and nanoid releases after the Linux environment rebuild.
- Added experimental Netflix timed-subtitle loading from subtitle metadata/text exposed to the active logged-in Netflix page, with rendered subtitle fallback.
- Added Netflix manifest subtitle-profile prompting so the in-player Episode panel can get a timed transcript when Netflix exposes one.
- Added an in-player transcript fetch retry button for timed-script loading.
- Added more specific Netflix timed-transcript diagnostics in the Episode panel.
- Added a restricted background-fetch fallback for Netflix subtitle CDN URLs exposed by the active page.
- Added parallel Chromium/Firefox packaging output with a Firefox manifest transform.
- Wrapped generated content scripts to avoid duplicate-injection top-level identifier crashes on single-page video sites.
- Changed pause-triggered DeepL flow so pressing Space in the DeepL helper returns to the source video tab and resumes playback.
