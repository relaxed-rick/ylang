# Local LLM Setup

Local LLM support is optional. ylang should run without Ollama, LM Studio, or any remote LLM.

## Supported Shape

ylang expects an OpenAI-compatible chat endpoint, usually one of:

- Ollama at `http://127.0.0.1:11434/v1`
- LM Studio local server
- another user-configured OpenAI-compatible endpoint

Keep the local service bound to localhost unless you intentionally know what you are exposing.

## Ollama Browser Extension Access

For Chrome or Edge, allow only your installed extension ID when possible:

```powershell
setx OLLAMA_HOST "127.0.0.1:11434"
setx OLLAMA_ORIGINS "chrome-extension://YOUR_EXTENSION_ID"
```

Then restart Ollama so the environment variables take effect.

To find the extension ID:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Find ylang.
4. Copy the extension ID.
5. Replace `YOUR_EXTENSION_ID` in the command above.

For one PowerShell session only:

```powershell
$env:OLLAMA_HOST='127.0.0.1:11434'; $env:OLLAMA_ORIGINS='chrome-extension://YOUR_EXTENSION_ID'; ollama serve
```

For `cmd.exe`, use:

```bat
set OLLAMA_HOST=127.0.0.1:11434
set OLLAMA_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
ollama serve
```

Avoid exposing Ollama broadly:

```bash
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_ORIGINS=*
```

## Model Loading

The first request can be slow while the model is loaded into memory. ylang waits briefly before showing a "Waiting for local LLM..." message so quick responses do not flicker.

Small instruction-tuned models are enough for short word explanations, but translation quality varies a lot. Stronger models usually follow language and output-format instructions more reliably.

## Prompt Debugging

Prompt debugging is experimental. Enable it only when testing prompts, because it can store raw prompt and response text locally.
