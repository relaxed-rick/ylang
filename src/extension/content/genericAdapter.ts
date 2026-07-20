import type { SourceLanguage, SourceRef, SubtitleCue, SubtitleTrack } from "../../core/types";

export function getGenericSource(): SourceRef {
  return {
    provider: "generic",
    url: location.href,
    title: document.title || location.hostname
  };
}

export function canUseGenericVideoAdapter(): boolean {
  return Boolean(findPrimaryMediaElement());
}

export async function loadGenericNativeSubtitleTrack(): Promise<SubtitleTrack | undefined> {
  const media = await waitForPrimaryMediaElement();
  if (!media) {
    return undefined;
  }

  const textTrack = await waitForBestTextTrack(media);
  if (!textTrack) {
    return undefined;
  }

  const source = getGenericSource();
  const language = normalizeTrackLanguage(textTrack.language);
  const cues = textTrackCuesToSubtitleCues(textTrack, source, language);
  if (!cues.length) {
    return undefined;
  }

  return {
    id: `generic-track:${source.url}:${language}:${textTrack.label || textTrack.kind}`,
    sourceId: source.url,
    sourceUrl: source.url,
    language,
    label: textTrack.label || textTrack.kind,
    cues
  };
}

export function observeGenericNativeSubtitles(onCue: (cue: SubtitleCue | undefined) => void): () => void {
  let stopped = false;
  let timer = 0;
  let lastCueId = "";

  const sync = async () => {
    if (stopped) {
      return;
    }

    const media = findPrimaryMediaElement();
    const textTrack = media ? chooseBestTextTrack(media.textTracks) : undefined;
    if (textTrack) {
      ensureTrackReadable(textTrack);
      const cue = getActiveCue(textTrack);
      const cueId = cue?.id ?? "";
      if (cueId !== lastCueId) {
        lastCueId = cueId;
        onCue(cue);
      }
    }

    timer = window.setTimeout(sync, media && !media.paused ? 180 : 500);
  };

  void sync();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

function findPrimaryMediaElement(): HTMLMediaElement | undefined {
  const media = [...document.querySelectorAll<HTMLMediaElement>("video, audio")]
    .filter((element) => element.textTracks.length > 0 || element.querySelector("track"));

  return media.sort((a, b) => getMediaArea(b) - getMediaArea(a))[0] ??
    [...document.querySelectorAll<HTMLMediaElement>("video, audio")]
      .sort((a, b) => getMediaArea(b) - getMediaArea(a))[0];
}

async function waitForPrimaryMediaElement(): Promise<HTMLMediaElement | undefined> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const media = findPrimaryMediaElement();
    if (media) {
      return media;
    }
    await delay(200);
  }
  return undefined;
}

async function waitForBestTextTrack(media: HTMLMediaElement): Promise<TextTrack | undefined> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const textTrack = chooseBestTextTrack(media.textTracks);
    if (textTrack) {
      ensureTrackReadable(textTrack);
      if ((textTrack.cues?.length ?? 0) > 0) {
        return textTrack;
      }
    }
    await delay(200);
  }
  return chooseBestTextTrack(media.textTracks);
}

function chooseBestTextTrack(tracks: TextTrackList): TextTrack | undefined {
  return [...tracks].find(isSubtitleLikeTrack) ?? [...tracks][0];
}

function isSubtitleLikeTrack(track: TextTrack): boolean {
  return track.kind === "subtitles" || track.kind === "captions";
}

function ensureTrackReadable(track: TextTrack): void {
  if (track.mode === "disabled") {
    track.mode = "hidden";
  }
}

function textTrackCuesToSubtitleCues(
  track: TextTrack,
  source: SourceRef,
  language: SourceLanguage
): SubtitleCue[] {
  const cues = [...(track.cues ?? [])]
    .map((cue, index) => textTrackCueToSubtitleCue(cue, index, source, language))
    .filter((cue): cue is SubtitleCue => Boolean(cue));

  return dedupeAdjacentCues(cues);
}

function getActiveCue(track: TextTrack): SubtitleCue | undefined {
  const cue = [...(track.activeCues ?? [])][0];
  const source = getGenericSource();
  return cue ? textTrackCueToSubtitleCue(cue, 0, source, normalizeTrackLanguage(track.language)) : undefined;
}

function textTrackCueToSubtitleCue(
  cue: TextTrackCue,
  index: number,
  source: SourceRef,
  language: SourceLanguage
): SubtitleCue | undefined {
  const text = getCueText(cue);
  const normalizedText = normalizeSubtitleText(text);
  if (!normalizedText) {
    return undefined;
  }

  return {
    id: `${source.url}:cue:${Math.round(cue.startTime * 1000)}:${Math.round(cue.endTime * 1000)}:${index}`,
    sourceId: source.videoId ?? source.programId ?? source.url,
    startMs: Math.round(cue.startTime * 1000),
    endMs: Math.round(cue.endTime * 1000),
    text,
    normalizedText,
    language,
    origin: "track"
  };
}

function getCueText(cue: TextTrackCue): string {
  if ("text" in cue && typeof cue.text === "string") {
    return cue.text;
  }

  return "";
}

function dedupeAdjacentCues(cues: SubtitleCue[]): SubtitleCue[] {
  const deduped: SubtitleCue[] = [];
  for (const cue of cues) {
    const previous = deduped[deduped.length - 1];
    if (previous?.normalizedText === cue.normalizedText && previous.endMs === cue.endMs) {
      continue;
    }
    deduped.push(cue);
  }
  return deduped;
}

function normalizeTrackLanguage(language: string): SourceLanguage {
  return language || document.documentElement.lang?.split("-")[0] || navigator.language.split("-")[0] || "auto";
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMediaArea(media: HTMLMediaElement): number {
  const rect = media.getBoundingClientRect();
  return rect.width * rect.height;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
