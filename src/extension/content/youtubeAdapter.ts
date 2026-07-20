import type { SourceRef, SubtitleCue } from "../../core/types";
import { observeGenericNativeSubtitles } from "./genericAdapter";

const YOUTUBE_CAPTION_WINDOW_SELECTOR = ".caption-window, .ytp-caption-window-container";
const YOUTUBE_CAPTION_SEGMENT_SELECTOR = ".ytp-caption-segment";
const YOUTUBE_CAPTION_SETTLE_MS = 220;

export function isYoutubePage(): boolean {
  return location.hostname.endsWith("youtube.com") && location.pathname === "/watch";
}

export function getYoutubeSource(): SourceRef {
  const videoId = new URL(location.href).searchParams.get("v") ?? undefined;
  const title = document.querySelector("h1")?.textContent?.trim() || document.title.replace(" - YouTube", "");

  return {
    provider: "youtube",
    url: location.href,
    title,
    videoId
  };
}

export function observeYoutubeSubtitles(onCue: (cue: SubtitleCue | undefined) => void): () => void {
  let lastText = "";
  let lastEmpty = false;
  let readTimer = 0;

  const readRenderedCue = () => {
    readTimer = 0;
    const rawText = getYoutubeRenderedSubtitleText();
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
    const source = getYoutubeSource();
    onCue({
      id: `youtube-dom:${Date.now()}`,
      sourceId: source.videoId ?? source.url,
      text: rawText.trim(),
      normalizedText,
      language: guessSubtitleLanguage(),
      origin: "dom"
    });
  };

  const scheduleRenderedCueRead = () => {
    if (readTimer) {
      return;
    }

    readTimer = window.setTimeout(readRenderedCue, YOUTUBE_CAPTION_SETTLE_MS);
  };

  scheduleRenderedCueRead();
  const observer = new MutationObserver(scheduleRenderedCueRead);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  const stopNativeTrackObserver = observeGenericNativeSubtitles((cue) => {
    if (cue && !lastText) {
      onCue({
        ...cue,
        sourceId: getYoutubeSource().videoId ?? cue.sourceId,
        id: cue.id.replace(/^generic/u, "youtube")
      });
    }
  });

  return () => {
    window.clearTimeout(readTimer);
    observer.disconnect();
    stopNativeTrackObserver();
  };
}

function getYoutubeRenderedSubtitleText(): string {
  const captionWindows = uniqueElements(document.querySelectorAll<HTMLElement>(YOUTUBE_CAPTION_WINDOW_SELECTOR));
  const windowTexts = captionWindows
    .map((windowElement) => getCaptionWindowText(windowElement))
    .filter(Boolean);

  if (windowTexts.length) {
    return chooseBestCaptionText(windowTexts);
  }

  const segmentText = uniqueElements(document.querySelectorAll<HTMLElement>(YOUTUBE_CAPTION_SEGMENT_SELECTOR))
    .map((node) => normalizeSubtitleText(node.textContent ?? ""))
    .filter(Boolean)
    .join(" ");

  return normalizeSubtitleText(segmentText);
}

function getCaptionWindowText(windowElement: HTMLElement): string {
  const segments = uniqueElements(windowElement.querySelectorAll<HTMLElement>(YOUTUBE_CAPTION_SEGMENT_SELECTOR))
    .map((node) => normalizeSubtitleText(node.textContent ?? ""))
    .filter(Boolean);

  return normalizeSubtitleText(segments.length ? segments.join(" ") : windowElement.textContent ?? "");
}

function chooseBestCaptionText(texts: string[]): string {
  const uniqueTexts = [...new Set(texts.map(normalizeSubtitleText).filter(Boolean))];
  return uniqueTexts.sort((a, b) => b.length - a.length)[0] ?? "";
}

function uniqueElements<T extends Element>(nodes: NodeListOf<T>): T[] {
  return [...new Set([...nodes])];
}

function guessSubtitleLanguage(): string {
  return document.documentElement.lang?.split("-")[0] || navigator.language.split("-")[0] || "auto";
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
