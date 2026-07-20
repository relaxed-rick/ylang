import type {
  EpisodeScriptSnapshot,
  LearningItem,
  LearningItemIndexItem,
  LearningItemKind,
  LearningOccurrence,
  SavedTranscriptIndexItem,
  SavedTranscriptRecord,
  SelectionTranslationHint,
  SourceRef,
  SourceLanguage,
  TargetLanguage,
  TranslationRecord,
  YlangSettings
} from "../../core/types";

declare const chrome: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  };
};

const SETTINGS_KEY = "ylang:settings";
const SAVED_TRANSCRIPT_INDEX_KEY = "ylang:saved-transcripts:index";
const LEARNING_INDEX_KEY = "ylang:learning-items:index";

const defaultSettings: YlangSettings = {
  sourceLanguage: "nb",
  targetLanguage: "en",
  provider: "deepl-web",
  overlayMode: "ylang-controlled",
  fontScale: 1,
  verticalOffset: 0,
  videoModeEnabled: true,
  readingModeEnabled: false,
  showOriginalLine: true,
  showTranslatedLine: true,
  transcriptModeEnabled: false,
  translateOnPause: false,
  retranslateNonScriptOnPause: false,
  deepLPinToTop: true,
  deepLFocusOnUpdate: true,
  deepLWindowPreset: "top-left-detached",
  deepLWindowXPercent: 5,
  deepLWindowYPercent: 5,
  deepLScreenId: "primary",
  microsoftTranslatorKey: "",
  microsoftTranslatorRegion: "",
  localLlmEnabled: false,
  localLlmBaseUrl: "http://127.0.0.1:11434/v1",
  localLlmModel: "",
  localLlmApiKey: "",
  localLlmLaunchCommand: "",
  localLlmDebugEnabled: false,
  llmResultAutoCloseSeconds: 10,
  otherResultAutoCloseSeconds: 0,
  promptTemplates: {},
  videoUiColor: "#f4c461",
  textUiColor: "#f4c461",
  favoriteLanguageCodes: ["en-GB", "de", "fr", "nb"],
  translateShortcut: "t",
  learnShortcut: "l",
  grammarShortcut: "g",
  selectShortcut: "Space",
  clearSelectionShortcut: "d",
  maxPhraseGapWords: 2,
  captureScreenshotOnLearn: false,
  captureAudioOnLearn: false,
  audioStartBufferMs: 250,
  audioEndBufferMs: 900,
  ankiDeckPrefix: "ylang",
  ankiDeckLanguageSuffixes: {},
  saveAttemptsEnabled: true
};

export async function getContentSettings(): Promise<YlangSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const storedSettings = (stored[SETTINGS_KEY] as (Partial<YlangSettings> & { ankiDeckName?: string }) | undefined) ?? {};
  const settings = {
    ...defaultSettings,
    ...storedSettings
  };
  return {
    ...settings,
    sourceLanguage: normalizeLanguage(settings.sourceLanguage),
    targetLanguage: normalizeLanguage(settings.targetLanguage),
    provider: normalizeProvider(settings.provider),
    deepLWindowPreset: normalizeDeepLWindowPreset(settings.deepLWindowPreset),
    deepLWindowXPercent: normalizePercent(settings.deepLWindowXPercent, defaultSettings.deepLWindowXPercent),
    deepLWindowYPercent: normalizePercent(settings.deepLWindowYPercent, defaultSettings.deepLWindowYPercent),
    deepLScreenId: normalizeScreenId(settings.deepLScreenId),
    ankiDeckPrefix: normalizeAnkiDeckPrefix(settings.ankiDeckPrefix ?? storedSettings.ankiDeckName),
    ankiDeckLanguageSuffixes: normalizeAnkiDeckLanguageSuffixes(settings.ankiDeckLanguageSuffixes)
  };
}

function normalizeProvider(provider: unknown): YlangSettings["provider"] {
  return provider === "microsoft-translator" || provider === "local-llm"
    ? provider
    : "deepl-web";
}

function normalizeLanguage(language: string): string {
  return language === "no" ? "nb" : language;
}

function normalizeDeepLWindowPreset(preset: unknown): YlangSettings["deepLWindowPreset"] {
  return preset === "custom" ||
    preset === "top-left-attached" ||
    preset === "top-right-attached" ||
    preset === "bottom-right-attached" ||
    preset === "bottom-left-attached" ||
    preset === "top-left-detached" ||
    preset === "top-right-detached" ||
    preset === "bottom-right-detached" ||
    preset === "bottom-left-detached"
    ? preset
    : defaultSettings.deepLWindowPreset;
}

function normalizePercent(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : fallback;
}

function normalizeScreenId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "primary";
}

function normalizeAnkiDeckPrefix(deckPrefix: string | undefined): string {
  const normalized = deckPrefix?.replace(/\s+/g, " ").trim();
  return normalized || defaultSettings.ankiDeckPrefix;
}

function normalizeAnkiDeckLanguageSuffixes(suffixes: unknown): Record<string, string> {
  if (!suffixes || typeof suffixes !== "object" || Array.isArray(suffixes)) {
    return {};
  }

  return Object.fromEntries(Object.entries(suffixes)
    .map(([language, suffix]) => [language, typeof suffix === "string" ? suffix.replace(/\s+/g, " ").trim() : ""])
    .filter(([, suffix]) => Boolean(suffix)));
}

export async function createContentTranslationCacheKey(
  source: SourceRef,
  normalizedText: string,
  targetLanguage: TargetLanguage
): Promise<string> {
  const sourceKey = source.programId ?? source.videoId ?? source.url;
  const hash = await sha256(`${source.provider}:${sourceKey}:${targetLanguage}:${normalizedText}`);
  return `ylang:translation:${hash}`;
}

export async function getContentTranslation(cacheKey: string): Promise<TranslationRecord | undefined> {
  const stored = await chrome.storage.local.get(cacheKey);
  return stored[cacheKey] as TranslationRecord | undefined;
}

export async function saveContentTranslation(record: TranslationRecord): Promise<void> {
  await chrome.storage.local.set({ [record.cacheKey]: record });
}

export async function getSelectionTranslationHints(
  source: SourceRef,
  sentence: string,
  targetLanguage: TargetLanguage
): Promise<SelectionTranslationHint[]> {
  const key = await createSelectionHintKey(source, sentence, targetLanguage);
  const stored = await chrome.storage.local.get(key);
  return (stored[key] as SelectionTranslationHint[] | undefined) ?? [];
}

export async function saveSelectionTranslationHint(
  source: SourceRef,
  sentence: string,
  targetLanguage: TargetLanguage,
  hint: SelectionTranslationHint
): Promise<void> {
  const key = await createSelectionHintKey(source, sentence, targetLanguage);
  const existing = await getSelectionTranslationHints(source, sentence, targetLanguage);
  const normalized = normalizeLearningText(hint.sourceText);
  const next = [
    hint,
    ...existing.filter((candidate) => normalizeLearningText(candidate.sourceText) !== normalized)
  ].slice(0, 80);
  await chrome.storage.local.set({ [key]: next });
}

export async function saveEpisodeTranscript(snapshot: EpisodeScriptSnapshot): Promise<SavedTranscriptRecord> {
  const id = await createTranscriptId(snapshot.source);
  const savedAt = new Date().toISOString();
  const record: SavedTranscriptRecord = {
    ...snapshot,
    id,
    savedAt
  };
  const index = await getSavedTranscriptIndex();
  const item: SavedTranscriptIndexItem = {
    id,
    title: snapshot.source.title,
    url: snapshot.source.url,
    sourceKey: getSourceKey(snapshot.source),
    cueCount: snapshot.cues.length,
    capturedAt: snapshot.capturedAt,
    savedAt
  };
  const nextIndex = [item, ...index.filter((candidate) => candidate.id !== id)];
  await chrome.storage.local.set({
    [createSavedTranscriptKey(id)]: record,
    [SAVED_TRANSCRIPT_INDEX_KEY]: nextIndex
  });
  return record;
}

export async function deleteEpisodeTranscript(source: SourceRef): Promise<boolean> {
  const id = await createTranscriptId(source);
  const index = await getSavedTranscriptIndex();
  const nextIndex = index.filter((candidate) => candidate.id !== id);
  await chrome.storage.local.remove(createSavedTranscriptKey(id));
  await chrome.storage.local.set({ [SAVED_TRANSCRIPT_INDEX_KEY]: nextIndex });
  return nextIndex.length !== index.length;
}

export async function hasSavedEpisodeTranscript(source: SourceRef): Promise<boolean> {
  const id = await createTranscriptId(source);
  const index = await getSavedTranscriptIndex();
  return index.some((candidate) => candidate.id === id);
}

export type SaveLearningItemInput = {
  kind: LearningItemKind;
  source: SourceRef;
  cueId?: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  text: string;
  sentence: string;
  selectedText?: string;
  translation?: string;
  grammar?: string;
  userAttempt?: string;
  attemptFeedback?: string;
  notes?: string;
  media?: LearningItem["media"];
  startMs?: number;
  endMs?: number;
};

export async function createLearningItemId(input: {
  kind: LearningItemKind;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  text: string;
}): Promise<string> {
  return sha256(
    `${input.kind}:${input.sourceLanguage}:${input.targetLanguage}:${normalizeLearningText(input.text)}`
  );
}

export async function hasLearningItem(input: {
  kind: LearningItemKind;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  text: string;
}): Promise<boolean> {
  const id = await createLearningItemId(input);
  const index = await getLearningItemIndex();
  return index.some((item) => item.id === id);
}

export async function getLearningItem(id: string): Promise<LearningItem | undefined> {
  const stored = await chrome.storage.local.get(createLearningItemKey(id));
  return stored[createLearningItemKey(id)] as LearningItem | undefined;
}

export async function saveLearningItem(input: SaveLearningItemInput): Promise<LearningItem> {
  const id = await createLearningItemId(input);
  const existing = await getLearningItem(id);
  const now = new Date().toISOString();
  const occurrence = createLearningOccurrence(input, now);
  const item: LearningItem = {
    id,
    kind: input.kind,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    collectionId: existing?.collectionId ?? createDefaultLearningCollectionId(input.sourceLanguage),
    text: input.text,
    normalizedText: normalizeLearningText(input.text),
    sentence: input.sentence,
    translation: input.translation ?? existing?.translation,
    grammar: input.grammar ?? existing?.grammar,
    userAttempt: input.userAttempt ?? existing?.userAttempt,
    attemptFeedback: input.attemptFeedback ?? existing?.attemptFeedback,
    notes: input.notes ?? existing?.notes,
    media: mergeLearningMedia(existing?.media ?? [], input.media ?? []),
    ankiNoteId: existing?.ankiNoteId,
    ankiUpdatedAt: existing?.ankiUpdatedAt,
    ankiExportHash: existing?.ankiExportHash,
    occurrences: mergeLearningOccurrence(existing?.occurrences ?? [], occurrence),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await persistLearningItem(item);
  return item;
}

export async function deleteLearningItem(id: string): Promise<boolean> {
  const index = await getLearningItemIndex();
  const nextIndex = index.filter((item) => item.id !== id);
  await chrome.storage.local.remove(createLearningItemKey(id));
  await chrome.storage.local.set({ [LEARNING_INDEX_KEY]: nextIndex });
  return nextIndex.length !== index.length;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function getSavedTranscriptIndex(): Promise<SavedTranscriptIndexItem[]> {
  const stored = await chrome.storage.local.get(SAVED_TRANSCRIPT_INDEX_KEY);
  return (stored[SAVED_TRANSCRIPT_INDEX_KEY] as SavedTranscriptIndexItem[] | undefined) ?? [];
}

async function getLearningItemIndex(): Promise<LearningItemIndexItem[]> {
  const stored = await chrome.storage.local.get(LEARNING_INDEX_KEY);
  return (stored[LEARNING_INDEX_KEY] as LearningItemIndexItem[] | undefined) ?? [];
}

async function createTranscriptId(source: SourceRef): Promise<string> {
  return sha256(`${source.provider}:${getSourceKey(source)}`);
}

function getSourceKey(source: SourceRef): string {
  return source.programId ?? source.videoId ?? source.url;
}

function createSavedTranscriptKey(id: string): string {
  return `ylang:saved-transcript:${id}`;
}

async function createSelectionHintKey(
  source: SourceRef,
  sentence: string,
  targetLanguage: TargetLanguage
): Promise<string> {
  return `ylang:selection-hints:${await sha256(`${source.provider}:${getSourceKey(source)}:${targetLanguage}:${sentence}`)}`;
}

function createLearningItemKey(id: string): string {
  return `ylang:learning-item:${id}`;
}

async function persistLearningItem(item: LearningItem): Promise<void> {
  const index = await getLearningItemIndex();
  const nextIndex = [
    createLearningIndexItem(item),
    ...index.filter((candidate) => candidate.id !== item.id)
  ];
  await chrome.storage.local.set({
    [createLearningItemKey(item.id)]: item,
    [LEARNING_INDEX_KEY]: nextIndex
  });
}

function createLearningOccurrence(input: SaveLearningItemInput, createdAt: string): LearningOccurrence {
  const occurrenceId = [
    getSourceKey(input.source),
    input.cueId ?? "",
    input.startMs ?? "",
    input.endMs ?? "",
    normalizeLearningText(input.selectedText ?? input.sentence)
  ].join(":");
  return {
    id: occurrenceId,
    source: input.source,
    cueId: input.cueId,
    sentence: input.sentence,
    selectedText: input.selectedText,
    translation: input.translation,
    startMs: input.startMs,
    endMs: input.endMs,
    createdAt
  };
}

function mergeLearningOccurrence(
  occurrences: LearningOccurrence[],
  occurrence: LearningOccurrence
): LearningOccurrence[] {
  const index = occurrences.findIndex((candidate) => candidate.id === occurrence.id);
  if (index < 0) {
    return [occurrence, ...occurrences];
  }

  const next = [...occurrences];
  next[index] = {
    ...next[index],
    translation: occurrence.translation ?? next[index].translation
  };
  return next;
}

function mergeLearningMedia(
  existing: LearningItem["media"],
  incoming: LearningItem["media"]
): LearningItem["media"] {
  const next = [...existing];
  for (const attachment of incoming) {
    if (!next.some((candidate) => candidate.id === attachment.id)) {
      next.push(attachment);
    }
  }

  return next.slice(-6);
}

function createLearningIndexItem(item: LearningItem): LearningItemIndexItem {
  return {
    id: item.id,
    kind: item.kind,
    text: item.text,
    normalizedText: item.normalizedText,
    sentence: item.sentence,
    sourceLanguage: item.sourceLanguage,
    targetLanguage: item.targetLanguage,
    collectionId: item.collectionId,
    occurrenceCount: item.occurrences.length,
    updatedAt: item.updatedAt
  };
}

function normalizeLearningText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function createDefaultLearningCollectionId(sourceLanguage: string): string {
  return `source:${encodeURIComponent(sourceLanguage)}`;
}
