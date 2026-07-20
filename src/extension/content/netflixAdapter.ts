import type { SourceLanguage, SourceRef, SubtitleCue } from "../../core/types";

const NETFLIX_SUBTITLE_SELECTORS = [
  "[data-uia='player-subtitle-text']",
  ".player-timedtext-text-container",
  ".player-timedtext span",
  ".player-timedtext"
];

export function isNetflixPage(): boolean {
  return location.hostname.endsWith("netflix.com");
}

export function getNetflixSource(): SourceRef {
  const videoId = location.pathname.match(/\/watch\/(\d+)/u)?.[1];
  return {
    provider: "netflix",
    url: location.href,
    title: document.title.replace(/\s*-\s*Netflix\s*$/iu, "").trim() || document.title,
    videoId
  };
}

export function observeNetflixSubtitles(onCue: (cue: SubtitleCue | undefined) => void): () => void {
  let lastText = "";
  let lastEmpty = false;

  const readCurrentCue = () => {
    const rawText = getNetflixSubtitleText();
    const normalizedText = normalizeSubtitleText(rawText);

    if (!normalizedText) {
      if (!lastEmpty) {
        lastEmpty = true;
        lastText = "";
        onCue(undefined);
      }
      return;
    }

    lastEmpty = false;
    if (normalizedText === lastText) {
      return;
    }

    lastText = normalizedText;
    const source = getNetflixSource();
    onCue({
      id: `netflix-dom:${Date.now()}`,
      sourceId: source.videoId ?? source.url,
      text: rawText.trim(),
      normalizedText,
      language: guessSubtitleLanguage(),
      origin: "dom"
    });
  };

  readCurrentCue();

  const observer = new MutationObserver(readCurrentCue);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  return () => observer.disconnect();
}

function getNetflixSubtitleText(): string {
  const textGroups = NETFLIX_SUBTITLE_SELECTORS
    .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
    .map((node) => normalizeSubtitleText(node.textContent ?? ""))
    .filter(Boolean);

  return textGroups.sort((a, b) => b.length - a.length)[0] ?? "";
}

function guessSubtitleLanguage(): SourceLanguage {
  const lang = document.documentElement.lang || navigator.language || "auto";
  return lang.split("-")[0] || "auto";
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
