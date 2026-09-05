import type { SourceLanguage, SourceRef, SubtitleCue } from "../../core/types";

const ORF_HOSTNAME = "on.orf.at";
const ORF_SUBTITLE_SETTLE_MS = 140;
const ORF_SUBTITLE_SELECTORS = [
  ".bmpui-ui-subtitle-overlay:not(.bmpui-hidden) .bmpui-subtitle-vtt-cue .bmpui-ui-label-text",
  ".bmpui-ui-subtitle-overlay:not(.bmpui-hidden) .bmpui-subtitle-vtt-cue",
  ".bmpui-ui-subtitle-overlay:not(.bmpui-hidden)"
];

export function isOrfPage(): boolean {
  return location.hostname === ORF_HOSTNAME && location.pathname.startsWith("/video/");
}

export function getOrfSource(): SourceRef {
  const videoId = location.pathname.match(/\/video\/([^/]+)/u)?.[1];
  const playerTitle = document.querySelector<HTMLElement>(".bmpui-label-metadata-title .bmpui-ui-label-text")
    ?.textContent
    ?.trim();
  return {
    provider: "orf",
    url: location.href,
    title: playerTitle || document.title.replace(/\s*-\s*ORF\s*(ON)?\s*$/iu, "").trim() || document.title,
    videoId
  };
}

export function observeOrfSubtitles(onCue: (cue: SubtitleCue | undefined) => void): () => void {
  let lastText = "";
  let lastEmpty = false;
  let readTimer = 0;

  const readCurrentCue = () => {
    readTimer = 0;
    const rawText = getOrfRenderedSubtitleText();
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
    const source = getOrfSource();
    onCue({
      id: `orf-dom:${Date.now()}`,
      sourceId: source.videoId ?? source.url,
      text: rawText.trim(),
      normalizedText,
      language: guessSubtitleLanguage(),
      origin: "dom"
    });
  };

  const scheduleCueRead = () => {
    window.clearTimeout(readTimer);
    readTimer = window.setTimeout(readCurrentCue, ORF_SUBTITLE_SETTLE_MS);
  };

  scheduleCueRead();
  const observer = new MutationObserver(scheduleCueRead);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  return () => {
    window.clearTimeout(readTimer);
    observer.disconnect();
  };
}

function getOrfRenderedSubtitleText(): string {
  const textGroups = ORF_SUBTITLE_SELECTORS
    .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
    .map((node) => normalizeSubtitleText(getTextWithLineBreaks(node)))
    .filter(Boolean);

  return [...new Set(textGroups)].sort((a, b) => b.length - a.length)[0] ?? "";
}

function getTextWithLineBreaks(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("br").forEach((breakElement) => breakElement.replaceWith("\n"));
  return clone.textContent ?? "";
}

function guessSubtitleLanguage(): SourceLanguage {
  const language = document.documentElement.lang || navigator.language || "de";
  return language.split("-")[0] || "de";
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
