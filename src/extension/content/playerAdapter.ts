import type { SourceRef, SubtitleCue, SubtitleTrack } from "../../core/types";

export interface PageAdapter {
  id: string;
  canAttach(): boolean;
  getSource(): SourceRef;
  loadSubtitleTrack?(): Promise<SubtitleTrack | undefined>;
  observeSubtitles(onCue: (cue: SubtitleCue | undefined) => void): () => void;
  renderedFallbackLabel?: string;
  trackLoadedLabel?(track: SubtitleTrack): string;
  getDebugStatus?(): string | undefined;
}
