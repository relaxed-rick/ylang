import type { SourceLanguage, SourceRef, SubtitleCue, SubtitleTrack } from "../../core/types";
import { parseTtml } from "../../core/ttml";
import { parseWebVtt } from "../../core/webvtt";
import { extensionFetchText } from "./extensionFetch";

const NETFLIX_SUBTITLE_SELECTORS = [
  "[data-uia='player-subtitle-text']",
  ".player-timedtext-text-container",
  ".player-timedtext span",
  ".player-timedtext"
];

const CATALOG_EVENT = "ylang:netflix-subtitle-catalog";
const FETCH_REQUEST_EVENT = "ylang:netflix-subtitle-fetch-request";
const FETCH_RESPONSE_EVENT = "ylang:netflix-subtitle-fetch-response";
const DEBUG_EVENT = "ylang:netflix-subtitle-debug";
const PROBE_EVENT = "ylang:netflix-subtitle-probe";
const PAGE_HOOK_SCRIPT = "assets/netflixPageHook.js";
const PREFERRED_FORMATS = [
  "webvtt-lssdh-ios8",
  "webvtt-lssdh",
  "webvtt",
  "imsc1.1",
  "dfxp-ls-sdh",
  "simplesdh"
];

declare const chrome: {
  runtime: {
    getURL(path: string): string;
  };
};

let latestCatalog: NetflixCatalog | undefined;
let pageHookInjected = false;
let catalogListenerAttached = false;
let debugListenerAttached = false;
let netflixDebug = createInitialNetflixDebugState();

if (isNetflixPage()) {
  ensureNetflixPageHook();
}

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

export async function loadNetflixSubtitleTrack(): Promise<SubtitleTrack | undefined> {
  ensureNetflixPageHook();
  probeNetflixPageHook();

  const catalog = await waitForNetflixCatalog(6500);
  if (!catalog) {
    setNetflixFailure("No subtitle catalog event received from Netflix page hook.");
    return undefined;
  }

  const source = getNetflixSource();
  const tracks = catalog.timedtexttracks ?? catalog.textTracks ?? [];
  if (!tracks.length) {
    setNetflixFailure("Subtitle catalog received, but it contained 0 text tracks.");
    return undefined;
  }

  const track = chooseBestNetflixTrack(tracks);
  const downloadable = track ? getBestDownloadable(track) : undefined;
  if (!track) {
    setNetflixFailure(`Subtitle catalog contained ${tracks.length} tracks, but none looked usable.`);
    return undefined;
  }

  if (!downloadable) {
    setNetflixFailure(
      `Selected track "${getNetflixTrackLabel(track, "unknown")}" had no URL for supported formats: ${PREFERRED_FORMATS.join(", ")}.`
    );
    return undefined;
  }

  const subtitleText = await fetchNetflixSubtitleTextWithFallback(downloadable.url);
  if (!subtitleText) {
    return undefined;
  }

  const sourceId = source.videoId ?? source.url;
  const language = getNetflixTrackLanguage(track);
  const cues = downloadable.kind === "vtt"
    ? parseWebVtt(sourceId, language, subtitleText)
    : parseTtml(sourceId, language, subtitleText);

  if (!cues.length) {
    setNetflixFailure(
      `Fetched ${subtitleText.length} characters from ${downloadable.format}, but parsed 0 timed cues.`
    );
    return undefined;
  }

  netflixDebug.lastFailure = "";
  netflixDebug.lastLoaded = `${cues.length} cues from ${downloadable.format} (${language}).`;

  return {
    id: `netflix-track:${sourceId}:${language}:${downloadable.format}`,
    sourceId,
    sourceUrl: downloadable.url,
    language,
    label: getNetflixTrackLabel(track, downloadable.format),
    cues
  };
}

export function observeNetflixSubtitles(onCue: (cue: SubtitleCue | undefined) => void): () => void {
  ensureNetflixPageHook();

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

export function getNetflixSubtitleDebugStatus(): string {
  return [
    netflixDebug.hookInjected ? "Hook injected." : "Hook not injected.",
    netflixDebug.hookAlive ? "Hook alive." : "No hook-alive confirmation.",
    `Manifest prompts: ${netflixDebug.manifestPromptCount}.`,
    `Catalogs seen: ${netflixDebug.catalogCount}.`,
    netflixDebug.lastCatalogSummary ? `Last catalog: ${netflixDebug.lastCatalogSummary}.` : "No catalog summary.",
    netflixDebug.lastFetchSummary ? `Last fetch: ${netflixDebug.lastFetchSummary}.` : "No subtitle fetch yet.",
    netflixDebug.lastLoaded ? `Loaded: ${netflixDebug.lastLoaded}.` : "",
    netflixDebug.lastFailure ? `Last failure: ${netflixDebug.lastFailure}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function ensureNetflixPageHook(): void {
  attachCatalogListener();
  attachDebugListener();
  if (pageHookInjected || document.documentElement.dataset.ylangNetflixHookInjected === "true") {
    netflixDebug.hookInjected = true;
    return;
  }

  pageHookInjected = true;
  netflixDebug.hookInjected = true;
  document.documentElement.dataset.ylangNetflixHookInjected = "true";

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(PAGE_HOOK_SCRIPT);
  script.async = false;
  script.onload = () => script.remove();
  script.onerror = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function probeNetflixPageHook(): void {
  window.dispatchEvent(new CustomEvent(PROBE_EVENT));
}

function attachCatalogListener(): void {
  if (catalogListenerAttached) {
    return;
  }

  catalogListenerAttached = true;
  window.addEventListener(CATALOG_EVENT, (event) => {
    const catalog = (event as CustomEvent<NetflixCatalog>).detail;
    if (catalog && typeof catalog === "object") {
      latestCatalog = catalog;
      netflixDebug.catalogCount += 1;
      netflixDebug.lastCatalogSummary = summarizeCatalog(catalog);
    }
  });
}

function attachDebugListener(): void {
  if (debugListenerAttached) {
    return;
  }

  debugListenerAttached = true;
  window.addEventListener(DEBUG_EVENT, (event) => {
    const detail = (event as CustomEvent<NetflixDebugEvent>).detail;
    if (!detail || typeof detail !== "object") {
      return;
    }

    if (detail.stage === "hook-installed" || detail.stage === "probe") {
      netflixDebug.hookAlive = true;
    }

    if (detail.stage === "manifest-prepared") {
      netflixDebug.manifestPromptCount += 1;
      netflixDebug.lastManifestSummary = detail.message ?? "";
    }

    if (detail.stage === "catalog-found") {
      netflixDebug.lastCatalogSummary = detail.message ?? netflixDebug.lastCatalogSummary;
    }

    if (detail.stage === "subtitle-fetch-ok" || detail.stage === "subtitle-fetch-error") {
      netflixDebug.lastFetchSummary = detail.message ?? "";
    }
  });
}

async function waitForNetflixCatalog(timeoutMs: number): Promise<NetflixCatalog | undefined> {
  ensureNetflixPageHook();
  if (latestCatalog) {
    return latestCatalog;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (latestCatalog) {
      return latestCatalog;
    }
    await delay(200);
  }

  return latestCatalog;
}

function chooseBestNetflixTrack(tracks: NetflixTextTrack[]): NetflixTextTrack | undefined {
  const usableTracks = tracks.filter((track) => !track.isNoneTrack && !track.isForcedNarrative);
  const guessedLanguage = guessSubtitleLanguage();

  return usableTracks.find((track) => getNetflixTrackLanguage(track) === guessedLanguage) ??
    usableTracks.find((track) => Boolean(getBestDownloadable(track))) ??
    tracks.find((track) => Boolean(getBestDownloadable(track)));
}

function getBestDownloadable(track: NetflixTextTrack): NetflixDownloadChoice | undefined {
  for (const format of PREFERRED_FORMATS) {
    const downloadable = track.ttDownloadables?.[format] ?? track.downloadables?.[format];
    const url = getDownloadableUrl(downloadable);
    if (url) {
      return {
        format,
        url,
        kind: format.startsWith("webvtt") ? "vtt" : "ttml"
      };
    }
  }

  return undefined;
}

function getDownloadableUrl(downloadable: NetflixDownloadable | undefined): string | undefined {
  const directUrl = downloadable?.url;
  if (directUrl) {
    return directUrl;
  }

  const fromDownloadUrls = Object.values(downloadable?.downloadUrls ?? {}).find(Boolean);
  if (fromDownloadUrls) {
    return fromDownloadUrls;
  }

  return downloadable?.urls?.map((entry) => entry.url).find(Boolean);
}

async function fetchNetflixSubtitleText(url: string): Promise<string> {
  const requestId = `ylang-netflix-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Netflix subtitle fetch timed out."));
    }, 8000);

    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<NetflixFetchResponse>).detail;
      if (detail?.requestId !== requestId) {
        return;
      }

      cleanup();
      if (detail.ok && typeof detail.text === "string") {
        resolve(detail.text);
      } else {
        reject(new Error(detail.error ?? "Netflix subtitle fetch failed."));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener(FETCH_RESPONSE_EVENT, onResponse);
    };

    window.addEventListener(FETCH_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(new CustomEvent(FETCH_REQUEST_EVENT, {
      detail: { requestId, url }
    }));
  });
}

async function fetchNetflixSubtitleTextWithFallback(url: string): Promise<string | undefined> {
  try {
    return await fetchNetflixSubtitleText(url);
  } catch (pageError) {
    const pageMessage = formatError(pageError);
    try {
      const text = await extensionFetchText(url);
      netflixDebug.lastFetchSummary = `Page fetch failed (${pageMessage}); extension fetch got ${text.length} characters.`;
      netflixDebug.lastFailure = "";
      return text;
    } catch (extensionError) {
      setNetflixFailure(
        `Subtitle URL fetch failed. Page fetch: ${pageMessage}. Extension fetch: ${formatError(extensionError)}.`
      );
      return undefined;
    }
  }
}

function getNetflixSubtitleText(): string {
  const textGroups = NETFLIX_SUBTITLE_SELECTORS
    .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
    .map((node) => normalizeSubtitleText(node.textContent ?? ""))
    .filter(Boolean);

  return textGroups.sort((a, b) => b.length - a.length)[0] ?? "";
}

function summarizeCatalog(catalog: NetflixCatalog): string {
  const tracks = catalog.timedtexttracks ?? catalog.textTracks ?? [];
  const downloadableCount = tracks.filter((track) => Boolean(getBestDownloadable(track))).length;
  const languages = [...new Set(tracks.map(getNetflixTrackLanguage).filter(Boolean))].slice(0, 8).join(", ");
  return `${tracks.length} tracks, ${downloadableCount} with supported URLs${languages ? `, languages: ${languages}` : ""}`;
}

function setNetflixFailure(message: string): void {
  netflixDebug.lastFailure = message;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createInitialNetflixDebugState(): NetflixDebugState {
  return {
    hookInjected: false,
    hookAlive: false,
    manifestPromptCount: 0,
    catalogCount: 0,
    lastManifestSummary: "",
    lastCatalogSummary: "",
    lastFetchSummary: "",
    lastLoaded: "",
    lastFailure: ""
  };
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

function getNetflixTrackLanguage(track: NetflixTextTrack): SourceLanguage {
  return normalizeLanguageCode(track.bcp47 ?? track.language ?? track.languageDescription);
}

function getNetflixTrackLabel(track: NetflixTextTrack, format: string): string {
  return track.languageDescription ?? track.language ?? track.bcp47 ?? format;
}

function normalizeLanguageCode(language: string | undefined): SourceLanguage {
  const normalized = language?.trim().split("-")[0].toLowerCase();
  return normalized || "auto";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface NetflixCatalog {
  movieId?: string | number;
  videoId?: string | number;
  timedtexttracks?: NetflixTextTrack[];
  textTracks?: NetflixTextTrack[];
}

interface NetflixTextTrack {
  bcp47?: string;
  language?: string;
  languageDescription?: string;
  isForcedNarrative?: boolean;
  isNoneTrack?: boolean;
  ttDownloadables?: Record<string, NetflixDownloadable>;
  downloadables?: Record<string, NetflixDownloadable>;
}

interface NetflixDownloadable {
  url?: string;
  downloadUrls?: Record<string, string>;
  urls?: Array<{ url?: string }>;
}

interface NetflixDownloadChoice {
  format: string;
  url: string;
  kind: "vtt" | "ttml";
}

interface NetflixFetchResponse {
  ok: boolean;
  requestId: string;
  text?: string;
  error?: string;
}

interface NetflixDebugEvent {
  stage:
    | "hook-installed"
    | "probe"
    | "manifest-prepared"
    | "catalog-found"
    | "subtitle-fetch-ok"
    | "subtitle-fetch-error";
  message?: string;
}

interface NetflixDebugState {
  hookInjected: boolean;
  hookAlive: boolean;
  manifestPromptCount: number;
  catalogCount: number;
  lastManifestSummary: string;
  lastCatalogSummary: string;
  lastFetchSummary: string;
  lastLoaded: string;
  lastFailure: string;
}
