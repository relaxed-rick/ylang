import type { PageAdapter } from "./playerAdapter";
import {
  canUseGenericVideoAdapter,
  getGenericSource,
  loadGenericNativeSubtitleTrack,
  observeGenericNativeSubtitles
} from "./genericAdapter";
import {
  getNetflixSource,
  getNetflixSubtitleDebugStatus,
  isNetflixPage,
  loadNetflixSubtitleTrack,
  observeNetflixSubtitles
} from "./netflixAdapter";
import {
  getNrkSource,
  loadNrkSubtitleTrack,
  observeNrkSubtitles
} from "./nrkAdapter";
import {
  getOrfSource,
  isOrfPage,
  observeOrfSubtitles
} from "./orfAdapter";
import {
  getYoutubeSource,
  isYoutubePage,
  observeYoutubeSubtitles
} from "./youtubeAdapter";

export function selectPageAdapter(): PageAdapter {
  return ADAPTERS.find((adapter) => adapter.canAttach()) ?? genericAdapter;
}

const nrkAdapter: PageAdapter = {
  id: "nrk",
  canAttach: () => location.hostname === "tv.nrk.no",
  getSource: getNrkSource,
  loadSubtitleTrack: loadNrkSubtitleTrack,
  observeSubtitles: observeNrkSubtitles,
  renderedFallbackLabel: "Using NRK rendered subtitle fallback.",
  trackLoadedLabel: (track) => `Loaded ${track.cues.length} timed subtitle cues.`
};

const netflixAdapter: PageAdapter = {
  id: "netflix",
  canAttach: isNetflixPage,
  getSource: getNetflixSource,
  loadSubtitleTrack: loadNetflixSubtitleTrack,
  observeSubtitles: observeNetflixSubtitles,
  renderedFallbackLabel: "Using Netflix rendered subtitle fallback.",
  trackLoadedLabel: (track) => `Loaded ${track.cues.length} Netflix timed subtitle cues.`,
  getDebugStatus: getNetflixSubtitleDebugStatus
};

const youtubeAdapter: PageAdapter = {
  id: "youtube",
  canAttach: isYoutubePage,
  getSource: getYoutubeSource,
  observeSubtitles: observeYoutubeSubtitles,
  renderedFallbackLabel: "Using YouTube rendered subtitle fallback."
};

const orfAdapter: PageAdapter = {
  id: "orf",
  canAttach: isOrfPage,
  getSource: getOrfSource,
  observeSubtitles: observeOrfSubtitles,
  renderedFallbackLabel: "Using ORF rendered subtitle fallback."
};

const genericAdapter: PageAdapter = {
  id: "generic",
  canAttach: canUseGenericVideoAdapter,
  getSource: getGenericSource,
  loadSubtitleTrack: loadGenericNativeSubtitleTrack,
  observeSubtitles: observeGenericNativeSubtitles,
  renderedFallbackLabel: "Using generic native subtitle fallback.",
  trackLoadedLabel: (track) => `Loaded ${track.cues.length} native subtitle cues.`
};

const ADAPTERS = [
  nrkAdapter,
  netflixAdapter,
  youtubeAdapter,
  orfAdapter,
  genericAdapter
];
