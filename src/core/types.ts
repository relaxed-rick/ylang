export type SourceLanguage = string;
export type TargetLanguage = string;

export type TranslationProvider = "deepl-web" | "microsoft-translator" | "local-llm" | "bulk-paste";

export type OverlayMode = "augment-native" | "ylang-controlled";

export type DeepLWindowPreset =
  | "custom"
  | "top-left-attached"
  | "top-right-attached"
  | "bottom-right-attached"
  | "bottom-left-attached"
  | "top-left-detached"
  | "top-right-detached"
  | "bottom-right-detached"
  | "bottom-left-detached";

export type PromptTemplateKey =
  | "lineTranslationSystem"
  | "lineTranslationUser"
  | "selectedTranslationSystem"
  | "selectedTranslationUser"
  | "grammarSystem"
  | "grammarUser"
  | "attemptEvaluationSystem"
  | "attemptEvaluationUser";

export type PromptTemplateMap = Partial<Record<PromptTemplateKey, string>>;

export interface YlangSettings {
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  provider: TranslationProvider;
  overlayMode: OverlayMode;
  fontScale: number;
  verticalOffset: number;
  videoModeEnabled: boolean;
  readingModeEnabled: boolean;
  showOriginalLine: boolean;
  showTranslatedLine: boolean;
  transcriptModeEnabled: boolean;
  translateOnPause: boolean;
  retranslateNonScriptOnPause: boolean;
  deepLPinToTop: boolean;
  deepLFocusOnUpdate: boolean;
  deepLWindowPreset: DeepLWindowPreset;
  deepLWindowXPercent: number;
  deepLWindowYPercent: number;
  deepLScreenId: string;
  microsoftTranslatorKey: string;
  microsoftTranslatorRegion: string;
  localLlmEnabled: boolean;
  localLlmBaseUrl: string;
  localLlmModel: string;
  localLlmApiKey: string;
  localLlmLaunchCommand: string;
  localLlmDebugEnabled: boolean;
  llmResultAutoCloseSeconds: number;
  otherResultAutoCloseSeconds: number;
  promptTemplates: PromptTemplateMap;
  videoUiColor: string;
  textUiColor: string;
  favoriteLanguageCodes: string[];
  translateShortcut: string;
  learnShortcut: string;
  grammarShortcut: string;
  selectShortcut: string;
  clearSelectionShortcut: string;
  maxPhraseGapWords: number;
  captureScreenshotOnLearn: boolean;
  captureAudioOnLearn: boolean;
  audioStartBufferMs: number;
  audioEndBufferMs: number;
  ankiDeckPrefix: string;
  ankiDeckLanguageSuffixes: Record<string, string>;
  saveAttemptsEnabled: boolean;
}

export interface SubtitleCue {
  id: string;
  sourceId: string;
  startMs?: number;
  endMs?: number;
  text: string;
  normalizedText: string;
  language: SourceLanguage;
  origin?: "track" | "dom";
}

export interface SubtitleTrack {
  id: string;
  sourceId: string;
  sourceUrl: string;
  language: SourceLanguage;
  label?: string;
  cues: SubtitleCue[];
}

export interface EpisodeScriptSnapshot {
  source: SourceRef;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  capturedAt: string;
  cues: SubtitleCue[];
}

export interface SavedTranscriptIndexItem {
  id: string;
  title?: string;
  url: string;
  sourceKey: string;
  cueCount: number;
  capturedAt: string;
  savedAt: string;
}

export interface SavedTranscriptRecord extends EpisodeScriptSnapshot {
  id: string;
  savedAt: string;
}

export type LearningItemKind = "word" | "phrase" | "sentence" | "grammar" | "attempt";

export interface LearningOccurrence {
  id: string;
  source: SourceRef;
  cueId?: string;
  sentence: string;
  selectedText?: string;
  translation?: string;
  startMs?: number;
  endMs?: number;
  createdAt: string;
}

export interface LearningMediaAttachment {
  id: string;
  type: "image" | "audio";
  mimeType: string;
  dataUrl: string;
  filename: string;
  createdAt: string;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  width?: number;
  height?: number;
}

export interface LearningItem {
  id: string;
  kind: LearningItemKind;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  collectionId?: string;
  text: string;
  normalizedText: string;
  sentence: string;
  translation?: string;
  grammar?: string;
  userAttempt?: string;
  attemptFeedback?: string;
  notes?: string;
  media: LearningMediaAttachment[];
  ankiNoteId?: number;
  ankiUpdatedAt?: string;
  ankiExportHash?: string;
  occurrences: LearningOccurrence[];
  createdAt: string;
  updatedAt: string;
}

export interface LearningItemIndexItem {
  id: string;
  kind: LearningItemKind;
  text: string;
  normalizedText: string;
  sentence: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  collectionId?: string;
  occurrenceCount: number;
  updatedAt: string;
}

export interface SourceRef {
  provider: "nrk" | "netflix" | "youtube" | "generic";
  url: string;
  title?: string;
  programId?: string;
  videoId?: string;
}

export interface TranslationRecord {
  cacheKey: string;
  source: SourceRef;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  originalText: string;
  translatedText: string;
  provider: TranslationProvider;
  createdAt: string;
  updatedAt: string;
}

export interface SelectionTranslationHint {
  sourceText: string;
  translatedText: string;
  provider: TranslationProvider;
  createdAt: string;
}
