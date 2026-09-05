import type { SourceLanguage, SubtitleCue } from "./types";

export function parseTtml(
  sourceId: string,
  language: SourceLanguage,
  ttmlText: string
): SubtitleCue[] {
  const document = new DOMParser().parseFromString(ttmlText, "application/xml");
  const parseError = document.querySelector("parsererror");
  if (parseError) {
    return [];
  }

  return [...document.querySelectorAll("p")]
    .map((node, index) => parseTtmlCue(node, index, sourceId, language))
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function parseTtmlCue(
  node: Element,
  index: number,
  sourceId: string,
  language: SourceLanguage
): SubtitleCue | undefined {
  const startMs = parseTtmlTime(node.getAttribute("begin") ?? "");
  const endMs = parseTtmlEndMs(node, startMs);
  const text = normalizeSubtitleText(readTtmlText(node));

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !text) {
    return undefined;
  }

  return {
    id: `${sourceId}:ttml:${startMs}-${endMs}:${index}`,
    sourceId,
    startMs,
    endMs,
    text,
    normalizedText: text,
    language,
    origin: "track"
  };
}

function parseTtmlEndMs(node: Element, startMs: number): number {
  const end = node.getAttribute("end");
  if (end) {
    return parseTtmlTime(end);
  }

  const duration = node.getAttribute("dur");
  if (duration) {
    return startMs + parseTtmlTime(duration);
  }

  return Number.NaN;
}

function readTtmlText(node: Element): string {
  const parts: string[] = [];

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? "");
      continue;
    }

    if (child instanceof HTMLBRElement || child.nodeName.toLowerCase() === "br") {
      parts.push("\n");
      continue;
    }

    if (child instanceof Element) {
      parts.push(readTtmlText(child));
    }
  }

  return parts.join("");
}

function parseTtmlTime(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const clock = normalized.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/u);
  if (clock) {
    return (
      Number(clock[1]) * 60 * 60 * 1000 +
      Number(clock[2]) * 60 * 1000 +
      Number(clock[3]) * 1000 +
      Number((clock[4] ?? "0").padEnd(3, "0").slice(0, 3))
    );
  }

  const seconds = normalized.match(/^(\d+(?:\.\d+)?)s$/u);
  if (seconds) {
    return Number(seconds[1]) * 1000;
  }

  const milliseconds = normalized.match(/^(\d+(?:\.\d+)?)ms$/u);
  if (milliseconds) {
    return Number(milliseconds[1]);
  }

  return Number.NaN;
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
