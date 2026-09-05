import type {
  EpisodeScriptSnapshot,
  LearningItemKind,
  SelectionTranslationHint,
  SourceRef,
  SubtitleCue,
  SubtitleTrack,
  TranslationProvider,
  TranslationRecord,
  YlangSettings
} from "../../core/types";
import {
  createContentTranslationCacheKey,
  createLearningItemId,
  getContentSettings,
  getContentTranslation,
  getSelectionTranslationHints,
  deleteEpisodeTranscript,
  deleteLearningItem,
  hasLearningItem,
  hasSavedEpisodeTranscript,
  saveContentTranslation,
  saveLearningItem,
  saveSelectionTranslationHint,
  type SaveLearningItemInput,
  saveEpisodeTranscript
} from "./storage";
import {
  observeTimedSubtitleTrack
} from "./nrkAdapter";
import { selectPageAdapter } from "./adapterRegistry";
import type { PageAdapter } from "./playerAdapter";
import { clearOverlayWordSelection, mountOverlay, unmountOverlay } from "./overlay";

declare const chrome: {
  runtime: {
    openOptionsPage(): void;
    sendMessage(message: unknown): Promise<unknown>;
    connect(connectInfo: { name: string }): RuntimePort;
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    };
  };
  storage: {
    local: {
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: {
      addListener(callback: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void): void;
    };
  };
};

type RuntimePort = {
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
  };
  postMessage(message: unknown): void;
  disconnect(): void;
};

type LlmStreamMessage = {
  type?: "replace" | "done" | "error";
  text?: string;
  error?: string;
};

const SETTINGS_KEY = "ylang:settings";
const LOCAL_LLM_LOADING_MESSAGE = "Waiting for local LLM...";

let settings: YlangSettings;
let currentCue: SubtitleCue | undefined;
let currentTranslation: TranslationRecord | undefined;
let currentTrack: SubtitleTrack | undefined;
let selectionTranslationHints: SelectionTranslationHint[] = [];
let episodeStatus = "";
let transcriptSaved = false;
let lastPauseTranslatedText = "";
let currentSelectedText: string | undefined;
let currentSelectionLearned = false;
let pendingResultLearningInput: SaveLearningItemInput | undefined;
let resultBubble: { title: string; body: string; learnActionLabel?: string } | undefined;
let resultBubbleTimer: number | undefined;
let stopSubtitleSource: (() => void) | undefined;
let subtitleSourceGeneration = 0;
let subtitleRestartTimer: number | undefined;
let lastSourceKey = "";
let currentAdapter: PageAdapter;

async function start(): Promise<void> {
  ignoreExpectedExtensionInvalidationErrors();
  settings = await getContentSettings();
  currentAdapter = selectPageAdapter();

  document.addEventListener("keydown", handleKeyboardShortcut, true);
  observeRuntimeMessages();
  observeSettingsChanges();
  observeVideoPause();
  observeSourceNavigationChanges();
  await startSubtitleSource();
}

function ignoreExpectedExtensionInvalidationErrors(): void {
  window.addEventListener("unhandledrejection", (event) => {
    if (isExtensionContextInvalidatedError(event.reason)) {
      event.preventDefault();
      unmountOverlay();
    }
  });
}

function isExtensionContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

async function startSubtitleSource(): Promise<void> {
  const generation = ++subtitleSourceGeneration;
  stopSubtitleSource?.();
  stopSubtitleSource = undefined;
  currentAdapter = selectPageAdapter();
  lastSourceKey = getCurrentSourceKey();
  resetSubtitleState();

  const track = await tryLoadTimedTrack();
  if (generation !== subtitleSourceGeneration) {
    return;
  }

  if (track) {
    currentTrack = track;
    void refreshTranscriptSavedState();
    stopSubtitleSource = observeTimedSubtitleTrack(track, (cue) => {
      void handleCue(cue);
    });
    showToast(currentAdapter.trackLoadedLabel?.(track) ?? `Loaded ${track.cues.length} subtitle cues.`);
    render();
    return;
  }

  stopSubtitleSource = currentAdapter.observeSubtitles((cue) => {
    void handleCue(cue);
  });
  showToast(currentAdapter.renderedFallbackLabel ?? "Using rendered subtitle fallback.");
  render();
}

async function tryLoadTimedTrack(): Promise<SubtitleTrack | undefined> {
  if (!currentAdapter.loadSubtitleTrack) {
    return undefined;
  }

  const deadline = Date.now() + 8000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const track = await currentAdapter.loadSubtitleTrack();
      if (track) {
        return track;
      }
    } catch (error) {
      lastError = error;
      break;
    }

    await delay(250);
  }

  if (lastError) {
    console.info("ylang could not load subtitle track; falling back to rendered subtitles.", lastError);
  }

  return undefined;
}

function getCurrentSource(): SourceRef {
  currentAdapter = currentAdapter ?? selectPageAdapter();
  return currentAdapter.getSource();
}

function getCurrentSourceKey(): string {
  const source = getCurrentSource();
  return `${source.provider}:${source.programId ?? source.videoId ?? source.url}`;
}

function resetSubtitleState(): void {
  currentCue = undefined;
  currentTranslation = undefined;
  currentTrack = undefined;
  selectionTranslationHints = [];
  episodeStatus = "";
  transcriptSaved = false;
  lastPauseTranslatedText = "";
  currentSelectedText = undefined;
  currentSelectionLearned = false;
  pendingResultLearningInput = undefined;
  clearResultBubble();
  clearOverlayWordSelection();
  render();
}

function observeSourceNavigationChanges(): void {
  const check = () => {
    const nextSourceKey = getCurrentSourceKey();
    if (!nextSourceKey || nextSourceKey === lastSourceKey) {
      return;
    }

    lastSourceKey = nextSourceKey;
    scheduleSubtitleSourceRestart();
  };

  window.addEventListener("popstate", check);

  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["src", "href"],
    childList: true,
    subtree: true
  });

  window.setInterval(check, 1000);
}

function scheduleSubtitleSourceRestart(): void {
  if (subtitleRestartTimer) {
    window.clearTimeout(subtitleRestartTimer);
  }

  subtitleRestartTimer = window.setTimeout(() => {
    subtitleRestartTimer = undefined;
    void startSubtitleSource().catch((error: unknown) => {
      console.warn("ylang could not restart subtitle source after navigation.", error);
      startRenderedSubtitleFallback();
    });
  }, 350);
}

async function handleCue(cue: SubtitleCue | undefined): Promise<void> {
  currentCue = cue;
  if (!settings.videoModeEnabled) {
    unmountOverlay();
    return;
  }

  if (!cue) {
    currentTranslation = undefined;
    currentSelectedText = undefined;
    currentSelectionLearned = false;
    selectionTranslationHints = [];
    render();
    return;
  }

  currentSelectedText = undefined;
  const source = getCurrentSource();
  const cacheKey = await createContentTranslationCacheKey(source, cue.normalizedText, settings.targetLanguage);
  currentTranslation = await getContentTranslation(cacheKey);
  selectionTranslationHints = await getSelectionTranslationHints(source, cue.normalizedText, settings.targetLanguage);
  await refreshCurrentLearningState();
  render();
}

function render(): void {
  if (!settings.videoModeEnabled) {
    unmountOverlay();
    return;
  }

  mountOverlay({
    cue: currentCue,
    translation: currentTranslation,
    settings,
    episodeLineCount: currentTrack?.cues.length ?? 0,
    episodeStatus,
    transcriptSaved,
    currentSelectionLearned,
    canUseLocalLlm: isLocalLlmReady(),
    selectionTranslationHints,
    getEpisodeScriptText: formatCurrentEpisodeScript,
    onFetchEpisodeTranscript: () => {
      runOverlayAction(fetchCurrentEpisodeTranscript);
    },
    onCopyEpisodeScript: () => {
      runOverlayAction(copyCurrentEpisodeScript);
    },
    onSaveEpisodeTranscript: () => {
      runOverlayAction(saveCurrentEpisodeTranscript);
    },
    onDeleteSavedTranscript: () => {
      runOverlayAction(deleteCurrentEpisodeTranscript);
    },
    onImportEpisodeTranslation: (translatedText) => {
      runOverlayAction(() => importEpisodeTranslation(translatedText));
    },
    onExplainGrammar: (cue, selectedText) => {
      runOverlayAction(() => explainGrammar(cue, selectedText));
    },
    onSelectionChanged: (selectedText) => {
      currentSelectedText = selectedText;
      runOverlayAction(refreshCurrentLearningState);
    },
    onToggleLearn: (cue, selectedText) => {
      runOverlayAction(() => toggleLearningItem(cue, selectedText));
    },
    onAttemptTranslation: (cue) => {
      runOverlayAction(() => attemptTranslation(cue));
    },
    onSaveResultAsLearningItem: () => {
      runOverlayAction(savePendingResultLearningItem);
    },
    onUpdateSettings: (nextSettings) => {
      runOverlayAction(() => updateSettings(nextSettings));
    },
    onCloseResultBubble: () => {
      clearResultBubble();
    },
    onTranslate: (cue, selectedText) => {
      runOverlayAction(() => translateCue(cue, selectedText));
    },
    onOpenOptions: () => {
      try {
        chrome.runtime.openOptionsPage();
      } catch (error) {
        handleActionError(error, "Extension was reloaded. Refresh this tab.");
      }
    },
    resultBubble
  });
}

function runOverlayAction(action: () => Promise<void>): void {
  void action().catch((error: unknown) => {
    handleActionError(error, "Action failed.");
  });
}

function handleActionError(error: unknown, fallbackMessage: string): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Extension context invalidated")) {
    showToast("Extension was reloaded. Refresh this video tab.");
    return;
  }

  console.warn("ylang action failed", error);
  showToast(fallbackMessage);
}

async function translateCue(cue: SubtitleCue, selectedText?: string): Promise<void> {
  const textToTranslate = selectedText?.trim() || cue.normalizedText;

  if (settings.provider === "deepl-web") {
    if (!selectedText) {
      await translateFullCueWithDeepL(cue);
      return;
    }

    const translatedText = await updateDeepLWindow(textToTranslate);
    if (translatedText) {
      await saveSelectedTranslation(cue, textToTranslate, translatedText, "deepl-web");
      showToast("Saved selected DeepL translation.");
    } else {
      showToast("Sent selected words to DeepL.");
    }
    return;
  }

  if (settings.provider === "microsoft-translator") {
    if (selectedText) {
      let translatedText: string | undefined;
      try {
        translatedText = await translateTextWithProvider(textToTranslate, settings.provider);
      } catch (error) {
        await openDeepLFallback(textToTranslate);
        showToast(`Automatic translation failed; opened DeepL fallback. ${formatErrorMessage(error)}`);
        return;
      }
      if (translatedText) {
        await saveSelectedTranslation(cue, textToTranslate, translatedText, settings.provider);
        showToast(translatedText);
      } else {
        showToast("Sent selected words to DeepL fallback.");
      }
      return;
    }

    const translated = await translateAndCacheCueWithFallback(cue, settings.provider, {
      allowReplaceNonScript: true
    });
    showToast(translated ? "Translated current subtitle." : "Current subtitle already has a saved translation.");
    return;
  }

  if (settings.provider === "local-llm") {
    if (!isLocalLlmReady()) {
      showLocalLlmNotConfigured("Translation");
      return;
    }

    if (selectedText) {
      await translateSelectedTextWithLocalLlm(cue, selectedText);
      return;
    }

    const translated = await translateAndCacheCueWithFallback(cue, settings.provider, {
      allowReplaceNonScript: true
    });
    showToast(
      translated ? "Translated current subtitle with local LLM." : "Current subtitle already has a saved translation."
    );
    return;
  }

  showToast("Choose a translation helper in settings.");
}

async function translateAndCacheCue(
  cue: SubtitleCue,
  provider: TranslationProvider,
  options: { allowReplaceNonScript?: boolean } = {}
): Promise<boolean> {
  if (shouldKeepCurrentTranslation(cue, options.allowReplaceNonScript)) {
    return false;
  }

  const translatedText = await translateTextWithProvider(cue.normalizedText, provider);
  await saveCueTranslation(cue, translatedText, provider);
  render();
  return true;
}

async function translateAndCacheCueWithFallback(
  cue: SubtitleCue,
  provider: TranslationProvider,
  options: { allowReplaceNonScript?: boolean } = {}
): Promise<boolean> {
  try {
    return await translateAndCacheCue(cue, provider, options);
  } catch (error) {
    await openDeepLFallback(cue.normalizedText);
    showToast(`Automatic translation failed; opened DeepL fallback. ${formatErrorMessage(error)}`);
    return false;
  }
}

async function translateFullCueWithDeepL(
  cue: SubtitleCue,
  options: { allowReplaceNonScript?: boolean; returnFocusToSource?: boolean } = {}
): Promise<boolean> {
  if (shouldKeepCurrentTranslation(cue, options.allowReplaceNonScript)) {
    await updateDeepLWindow(cue.normalizedText, { returnFocusToSource: options.returnFocusToSource });
    showToast("Sent current subtitle to DeepL; saved translation kept.");
    return false;
  }

  const translatedText = await updateDeepLWindow(cue.normalizedText, {
    returnFocusToSource: options.returnFocusToSource
  });
  if (!translatedText) {
    showToast("Sent current subtitle to DeepL.");
    return false;
  }

  await saveCueTranslation(cue, translatedText, "deepl-web");
  showToast("Translated current subtitle with DeepL.");
  return true;
}

async function saveCueTranslation(
  cue: SubtitleCue,
  translatedText: string,
  provider: TranslationProvider
): Promise<void> {
  const source = getCurrentSource();
  const cacheKey = await createContentTranslationCacheKey(source, cue.normalizedText, settings.targetLanguage);
  const now = new Date().toISOString();
  const isCurrentCue = currentCue?.id === cue.id || currentCue?.normalizedText === cue.normalizedText;
  const record: TranslationRecord = {
    cacheKey,
    source,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    originalText: cue.normalizedText,
    translatedText,
    provider,
    createdAt: isCurrentCue ? currentTranslation?.createdAt ?? now : now,
    updatedAt: now
  };

  await saveContentTranslation(record);
  if (isCurrentCue) {
    currentTranslation = record;
  }
  render();
}

async function saveSelectedTranslation(
  cue: SubtitleCue,
  selectedText: string,
  translatedText: string,
  provider: TranslationProvider
): Promise<void> {
  const source = getCurrentSource();
  const now = new Date().toISOString();
  const cacheKey = await createContentTranslationCacheKey(source, selectedText, settings.targetLanguage);
  await saveContentTranslation({
    cacheKey,
    source,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    originalText: selectedText,
    translatedText,
    provider,
    createdAt: now,
    updatedAt: now
  });
  await saveSelectionTranslationHint(source, cue.normalizedText, settings.targetLanguage, {
    sourceText: selectedText,
    translatedText,
    provider,
    createdAt: now
  });
  selectionTranslationHints = await getSelectionTranslationHints(source, cue.normalizedText, settings.targetLanguage);
  render();
}

async function translateTextWithProvider(text: string, provider: TranslationProvider): Promise<string> {
  if (provider !== "microsoft-translator" && provider !== "local-llm") {
    throw new Error("Unsupported automatic translation provider.");
  }

  const response = (await chrome.runtime.sendMessage({
    type: "ylang:translate.text",
    provider,
    text,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    microsoftTranslatorKey: settings.microsoftTranslatorKey,
    microsoftTranslatorRegion: settings.microsoftTranslatorRegion,
    localLlmEnabled: settings.localLlmEnabled,
    localLlmBaseUrl: settings.localLlmBaseUrl,
    localLlmModel: settings.localLlmModel,
    localLlmApiKey: settings.localLlmApiKey,
    localLlmDebugEnabled: settings.localLlmDebugEnabled,
    promptTemplates: settings.promptTemplates
  })) as { ok?: boolean; translatedText?: string; error?: string };

  if (!response?.ok || !response.translatedText) {
    throw new Error(response?.error ?? "Translation failed.");
  }

  return response.translatedText;
}

async function openDeepLFallback(text: string): Promise<void> {
  clearResultBubble();
  await updateDeepLWindow(text);
}

async function translateSelectedTextWithLocalLlm(cue: SubtitleCue, selectedText: string): Promise<void> {
  if (!isLocalLlmReady()) {
    showLocalLlmNotConfigured("Translation");
    return;
  }

  setResultBubble("Translation", "Thinking...");
  try {
    const translatedText = await streamLocalLlmResponse({
      type: "ylang:translate.text",
      provider: "local-llm",
      text: selectedText,
      sentence: cue.normalizedText,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      microsoftTranslatorKey: settings.microsoftTranslatorKey,
      microsoftTranslatorRegion: settings.microsoftTranslatorRegion,
      localLlmEnabled: settings.localLlmEnabled,
      localLlmBaseUrl: settings.localLlmBaseUrl,
      localLlmModel: settings.localLlmModel,
      localLlmApiKey: settings.localLlmApiKey,
      localLlmDebugEnabled: settings.localLlmDebugEnabled,
      promptTemplates: settings.promptTemplates,
      localLlmMode: "selected-phrase"
    }, (partial) => setResultBubble("Translation", partial || "Thinking..."));

    await saveSelectedTranslation(cue, selectedText, translatedText, "local-llm");
    const parsedTranslation = splitTranslationAndNotes(translatedText);
    pendingResultLearningInput = createLearningInput(cue, selectedText, getLearningKind(cue, selectedText), {
      translation: parsedTranslation.translation,
      notes: parsedTranslation.notes
    });
    setResultBubble("Translation", translatedText, "Learn");
  } catch (error) {
    try {
      await openDeepLFallback(selectedText);
      showToast(`Local LLM failed; opened DeepL fallback. ${formatErrorMessage(error)}`);
      return;
    } catch (fallbackError) {
      showTransientResultBubble(
        "Translation",
        `${formatErrorMessage(error)}\n\nDeepL fallback also failed: ${formatErrorMessage(fallbackError)}`
      );
      return;
    }
  }
}

async function explainGrammar(cue: SubtitleCue, selectedText?: string): Promise<void> {
  if (!isLocalLlmReady()) {
    showLocalLlmNotConfigured("Grammar");
    return;
  }

  setResultBubble("Grammar", "Thinking...");
  try {
    const explanation = await streamLocalLlmResponse({
      type: "ylang:llm.explainGrammar",
      sentence: cue.normalizedText,
      selectedText,
      translation: currentTranslation?.translatedText,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      localLlmEnabled: settings.localLlmEnabled,
      localLlmBaseUrl: settings.localLlmBaseUrl,
      localLlmModel: settings.localLlmModel,
      localLlmApiKey: settings.localLlmApiKey,
      localLlmDebugEnabled: settings.localLlmDebugEnabled,
      promptTemplates: settings.promptTemplates
    }, (partial) => setResultBubble("Grammar", partial || "Thinking..."));

    pendingResultLearningInput = createLearningInput(cue, selectedText, "grammar", {
      grammar: explanation
    });
    setResultBubble("Grammar", explanation, "Learn Grammar");
  } catch (error) {
    showTransientResultBubble("Grammar", formatErrorMessage(error));
  }
}

async function toggleLearningItem(cue: SubtitleCue, selectedText?: string): Promise<void> {
  const input = createLearningInput(cue, selectedText, getLearningKind(cue, selectedText));
  const id = await createLearningItemId(input);
  if (currentSelectionLearned) {
    await deleteLearningItem(id);
    currentSelectionLearned = false;
    showToast("Removed learning item.");
    render();
    return;
  }

  await saveLearningItem(input);
  currentSelectionLearned = true;
  showToast(input.kind === "sentence" ? "Learned sentence." : "Learned selection.");
  render();
}

async function refreshCurrentLearningState(): Promise<void> {
  if (!currentCue) {
    currentSelectionLearned = false;
    render();
    return;
  }

  currentSelectionLearned = await hasLearningItem({
    kind: getLearningKind(currentCue, currentSelectedText),
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    text: getLearningText(currentCue, currentSelectedText)
  });
  render();
}

async function savePendingResultLearningItem(): Promise<void> {
  if (!pendingResultLearningInput) {
    showToast("Nothing to learn yet.");
    return;
  }

  await saveLearningItem(pendingResultLearningInput);
  pendingResultLearningInput = undefined;
  await refreshCurrentLearningState();
  showToast("Saved learning item.");
}

async function attemptTranslation(cue: SubtitleCue): Promise<void> {
  const attempt = window.prompt(
    `Your translation attempt:\n\n${cue.normalizedText}`,
    ""
  )?.trim();
  if (!attempt) {
    return;
  }

  const attemptSaveStatus = settings.saveAttemptsEnabled ? "Attempt saved." : "Attempt not saved; saving is disabled.";
  const fallbackFeedback = [
    currentTranslation?.translatedText ? `Ideal translation: ${currentTranslation.translatedText}` : "",
    "Feedback: LLM feedback unavailable."
  ]
    .filter(Boolean)
    .join("\n");
  let feedback = fallbackFeedback;

  if (isLocalLlmReady()) {
    try {
      setResultBubble("Attempt", [`You: ${attempt}`, "Evaluating..."].join("\n\n"));
      feedback = await streamLocalLlmResponse({
        type: "ylang:llm.evaluateAttempt",
        sentence: cue.normalizedText,
        attempt,
        translation: currentTranslation?.translatedText,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        localLlmEnabled: settings.localLlmEnabled,
        localLlmBaseUrl: settings.localLlmBaseUrl,
        localLlmModel: settings.localLlmModel,
        localLlmApiKey: settings.localLlmApiKey,
        localLlmDebugEnabled: settings.localLlmDebugEnabled,
        promptTemplates: settings.promptTemplates
      }, (partial) => setResultBubble("Attempt", [`You: ${attempt}`, partial || "Evaluating..."].join("\n\n")));
    } catch {
      feedback = fallbackFeedback;
    }
  }

  if (settings.saveAttemptsEnabled) {
    await saveLearningItem(
      createLearningInput(cue, undefined, "attempt", {
        userAttempt: attempt,
        attemptFeedback: feedback
      })
    );
  }
  setResultBubble(
    "Attempt",
    [`You: ${attempt}`, feedback, settings.saveAttemptsEnabled ? "" : attemptSaveStatus].filter(Boolean).join("\n\n")
  );
}

function setResultBubble(title: string, body: string, learnActionLabel?: string): void {
  clearResultBubbleTimer();
  resultBubble = { title, body, learnActionLabel };
  render();
  scheduleResultBubbleAutoClose(getResultBubbleAutoCloseMs(title));
}

function clearResultBubble(): void {
  clearResultBubbleTimer();
  resultBubble = undefined;
  pendingResultLearningInput = undefined;
  render();
}

function clearResultBubbleTimer(): void {
  if (resultBubbleTimer) {
    window.clearTimeout(resultBubbleTimer);
    resultBubbleTimer = undefined;
  }
}

function showTransientResultBubble(title: string, body: string, timeoutMs = 2000): void {
  clearResultBubbleTimer();
  setResultBubble(title, body);
  clearResultBubbleTimer();
  resultBubbleTimer = window.setTimeout(() => {
    if (resultBubble?.title === title && resultBubble.body === body) {
      resultBubble = undefined;
      render();
    }
    resultBubbleTimer = undefined;
  }, timeoutMs);
}

function scheduleResultBubbleAutoClose(timeoutMs: number): void {
  if (timeoutMs <= 0) {
    return;
  }

  resultBubbleTimer = window.setTimeout(() => {
    resultBubble = undefined;
    pendingResultLearningInput = undefined;
    render();
    resultBubbleTimer = undefined;
  }, timeoutMs);
}

function getResultBubbleAutoCloseMs(title: string): number {
  const seconds = isLlmResultBubble(title)
    ? settings.llmResultAutoCloseSeconds
    : settings.otherResultAutoCloseSeconds;
  return Math.max(0, seconds) * 1000;
}

function isLlmResultBubble(title: string): boolean {
  return title === "Translation" || title === "Grammar" || title === "Attempt";
}

async function streamLocalLlmResponse(request: Record<string, unknown>, onUpdate: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    let finalText = "";
    let settled = false;
    let hasShownText = false;
    const waitingTimer = window.setTimeout(() => {
      if (!hasShownText && !settled) {
        onUpdate(LOCAL_LLM_LOADING_MESSAGE);
      }
    }, 2000);
    let port: RuntimePort;
    try {
      port = chrome.runtime.connect({ name: "ylang:llm-stream" });
    } catch (error) {
      window.clearTimeout(waitingTimer);
      reject(error);
      return;
    }

    port.onMessage.addListener((message: unknown) => {
      const streamMessage = message as LlmStreamMessage;
      if (streamMessage.type === "replace") {
        finalText = streamMessage.text ?? "";
        hasShownText = Boolean(finalText.trim());
        onUpdate(finalText);
      } else if (streamMessage.type === "done") {
        settled = true;
        window.clearTimeout(waitingTimer);
        finalText = streamMessage.text ?? finalText;
        port.disconnect();
        resolve(finalText);
      } else if (streamMessage.type === "error") {
        settled = true;
        window.clearTimeout(waitingTimer);
        port.disconnect();
        reject(new Error(streamMessage.error ?? "Local LLM stream failed."));
      }
    });

    port.onDisconnect.addListener(() => {
      if (!settled) {
        window.clearTimeout(waitingTimer);
        reject(new Error("Local LLM stream disconnected."));
      }
    });

    port.postMessage({
      type: "ylang:llm.stream",
      request
    });
  });
}

function createLearningInput(
  cue: SubtitleCue,
  selectedText: string | undefined,
  kind: LearningItemKind,
  extra: Partial<Pick<SaveLearningItemInput, "translation" | "grammar" | "userAttempt" | "attemptFeedback" | "notes">> = {}
): SaveLearningItemInput {
  const learningText = getLearningText(cue, selectedText);
  return {
    kind,
    source: getCurrentSource(),
    cueId: cue.id,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    text: kind === "grammar" && selectedText ? `Grammar: ${selectedText}` : learningText,
    sentence: cue.normalizedText,
    selectedText,
    translation: extra.translation ?? resolveLearningTranslation(cue, selectedText, kind),
    grammar: extra.grammar,
    userAttempt: extra.userAttempt,
    attemptFeedback: extra.attemptFeedback,
    notes: extra.notes,
    startMs: cue.startMs,
    endMs: cue.endMs
  };
}

function splitTranslationAndNotes(value: string): { translation: string; notes?: string } {
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    translation: lines[0] ?? value.trim(),
    notes: lines.slice(1).join("\n") || undefined
  };
}

function resolveLearningTranslation(
  cue: SubtitleCue,
  selectedText: string | undefined,
  kind: LearningItemKind
): string | undefined {
  if (!selectedText?.trim()) {
    return currentTranslation?.translatedText ?? (kind === "sentence" ? cue.normalizedText : undefined);
  }

  return findSelectionHintTranslation(selectedText);
}

function findSelectionHintTranslation(selectedText: string): string | undefined {
  const normalizedSelection = normalizeLearningLookup(selectedText);
  return selectionTranslationHints.find((hint) => normalizeLearningLookup(hint.sourceText) === normalizedSelection)
    ?.translatedText;
}

function getLearningKind(cue: SubtitleCue, selectedText: string | undefined): LearningItemKind {
  const text = getLearningText(cue, selectedText);
  if (!selectedText?.trim()) {
    return "sentence";
  }

  return text.includes(" ") ? "phrase" : "word";
}

function getLearningText(cue: SubtitleCue, selectedText: string | undefined): string {
  return selectedText?.trim() || cue.normalizedText;
}

function normalizeLearningLookup(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function isLocalLlmReady(): boolean {
  return Boolean(settings.localLlmEnabled && settings.localLlmBaseUrl.trim() && settings.localLlmModel.trim());
}

function showLocalLlmNotConfigured(title: string): void {
  setResultBubble(title, "Local LLM is not configured. Enable it in settings and set a base URL plus model.");
  window.setTimeout(() => {
    if (resultBubble?.title === title && resultBubble.body.startsWith("Local LLM is not configured.")) {
      resultBubble = undefined;
      render();
    }
  }, 3000);
}

async function updateSettings(nextSettings: Partial<YlangSettings>): Promise<void> {
  settings = {
    ...settings,
    ...nextSettings
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  render();
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (!settings.videoModeEnabled) {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  const hasSelection = Boolean(window.getSelection()?.toString().trim());
  if (isClearSelectionShortcut(event)) {
    event.preventDefault();
    if (clearOverlayWordSelection()) {
      showToast("Cleared selected words.");
    }
    return;
  }

  if (isConfiguredShortcut(event, settings.translateShortcut) && currentCue) {
    event.preventDefault();
    void translateCue(currentCue, currentSelectedText);
    return;
  }

  if (isConfiguredShortcut(event, settings.learnShortcut) && currentCue) {
    event.preventDefault();
    void toggleLearningItem(currentCue, currentSelectedText);
    return;
  }

  if (isConfiguredShortcut(event, settings.grammarShortcut) && currentCue) {
    event.preventDefault();
    void explainGrammar(currentCue, currentSelectedText);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !hasSelection && currentCue) {
    event.preventDefault();
    void navigator.clipboard
      ?.writeText(currentCue.normalizedText)
      .then(() => showToast("Copied current subtitle."))
      .catch(() => showToast("Could not copy subtitle."));
    return;
  }
}

function isClearSelectionShortcut(event: KeyboardEvent): boolean {
  const shortcut = settings.clearSelectionShortcut.trim().toLowerCase();
  return (
    Boolean(shortcut) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === shortcut
  );
}

function isConfiguredShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const normalized = normalizeShortcutKey(shortcut);
  if (!normalized || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  if (normalized === "space") {
    return event.key === " ";
  }

  return event.key.toLowerCase() === normalized;
}

function normalizeShortcutKey(shortcut: string): string {
  const trimmed = shortcut.trim();
  return trimmed.toLowerCase() === "space" ? "space" : trimmed.slice(0, 1).toLowerCase();
}

function observeSettingsChanges(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes["ylang:settings"]?.newValue) {
      return;
    }

    settings = {
      ...settings,
      ...(changes["ylang:settings"].newValue as Partial<YlangSettings>)
    };
    render();
  });
}

async function updateDeepLWindow(
  text: string,
  options: { returnFocusToSource?: boolean } = {}
): Promise<string | undefined> {
  const response = (await chrome.runtime.sendMessage({
    type: "ylang:deepl.translate",
    text,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    pinToTop: settings.deepLPinToTop,
    focusOnUpdate: settings.deepLFocusOnUpdate,
    returnFocusToSource: options.returnFocusToSource,
    windowPreset: settings.deepLWindowPreset,
    windowXPercent: settings.deepLWindowXPercent,
    windowYPercent: settings.deepLWindowYPercent,
    screenId: settings.deepLScreenId
  })) as { ok?: boolean; translatedText?: string; error?: string };

  if (!response?.ok) {
    throw new Error(response?.error ?? "Could not update DeepL.");
  }

  return response.translatedText?.trim() || undefined;
}

function observeVideoPause(): void {
  const attach = () => {
    const video = document.querySelector("video");
    if (!video || video.dataset.ylangPauseObserved === "true") {
      return;
    }

    video.dataset.ylangPauseObserved = "true";
    video.addEventListener("pause", () => {
      if (
        !settings.translateOnPause ||
        !canTranslateOnPause(settings.provider) ||
        !currentCue ||
        shouldKeepCurrentTranslation(currentCue, settings.retranslateNonScriptOnPause) ||
        currentCue.normalizedText === lastPauseTranslatedText
      ) {
        return;
      }

      lastPauseTranslatedText = currentCue.normalizedText;
      void translateOnPause(currentCue);
    });
  };

  attach();
  const observer = new MutationObserver(attach);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function canTranslateOnPause(provider: TranslationProvider): boolean {
  return provider === "deepl-web" || provider === "microsoft-translator" || provider === "local-llm";
}

async function translateOnPause(cue: SubtitleCue): Promise<void> {
  try {
    if (settings.provider === "deepl-web") {
      await translateFullCueWithDeepL(cue, {
        allowReplaceNonScript: settings.retranslateNonScriptOnPause,
        returnFocusToSource: true
      });
      return;
    }

    if (settings.provider === "microsoft-translator") {
      const translated = await translateAndCacheCueWithFallback(cue, settings.provider, {
        allowReplaceNonScript: settings.retranslateNonScriptOnPause
      });
      if (translated) {
        showToast("Pause translated current subtitle.");
      }
    }

    if (settings.provider === "local-llm") {
      const translated = await translateAndCacheCueWithFallback(cue, settings.provider, {
        allowReplaceNonScript: settings.retranslateNonScriptOnPause
      });
      if (translated) {
        showToast("Pause translated current subtitle with local LLM.");
      }
    }
  } catch {
    showToast("Could not translate on pause.");
  }
}

function hasCurrentTranslation(cue: SubtitleCue): boolean {
  return Boolean(
    currentTranslation?.translatedText.trim() &&
      (currentCue?.id === cue.id || currentCue?.normalizedText === cue.normalizedText)
  );
}

function shouldKeepCurrentTranslation(cue: SubtitleCue, allowReplaceNonScript: boolean | undefined): boolean {
  if (!hasCurrentTranslation(cue)) {
    return false;
  }

  return !allowReplaceNonScript || currentTranslation?.provider === "bulk-paste";
}

async function refreshTranscriptSavedState(): Promise<void> {
  const source = getCurrentSource();
  transcriptSaved = await hasSavedEpisodeTranscript(source);
  render();
}

function formatCurrentEpisodeScript(): string {
  if (!currentTrack?.cues.length) {
    return "";
  }

  return currentTrack.cues
    .map((cue, index) => `${String(index + 1).padStart(4, "0")}\t${cue.normalizedText}`)
    .join("\n");
}

async function copyCurrentEpisodeScript(): Promise<void> {
  const scriptText = formatCurrentEpisodeScript();
  if (!scriptText) {
    episodeStatus = "No timed episode script loaded yet.";
    render();
    return;
  }

  await navigator.clipboard.writeText(scriptText);
  episodeStatus = "Copied original script.";
  render();
}

async function saveCurrentEpisodeTranscript(): Promise<void> {
  const snapshot = createCurrentEpisodeSnapshot();
  if (!snapshot) {
    episodeStatus = "No timed episode script loaded yet.";
    render();
    return;
  }

  await saveEpisodeTranscript(snapshot);
  transcriptSaved = true;
  episodeStatus = "Saved transcript locally.";
  render();
}

async function deleteCurrentEpisodeTranscript(): Promise<void> {
  if (!currentTrack?.cues.length) {
    episodeStatus = "No timed episode script loaded yet.";
    render();
    return;
  }

  const deleted = await deleteEpisodeTranscript(getCurrentSource());
  transcriptSaved = false;
  episodeStatus = deleted ? "Deleted saved transcript." : "No saved transcript for this episode.";
  render();
}

async function importEpisodeTranslation(text: string): Promise<void> {
  if (!currentTrack?.cues.length) {
    episodeStatus = "No timed episode script loaded yet.";
    render();
    return;
  }

  const translatedLines = parseTranslatedLines(text);
  if (!translatedLines.length) {
    episodeStatus = "Paste translated lines first.";
    render();
    return;
  }

  if (translatedLines.length !== currentTrack.cues.length) {
    episodeStatus = `Line count mismatch: ${translatedLines.length} translations for ${currentTrack.cues.length} original lines.`;
    render();
    return;
  }

  for (let index = 0; index < currentTrack.cues.length; index += 1) {
    await saveCueTranslation(currentTrack.cues[index], translatedLines[index], "bulk-paste");
  }

  const snapshot = createCurrentEpisodeSnapshot();
  if (snapshot) {
    await saveEpisodeTranscript(snapshot);
    transcriptSaved = true;
  }

  episodeStatus = `Imported ${translatedLines.length} aligned translations and saved transcript.`;
  render();
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseTranslatedLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*\d{1,5}[\t.)\]-]*\s*/, "").trim())
    .filter(Boolean);
}

function createCurrentEpisodeSnapshot(): EpisodeScriptSnapshot | undefined {
  if (!currentTrack?.cues.length) {
    return undefined;
  }

  return {
    source: getCurrentSource(),
    sourceLanguage: currentTrack.language,
    targetLanguage: settings.targetLanguage,
    capturedAt: new Date().toISOString(),
    cues: currentTrack.cues
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function showToast(message: string): void {
  const id = "ylang-toast";
  let toast = document.getElementById(id);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = id;
    toast.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:24px",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "padding:8px 12px",
      "border-radius:7px",
      "background:rgba(10,18,22,.92)",
      "color:white",
      "font:700 13px/1.3 Arial,sans-serif",
      "box-shadow:0 4px 18px rgba(0,0,0,.35)",
      "pointer-events:none"
    ].join(";");
    document.documentElement.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = "1";
  window.setTimeout(() => {
    if (toast) {
      toast.style.opacity = "0";
    }
  }, 1400);
}

void start().catch((error: unknown) => {
  if (isExtensionContextInvalidatedError(error)) {
    return;
  }
  console.error("ylang failed to start timed subtitle mode; falling back to rendered subtitles.", error);
  startRenderedSubtitleFallback();
});

function startRenderedSubtitleFallback(): void {
  subtitleSourceGeneration += 1;
  stopSubtitleSource?.();
  currentAdapter = selectPageAdapter();

  stopSubtitleSource = currentAdapter.observeSubtitles((cue) => {
    void handleCue(cue);
  });
  showToast(currentAdapter.renderedFallbackLabel ?? "Using rendered subtitle fallback.");
}

async function fetchCurrentEpisodeTranscript(): Promise<void> {
  currentAdapter = selectPageAdapter();
  if (!currentAdapter.loadSubtitleTrack) {
    episodeStatus = "This page does not expose a timed transcript loader yet.";
    render();
    return;
  }

  episodeStatus = "Fetching timed transcript...";
  render();

  const track = await tryLoadTimedTrack();
  if (!track) {
    const debugStatus = currentAdapter.getDebugStatus?.();
    episodeStatus = currentAdapter.id === "netflix"
      ? `No Netflix timed transcript found. ${debugStatus ?? "No Netflix debug status yet."}`
      : "No timed transcript found yet.";
    render();
    return;
  }

  stopSubtitleSource?.();
  currentTrack = track;
  await refreshTranscriptSavedState();
  stopSubtitleSource = observeTimedSubtitleTrack(track, (cue) => {
    void handleCue(cue);
  });
  episodeStatus = `Loaded ${track.cues.length} timed transcript lines.`;
  showToast(currentAdapter.trackLoadedLabel?.(track) ?? episodeStatus);
  render();
}

function observeRuntimeMessages(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isResumePlaybackMessage(message)) {
      return false;
    }

    void resumePrimaryVideo()
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  });
}

async function resumePrimaryVideo(): Promise<void> {
  const video = [...document.querySelectorAll<HTMLVideoElement>("video")]
    .sort((a, b) => getVideoArea(b) - getVideoArea(a))[0];
  if (!video) {
    throw new Error("No video element found.");
  }

  if (video.paused) {
    await video.play();
  } else {
    video.dispatchEvent(new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      composed: true
    }));
  }
}

function getVideoArea(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  return rect.width * rect.height;
}

function isResumePlaybackMessage(message: unknown): message is { type: "ylang:video.resumePlayback" } {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: string }).type === "ylang:video.resumePlayback"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
