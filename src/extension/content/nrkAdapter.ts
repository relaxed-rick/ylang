import type { SourceLanguage, SourceRef, SubtitleCue, SubtitleTrack } from "../../core/types";
import { parseWebVtt } from "../../core/webvtt";
import { extensionFetchJson, extensionFetchText } from "./extensionFetch";

const NRK_SUBTITLE_SELECTOR = ".tv-player-subtitle-text";
const NRK_PLAYER_SELECTOR = "tv-player";

export function getNrkSource(): SourceRef {
  const player = document.querySelector(NRK_PLAYER_SELECTOR);
  const src = player?.getAttribute("src") ?? "";
  const programId = src.startsWith("nrk:program:") ? src.replace("nrk:program:", "") : undefined;
  const title = document.querySelector("h1")?.textContent?.trim() || document.title.replace(" - NRK TV", "");

  return {
    provider: "nrk",
    url: location.href,
    title,
    programId
  };
}

export function findNrkPlayerHost(): HTMLElement | null {
  return document.querySelector("tv-player");
}

export function findNativeSubtitleContainer(): HTMLElement | null {
  return document.querySelector("tv-player-subtitles");
}

export function observeNrkSubtitles(onCue: (cue: SubtitleCue) => void): () => void {
  let lastText = "";

  const readCurrentCue = () => {
    const subtitleNode = document.querySelector(NRK_SUBTITLE_SELECTOR);
    const rawText = subtitleNode?.textContent ?? "";
    const normalizedText = normalizeSubtitleText(rawText);

    if (!normalizedText || normalizedText === lastText) {
      return;
    }

    lastText = normalizedText;
    onCue({
      id: `nrk-dom:${Date.now()}`,
      sourceId: getNrkSource().programId ?? location.href,
      text: rawText.trim(),
      normalizedText,
      language: "no",
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

export async function loadNrkSubtitleTrack(): Promise<SubtitleTrack | undefined> {
  const source = getNrkSource();
  if (!source.programId) {
    return undefined;
  }

  const manifest = await extensionFetchJson<NrkPlaybackManifest>(
    `https://psapi.nrk.no/playback/manifest/program/${source.programId}`
  );
  const subtitle = manifest.playable?.subtitles?.find((candidate) => candidate.webVtt);
  if (!subtitle?.webVtt) {
    return undefined;
  }

  const language = mapNrkLanguage(subtitle.language);
  const vttText = await extensionFetchText(subtitle.webVtt);
  const cues = parseWebVtt(source.programId, language, vttText);
  if (!cues.length) {
    return undefined;
  }

  return {
    id: `${source.programId}:${subtitle.language}`,
    sourceId: source.programId,
    sourceUrl: subtitle.webVtt,
    language,
    label: subtitle.label,
    cues
  };
}

export function observeTimedSubtitleTrack(
  track: SubtitleTrack,
  onCue: (cue: SubtitleCue | undefined) => void
): () => void {
  let lastCueId = "";
  let rafId = 0;
  let stopped = false;

  const sync = () => {
    if (stopped) {
      return;
    }

    const video = document.querySelector("video");
    const currentMs = Math.floor((video?.currentTime ?? 0) * 1000);
    const cue = findCueAtTime(track.cues, currentMs);
    const cueId = cue?.id ?? "";

    if (cueId !== lastCueId) {
      lastCueId = cueId;
      onCue(cue);
    }

    rafId = window.setTimeout(sync, video && !video.paused ? 120 : 300);
  };

  sync();

  return () => {
    stopped = true;
    window.clearTimeout(rafId);
  };
}

function findCueAtTime(cues: SubtitleCue[], currentMs: number): SubtitleCue | undefined {
  let low = 0;
  let high = cues.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    const startMs = cue.startMs ?? 0;
    const endMs = cue.endMs ?? 0;

    if (currentMs < startMs) {
      high = middle - 1;
    } else if (currentMs > endMs) {
      low = middle + 1;
    } else {
      return cue;
    }
  }

  return undefined;
}

function mapNrkLanguage(language: string): SourceLanguage {
  if (language === "nb" || language === "nn") {
    return "nb";
  }

  return language || "auto";
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface NrkPlaybackManifest {
  playable?: {
    subtitles?: Array<{
      type?: string;
      language: string;
      label?: string;
      defaultOn?: boolean;
      webVtt?: string;
    }>;
  };
}
