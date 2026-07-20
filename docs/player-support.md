# Player And Site Support

Reliable subtitle support is partly site-specific.

## Why Adapters Exist

For good video-mode behavior ylang needs to know at least one of:

- where timed subtitle files can be loaded,
- where rendered subtitle DOM nodes appear,
- how the site updates video state during single-page navigation,
- where an injected overlay survives fullscreen and player rerenders.

That is why NRK and Netflix use dedicated adapters.

Current state:

- NRK is the most complete adapter. It can load timed WebVTT cues through the playback manifest where available, falls back to rendered subtitle observation, and now restarts subtitle loading when the page switches to another episode inside the same single-page session.
- Netflix is a rendered-subtitle fallback adapter. It observes visible subtitle text and can support overlay actions, but it does not currently load a full timed transcript.
- YouTube has an experimental rendered-caption adapter. It observes visible YouTube caption segments and can use the same overlay/actions path as other video pages. Full timed transcript loading is still planned.
- Generic HTML5 native-track probing exists in code for `<video>`, `<audio>`, and `<track>` captions, but it is not broadly injected on every website yet because that would combine broad video-mode injection with broad reading-mode injection.

## Dynamic Probing

Dynamic probing is possible and planned, especially for common cases:

- native `<video>` and `<audio>` elements,
- native `<track kind="subtitles">` and `<track kind="captions">`,
- visible rendered subtitle containers,
- common player framework hints,
- user-provided `.vtt` or `.srt` files.

Dynamic probing cannot always recover subtitles from DRM players, cross-origin iframes, closed shadow DOM, canvas-rendered subtitles, or APIs blocked by CORS/authentication. The realistic design is a generic probe plus small site adapters for pages that need special handling.

## Improving Coverage

The best next expansion path is:

1. Build a small adapter registry so each site declares detection, subtitle source strategy, overlay mount target, and limitations.
2. Harden the generic HTML5 probe for native `<video>`, `<audio>`, and `<track>` captions, then decide where to enable it.
3. Make YouTube the first major non-NRK timed-caption target by loading accessible caption tracks or transcript data when available.
4. Keep Netflix and other large streaming services conservative: use rendered subtitle observation when allowed by the page, avoid bypassing DRM or private APIs, and document that full transcript import may not be possible.
5. Add adapter request issue templates so users can report sites with enough technical detail without sharing copyrighted subtitle files.

Large streaming services can be supported only to the extent that captions are visible or exposed to the page. The extension should not try to defeat DRM, authentication, or access controls.

## Custom Player Mode Idea

A later experimental feature could generate a copy-paste helper prompt that asks a user or LLM to inspect a target page and suggest adapter parameters. This should stay clearly marked as experimental, because adapter suggestions can be brittle and page-specific.
