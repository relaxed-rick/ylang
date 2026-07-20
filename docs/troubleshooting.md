# Troubleshooting

## NRK Shows Subtitles From The Previous Episode

NRK can switch episodes inside the same single-page app route without a full page reload. ylang watches for source changes and restarts subtitle loading, but if the page or player gets into a stale state, refresh the tab once.

## DeepL Looks Modified In A Normal User Tab

ylang should only compact DeepL pages that were opened or marked by the extension. If a normal DeepL tab is still modified, close extension-created DeepL popups and reload the normal DeepL tab.

## Local LLM Fails To Fetch

Check that the local server is running, that the base URL is correct, and that browser extension origins are allowed. See `docs/llm-setup.md`.

## Anki Export Does Nothing

Start Anki and confirm AnkiConnect is installed. ylang talks to AnkiConnect at `http://127.0.0.1:8765`.

## Reading Mode Does Not Appear On A Page

Some pages place text inside cross-origin iframes, custom canvas renderers, PDF viewers, or shadow DOM where normal page selection is not exposed to the content script. Reading mode is broad but not universal.

## PDF Text Selection

Browser PDF viewers differ. If selected PDF text is not exposed to the page selection API, ylang may not see it. A future Firefox build or a dedicated PDF mode may behave differently.
