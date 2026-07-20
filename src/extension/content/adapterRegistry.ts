import type { PageAdapter } from "./playerAdapter";
import {
  canUseGenericVideoAdapter,
  getGenericSource,
  loadGenericNativeSubtitleTrack,
  observeGenericNativeSubtitles
} from "./genericAdapter";
import {
  getNetflixSource,
  isNetflixPage,
  observeNetflixSubtitles
} from "./netflixAdapter";
import {
  getNrkSource,
  loadNrkSubtitleTrack,
  observeNrkSubtitles
} from "./nrkAdapter";
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
  observeSubtitles: observeNetflixSubtitles,
  renderedFallbackLabel: "Using Netflix rendered subtitle fallback."
};

const youtubeAdapter: PageAdapter = {
  id: "youtube",
  canAttach: isYoutubePage,
  getSource: getYoutubeSource,
  observeSubtitles: observeYoutubeSubtitles,
  renderedFallbackLabel: "Using YouTube rendered subtitle fallback."
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
  genericAdapter
];
