# License Notes

ylang is intended to use a contextual copyleft license for AI training.

The goal is simple:

- normal users can inspect, run, modify, and share the extension,
- third-party subtitles, translations, media captures, and user learning data are not licensed by this repo,
- closed-weight generative AI model training on the code or docs is not allowed,
- if the code or docs are used to train, fine-tune, distill, or adapt a generative AI model, the resulting model must have open weights or equivalent open model parameters.

The current `LICENSE.md` is a project-specific draft inspired by the paper "The Case for Contextual Copyleft: Licensing Open Source Training Data and Generative AI" at https://arxiv.org/pdf/2507.12713.

Important caveat: this is not currently an OSI-approved license and has not been reviewed by legal counsel. The paper itself notes that adding contextual AI clauses to existing open source licenses can create compatibility questions. Treat the current license as a release-blocking legal review item before wider adoption.

## Current Review Notes

This is an engineering review, not legal advice. Before using this as the public license, review these points with someone qualified:

- The AI-training restriction means the project is probably not "open source" in the strict OSI sense, even if the source is public.
- `LICENSE.md` grants permission to sublicense, but the text should be checked so sublicensing cannot accidentally remove the contextual AI copyleft obligations.
- The license should get a clear copyright notice or contributor copyright policy before publication.
- "Corresponding source code", "substantial portion", and "larger works" may need tighter definitions if you want predictable enforcement.
- The model-training condition appears to require open model parameters even for private/internal training, because the resulting model must be released. Confirm that this is intentional.
- The "open model parameters" definition may need more precise wording around tokenizer files, architecture/config files, inference code, quantized weights, adapters, and model licenses.
- The text only grants rights to ylang code and docs; it intentionally does not grant rights to subtitles, translations, screenshots, audio, Anki decks, user learning data, API keys, or debug data.
