const CATALOG_EVENT = "ylang:netflix-subtitle-catalog";
const FETCH_REQUEST_EVENT = "ylang:netflix-subtitle-fetch-request";
const FETCH_RESPONSE_EVENT = "ylang:netflix-subtitle-fetch-response";
const DEBUG_EVENT = "ylang:netflix-subtitle-debug";
const PROBE_EVENT = "ylang:netflix-subtitle-probe";
const NETFLIX_MANIFEST_PATTERN = /manifest|licensedManifest/iu;
const NETFLIX_SUBTITLE_PROFILES = [
  "webvtt-lssdh-ios8",
  "webvtt-lssdh",
  "webvtt",
  "imsc1.1",
  "dfxp-ls-sdh",
  "simplesdh"
];

type NetflixHookWindow = Window & {
  __ylangNetflixHookInstalled?: boolean;
};

type NetflixXhr = XMLHttpRequest & {
  __ylangNetflixUrl?: string;
};

const pageWindow = window as NetflixHookWindow;

if (!pageWindow.__ylangNetflixHookInstalled) {
  pageWindow.__ylangNetflixHookInstalled = true;
  installNetflixSubtitleHook();
}

function installNetflixSubtitleHook(): void {
  dispatchDebug("hook-installed", "Netflix page hook installed.");

  const originalJsonParse = JSON.parse.bind(JSON);
  const originalJsonStringify = JSON.stringify.bind(JSON);
  JSON.parse = ((text: string, reviver?: Parameters<JSON["parse"]>[1]) => {
    const data = originalJsonParse(text, reviver);
    publishSubtitleCatalog(data);
    return data;
  }) as JSON["parse"];

  JSON.stringify = ((data: unknown, replacer?: Parameters<JSON["stringify"]>[1], space?: Parameters<JSON["stringify"]>[2]) => {
    prepareManifestRequest(data);
    return originalJsonStringify(data, replacer, space);
  }) as JSON["stringify"];

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    const url = getFetchUrl(args[0]);
    if (shouldInspectResponse(url, response)) {
      void inspectFetchResponse(response.clone(), originalJsonParse);
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(
    this: NetflixXhr,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ): void {
    this.__ylangNetflixUrl = String(url);
    this.addEventListener("load", () => {
      if (shouldInspectXhr(this)) {
        inspectXhrResponse(this, originalJsonParse);
      }
    }, { once: true });

    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  window.addEventListener(FETCH_REQUEST_EVENT, (event) => {
    const detail = (event as CustomEvent<FetchRequestDetail>).detail;
    if (!detail?.requestId || !detail.url) {
      return;
    }

    void fetchSubtitleText(detail.requestId, detail.url);
  });

  window.addEventListener(PROBE_EVENT, () => {
    dispatchDebug("probe", "Netflix page hook is alive.");
  });
}

function prepareManifestRequest(data: unknown): void {
  if (!data || typeof data !== "object") {
    return;
  }

  const url = (data as { url?: unknown }).url;
  if (typeof url !== "string" || !NETFLIX_MANIFEST_PATTERN.test(url)) {
    return;
  }

  for (const value of Object.values(data)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const candidate = value as {
      profiles?: unknown;
      showAllSubDubTracks?: unknown;
    };
    if (Array.isArray(candidate.profiles)) {
      let addedProfiles = 0;
      for (const profile of NETFLIX_SUBTITLE_PROFILES) {
        if (!candidate.profiles.includes(profile)) {
          candidate.profiles.unshift(profile);
          addedProfiles += 1;
        }
      }
      if (addedProfiles > 0) {
        dispatchDebug(
          "manifest-prepared",
          `Added ${addedProfiles} subtitle profiles to Netflix manifest request.`
        );
      }
    }

    if (typeof candidate.showAllSubDubTracks === "boolean") {
      candidate.showAllSubDubTracks = true;
      dispatchDebug("manifest-prepared", "Enabled showAllSubDubTracks on Netflix manifest request.");
    }
  }
}

async function inspectFetchResponse(
  response: Response,
  parseJson: (text: string) => unknown
): Promise<void> {
  try {
    publishSubtitleCatalog(parseJson(await response.text()));
  } catch {
    // Not all Netflix responses are JSON; ignore quietly and keep the player untouched.
  }
}

function inspectXhrResponse(xhr: XMLHttpRequest, parseJson: (text: string) => unknown): void {
  try {
    if (typeof xhr.response === "string") {
      publishSubtitleCatalog(parseJson(xhr.response));
      return;
    }

    if (xhr.response && typeof xhr.response === "object") {
      publishSubtitleCatalog(xhr.response);
    }
  } catch {
    // Not all inspected XHR responses are JSON.
  }
}

function shouldInspectResponse(url: string, response: Response): boolean {
  return isLikelyNetflixMetadataUrl(url) || (response.headers.get("content-type") ?? "").includes("json");
}

function shouldInspectXhr(xhr: NetflixXhr): boolean {
  return isLikelyNetflixMetadataUrl(xhr.__ylangNetflixUrl ?? "") ||
    (xhr.getResponseHeader("content-type") ?? "").includes("json");
}

function isLikelyNetflixMetadataUrl(url: string): boolean {
  return /manifest|licensedManifest|metadata|pathEvaluator|cadmium|player/iu.test(url);
}

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

async function fetchSubtitleText(requestId: string, url: string): Promise<void> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    dispatchDebug("subtitle-fetch-ok", `Fetched ${text.length} subtitle characters.`);
    window.dispatchEvent(new CustomEvent(FETCH_RESPONSE_EVENT, {
      detail: { ok: true, requestId, text } satisfies FetchResponseDetail
    }));
  } catch (error) {
    dispatchDebug("subtitle-fetch-error", error instanceof Error ? error.message : "Netflix subtitle fetch failed.");
    window.dispatchEvent(new CustomEvent(FETCH_RESPONSE_EVENT, {
      detail: {
        ok: false,
        requestId,
        error: error instanceof Error ? error.message : "Netflix subtitle fetch failed."
      } satisfies FetchResponseDetail
    }));
  }
}

function publishSubtitleCatalog(data: unknown): void {
  for (const result of findSubtitleCatalogs(data)) {
    const trackCount = result.timedtexttracks?.length ?? result.textTracks?.length ?? 0;
    dispatchDebug("catalog-found", `Found Netflix subtitle catalog with ${trackCount} tracks.`);
    window.dispatchEvent(new CustomEvent(CATALOG_EVENT, {
      detail: {
        movieId: result.movieId ?? result.videoId,
        timedtexttracks: result.timedtexttracks,
        textTracks: result.textTracks
      } satisfies NetflixCatalogDetail
    }));
  }
}

function dispatchDebug(stage: NetflixDebugEvent["stage"], message: string): void {
  window.dispatchEvent(new CustomEvent(DEBUG_EVENT, {
    detail: { stage, message } satisfies NetflixDebugEvent
  }));
}

function findSubtitleCatalogs(data: unknown, depth = 0): Array<Partial<NetflixCatalogDetail>> {
  if (depth > 8 || !data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;
  const catalogs: Array<Partial<NetflixCatalogDetail>> = [];

  if (Array.isArray(record.timedtexttracks) || Array.isArray(record.textTracks)) {
    catalogs.push(record as Partial<NetflixCatalogDetail>);
  }

  const result = unwrapResult(record);
  if (result && result !== record && (Array.isArray(result.timedtexttracks) || Array.isArray(result.textTracks))) {
    catalogs.push(result);
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      catalogs.push(...findSubtitleCatalogs(value, depth + 1));
    }
  }

  return catalogs;
}

function unwrapResult(data: Record<string, unknown>): Partial<NetflixCatalogDetail> | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const result = data.result;
  if (result && typeof result === "object") {
    return result as Partial<NetflixCatalogDetail>;
  }

  return data as Partial<NetflixCatalogDetail>;
}

interface FetchRequestDetail {
  requestId: string;
  url: string;
}

interface FetchResponseDetail {
  ok: boolean;
  requestId: string;
  text?: string;
  error?: string;
}

interface NetflixCatalogDetail {
  movieId?: string | number;
  videoId?: string | number;
  timedtexttracks?: unknown[];
  textTracks?: unknown[];
}

interface NetflixDebugEvent {
  stage:
    | "hook-installed"
    | "probe"
    | "manifest-prepared"
    | "catalog-found"
    | "subtitle-fetch-ok"
    | "subtitle-fetch-error";
  message: string;
}
