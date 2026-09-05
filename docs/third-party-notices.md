# Third-Party Notices And Disclaimers

ylang is an independent learning tool. It is not affiliated with NRK, Netflix, YouTube, ORF, DeepL, Microsoft, Anki, Ollama, LM Studio, or any subtitle, streaming, or translation provider.

## Subtitles, Translations, And Media

ylang does not ship, host, publish, or distribute subtitles, translated subtitle files, video, audio, screenshots, or user learning data.

Users are responsible for following the terms, copyright rules, and access rules of the sites and services they use. ylang should not be used to bypass DRM, authentication, geo restrictions, paywalls, or technical access controls.

Screenshot and audio-snippet capture are disabled in the current alpha.

## Translation Providers

Depending on user settings and actions, selected text or subtitle text may be sent to:

- DeepL web pages opened by the extension,
- Microsoft Translator API using the user's own key,
- a user-configured local or remote OpenAI-compatible LLM endpoint.

Provider quality, availability, pricing, and terms are controlled by those providers, not by ylang.

## Local Services

Anki export uses local AnkiConnect at `http://127.0.0.1:8765`. Local LLM support uses the endpoint configured by the user. ylang does not operate a backend service.

## Site Support

Site adapters can break when websites change their player or subtitle DOM. NRK is currently the best-supported target. Netflix support can try subtitle metadata/text exposed to the active page and otherwise falls back to rendered subtitle observation. YouTube and ORF ON support uses rendered subtitle/caption observation and should be treated as experimental.
