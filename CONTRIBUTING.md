# Contributing

ylang is a local-first language learning browser extension. Contributions should keep that privacy model intact.

## Before You Open A Pull Request

- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run release:check`.
- Run `npm run public:check`.
- Do not commit subtitles, translations, screenshots, audio snippets, Anki packages, API keys, local storage dumps, or private development notes.

## Site Adapters

Site support should be added through small adapters rather than one-off content-script patches. A good adapter describes:

- supported domains,
- how to detect the player,
- how subtitles or captions are found,
- how playback time is read,
- where the ylang overlay should mount,
- known limitations.

Do not bypass DRM, authentication, geo restrictions, paywalls, or site access controls.

## Privacy Expectations

New features should be local by default. If text can be sent to DeepL, Microsoft Translator, a local/remote LLM, or AnkiConnect, the UI and docs should make that clear.

## License

The current license is a project-specific contextual copyleft AI license draft. If your contribution touches licensing, packaging, or third-party redistribution, call that out explicitly in the pull request.
