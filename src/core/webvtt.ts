import type { SourceLanguage, SubtitleCue } from "./types";

const TIMING_SEPARATOR = "-->";

export function parseWebVtt(
  sourceId: string,
  language: SourceLanguage,
  vttText: string
): SubtitleCue[] {
  const blocks = vttText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    if (!lines.length || lines[0].startsWith("WEBVTT") || lines[0].startsWith("NOTE")) {
      continue;
    }

    const timingIndex = lines.findIndex((line) => line.includes(TIMING_SEPARATOR));
    if (timingIndex < 0) {
      continue;
    }

    const [startRaw, endWithSettings] = lines[timingIndex].split(TIMING_SEPARATOR).map((part) => part.trim());
    const endRaw = endWithSettings.split(/\s+/)[0];
    const startMs = parseTimestamp(startRaw);
    const endMs = parseTimestamp(endRaw);
    const textLines = lines.slice(timingIndex + 1);
    const text = cleanupCueText(textLines.join("\n"));
    const normalizedText = normalizeSubtitleText(text);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !normalizedText) {
      continue;
    }

    cues.push({
      id: `${sourceId}:${startMs}-${endMs}`,
      sourceId,
      startMs,
      endMs,
      text,
      normalizedText,
      language,
      origin: "track"
    });
  }

  return cues;
}

function parseTimestamp(value: string): number {
  const parts = value.split(":");
  const secondsPart = parts.pop() ?? "0";
  const minutesPart = parts.pop() ?? "0";
  const hoursPart = parts.pop() ?? "0";
  const [seconds, milliseconds = "0"] = secondsPart.split(".");

  return (
    Number(hoursPart) * 60 * 60 * 1000 +
    Number(minutesPart) * 60 * 1000 +
    Number(seconds) * 1000 +
    Number(milliseconds.padEnd(3, "0").slice(0, 3))
  );
}

function cleanupCueText(text: string): string {
  return text
    .replace(/<c(?:\.[^>]*)?>/g, "")
    .replace(/<\/c>/g, "")
    .replace(/<v(?:\s+[^>]*)?>/g, "")
    .replace(/<\/v>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
