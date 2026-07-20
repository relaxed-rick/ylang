type TranslationProvider = "deepl-web" | "microsoft-translator" | "local-llm" | "bulk-paste";

type YlangSettings = {
  sourceLanguage: string;
  targetLanguage: string;
  provider: TranslationProvider;
  readingModeEnabled: boolean;
  microsoftTranslatorKey: string;
  microsoftTranslatorRegion: string;
  localLlmEnabled: boolean;
  localLlmBaseUrl: string;
  localLlmModel: string;
  localLlmApiKey: string;
  localLlmDebugEnabled: boolean;
  llmResultAutoCloseSeconds: number;
  otherResultAutoCloseSeconds: number;
  promptTemplates?: Record<string, string>;
  videoUiColor: string;
  textUiColor: string;
  favoriteLanguageCodes: string[];
  translateShortcut: string;
  learnShortcut: string;
  grammarShortcut: string;
  selectShortcut: string;
  deepLPinToTop: boolean;
  deepLFocusOnUpdate: boolean;
  deepLWindowPreset: string;
  deepLWindowXPercent: number;
  deepLWindowYPercent: number;
  deepLScreenId: string;
  maxPhraseGapWords: number;
};

type SourceRef = {
  provider: "generic";
  url: string;
  title?: string;
};

type SaveLearningItemInput = {
  kind: "word" | "phrase" | "sentence" | "grammar";
  source: SourceRef;
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
  sentence: string;
  selectedText?: string;
  translation?: string;
  grammar?: string;
  notes?: string;
};

type LearningItem = SaveLearningItemInput & {
  id: string;
  normalizedText: string;
  collectionId?: string;
  media: [];
  occurrences: Array<{
    id: string;
    source: SourceRef;
    sentence: string;
    selectedText?: string;
    translation?: string;
    grammar?: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

declare const chrome: {
  runtime: {
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    connect(connectInfo: { name: string }): RuntimePort;
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
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

{
const SETTINGS_KEY = "ylang:settings";
const LEARNING_INDEX_KEY = "ylang:learning-items:index";
const ROOT_ID = "ylang-reading-root";
const STYLE_ID = "ylang-reading-style";
const ICON_URL = chrome.runtime.getURL("assets/icons/ylang.svg");
const ICON_TWITCH_URL = ICON_URL;
const ICON_BURST_URL = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
    <g fill="none" stroke="#fffdf7" stroke-width="2.6" stroke-linecap="round" opacity="0.94">
      <path d="M36 8v6"/>
      <path d="M36 58v6"/>
      <path d="M8 36h6"/>
      <path d="M58 36h6"/>
      <path d="M16.2 16.2l4.3 4.3"/>
      <path d="M51.5 51.5l4.3 4.3"/>
      <path d="M55.8 16.2l-4.3 4.3"/>
      <path d="M20.5 51.5l-4.3 4.3"/>
      <path d="M43 59l2.4 5.6"/>
    </g>
  </svg>
`)}`;
const LOCAL_LLM_LOADING_MESSAGE = "Waiting for local LLM...";

const defaultSettings: YlangSettings = {
  sourceLanguage: "auto",
  targetLanguage: "en",
  provider: "deepl-web",
  readingModeEnabled: false,
  microsoftTranslatorKey: "",
  microsoftTranslatorRegion: "",
  localLlmEnabled: false,
  localLlmBaseUrl: "http://127.0.0.1:11434/v1",
  localLlmModel: "",
  localLlmApiKey: "",
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
  deepLPinToTop: true,
  deepLFocusOnUpdate: true,
  deepLWindowPreset: "top-left-detached",
  deepLWindowXPercent: 5,
  deepLWindowYPercent: 5,
  deepLScreenId: "primary",
  maxPhraseGapWords: 2
};

let settings = defaultSettings;
let selectedText = "";
let browserSelectedText = "";
let selectedWords = new Set<number>();
let lastTranslation: { source: string; translation: string } | undefined;
let panelOpen = false;
let wordViewOpen = false;
let currentSelectionLearned = false;
let iconTwitchTimeout: ReturnType<typeof setTimeout> | undefined;
let miniResultTimer: ReturnType<typeof setTimeout> | undefined;
let lastClickedWordIndex: number | undefined;

void start();

async function start(): Promise<void> {
  settings = await getSettings();
  ensureStyle();
  document.addEventListener("selectionchange", scheduleSelectionRender);
  document.addEventListener("mouseup", scheduleSelectionRender, true);
  document.addEventListener("keyup", handleKeyUp, true);
  document.addEventListener("keydown", handleShortcut, true);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SETTINGS_KEY]?.newValue) {
      settings = normalizeSettings(changes[SETTINGS_KEY].newValue as Partial<YlangSettings>);
      render();
    }
  });
}

async function getSettings(): Promise<YlangSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY] as Partial<YlangSettings> | undefined);
}

function normalizeSettings(value: Partial<YlangSettings> | undefined): YlangSettings {
  return {
    ...defaultSettings,
    ...(value ?? {}),
    sourceLanguage: value?.sourceLanguage === "no" ? "nb" : value?.sourceLanguage ?? defaultSettings.sourceLanguage,
    targetLanguage: value?.targetLanguage === "no" ? "nb" : value?.targetLanguage ?? defaultSettings.targetLanguage
  };
}

function scheduleSelectionRender(): void {
  window.setTimeout(updateSelectionFromPage, 30);
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    hideOverlay();
    return;
  }
  scheduleSelectionRender();
}

function handleShortcut(event: KeyboardEvent): void {
  if (!settings.readingModeEnabled || !selectedText) {
    return;
  }

  if (isConfiguredShortcut(event, settings.translateShortcut) && !isEditableTarget(event.target)) {
    event.preventDefault();
    triggerIconTwitch();
    void translateSelection();
  } else if (isConfiguredShortcut(event, settings.learnShortcut) && !isEditableTarget(event.target)) {
    event.preventDefault();
    triggerIconTwitch();
    void learnSelection();
  } else if (isConfiguredShortcut(event, settings.grammarShortcut) && !isEditableTarget(event.target)) {
    event.preventDefault();
    triggerIconTwitch();
    void explainGrammar();
  } else if (isConfiguredShortcut(event, settings.selectShortcut) && !isEditableTarget(event.target)) {
    event.preventDefault();
    openWordView();
    requestAnimationFrame(triggerIconTwitch);
  }
}

function updateSelectionFromPage(): void {
  if (!settings.readingModeEnabled) {
    hideOverlay();
    return;
  }

  if (document.activeElement?.closest?.(`#${ROOT_ID}`)) {
    return;
  }

  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
  if (!selection || selection.rangeCount === 0 || !text) {
    hideOverlay();
    return;
  }

  const selectionState = createReadingSelectionState(selection, text);
  if (selectionState.rawText !== browserSelectedText || selectionState.contextText !== selectedText) {
    browserSelectedText = selectionState.rawText;
    selectedText = selectionState.contextText;
    selectedWords = new Set(selectionState.selectedWordIndexes);
    currentSelectionLearned = false;
    panelOpen = false;
    wordViewOpen = false;
    lastClickedWordIndex = undefined;
    void refreshCurrentSelectionLearned();
  }
  render();
}

function render(): void {
  if (!settings.readingModeEnabled || !selectedText) {
    hideOverlay();
    return;
  }

  const root = ensureRoot();
  const rect = getSelectionRect();
  positionReadingRoot(root, rect);
  root.style.top = `${Math.round(rect.top + window.scrollY)}px`;
  root.style.setProperty("--ylang-reading-ui-color", normalizeCssColor(settings.textUiColor));
  root.style.setProperty("--ylang-reading-popover-width", `${getReadingPopoverWidth()}px`);
  root.innerHTML = `
    <button class="ylang-reading-icon" type="button" data-action="toggle" title="ylang reading tools" aria-label="ylang reading tools">
      <img class="ylang-reading-burst" src="${ICON_BURST_URL}" alt="" aria-hidden="true" />
      <img class="ylang-reading-logo" src="${ICON_URL}" alt="" aria-hidden="true" />
    </button>
    ${panelOpen ? renderActionPanel() : ""}
    ${wordViewOpen ? renderWordView() : ""}
  `;

  root.querySelector("[data-action='toggle']")?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    openWordView();
    requestAnimationFrame(triggerIconTwitch);
  });
  root.querySelectorAll<HTMLElement>("[data-action='translate'], [data-action='learn'], [data-action='grammar']").forEach((button) => {
    button.addEventListener("pointerdown", () => triggerIconTwitch());
  });
  root.querySelector("[data-action='translate']")?.addEventListener("click", () => {
    void translateSelection();
  });
  root.querySelector("[data-action='learn']")?.addEventListener("click", () => {
    void learnSelection();
  });
  root.querySelector("[data-action='grammar']")?.addEventListener("click", () => {
    void explainGrammar();
  });
  root.querySelector("[data-action='clear-words']")?.addEventListener("click", () => {
    selectedWords = new Set();
    lastClickedWordIndex = undefined;
    render();
  });
  root.querySelectorAll<HTMLElement>("[data-word-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const index = Number(button.dataset.wordIndex);
      if (event.shiftKey && lastClickedWordIndex !== undefined) {
        toggleWordRange(lastClickedWordIndex, index, !selectedWords.has(index));
      } else {
        toggleWordIndex(index);
      }
      lastClickedWordIndex = index;
      render();
    });
  });
}

function renderActionPanel(): string {
  return `
    <div class="ylang-reading-panel">
      <button type="button" data-action="translate">Translate <span>T</span></button>
      <button type="button" data-action="grammar">Grammar <span>G</span></button>
      <button type="button" data-action="learn">${currentSelectionLearned ? "Unlearn" : "Learn"} <span>L</span></button>
    </div>
  `;
}

function renderWordView(): string {
  return `
    <div class="ylang-reading-word-view">
      ${tokenizeWords(selectedText).map((word, index) => `
        <button class="${selectedWords.has(index) ? "selected" : ""}" type="button" data-word-index="${index}">${escapeHtml(word)}</button>
      `).join(" ")}
      <button class="ylang-reading-clear-words" type="button" data-action="clear-words">Clear</button>
    </div>
  `;
}

async function translateSelection(): Promise<void> {
  const text = getActiveSelectionText();
  if (!text) {
    return;
  }

  try {
    if (settings.provider === "deepl-web") {
      const response = (await chrome.runtime.sendMessage({
        type: "ylang:deepl.translate",
        text,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        pinToTop: settings.deepLPinToTop,
        focusOnUpdate: settings.deepLFocusOnUpdate
      })) as { ok?: boolean; translatedText?: string; error?: string };
      if (response.translatedText) {
        lastTranslation = { source: text, translation: response.translatedText };
        showMiniResult(response.translatedText, getOtherAutoCloseMs());
      }
      return;
    }

    if (settings.provider === "local-llm") {
      showMiniResult("");
      const translatedText = await streamLocalLlmResponse({
        type: "ylang:translate.text",
        provider: "local-llm",
        text,
        sentence: selectedText,
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
      }, (partial) => showMiniResult(partial));
      lastTranslation = { source: text, translation: translatedText };
      showMiniResult(translatedText, getLlmAutoCloseMs());
      return;
    }

    const response = (await chrome.runtime.sendMessage({
      type: "ylang:translate.text",
      provider: settings.provider,
      text,
      sentence: selectedText,
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
    })) as { ok?: boolean; translatedText?: string; error?: string };
    if (!response.ok || !response.translatedText) {
      throw new Error(response.error ?? "Translation failed.");
    }

    lastTranslation = { source: text, translation: response.translatedText };
    showMiniResult(response.translatedText, getOtherAutoCloseMs());
  } catch (error) {
    if (settings.provider === "deepl-web") {
      showMiniResult(error instanceof Error ? error.message : String(error), 2000);
      return;
    }

    try {
      await openDeepLFallback(text);
    } catch (fallbackError) {
      showMiniResult(
        `${formatErrorMessage(error)}\n\nDeepL fallback also failed: ${formatErrorMessage(fallbackError)}`,
        2000
      );
    }
  }
}

async function learnSelection(): Promise<void> {
  const text = getActiveSelectionText();
  if (!text) {
    return;
  }
  const kind = text.includes(" ") ? "phrase" : "word";

  if (currentSelectionLearned) {
    await deleteLearningItem(kind, text);
    currentSelectionLearned = false;
    render();
    showMiniResult("Unlearned.", getOtherAutoCloseMs());
    return;
  }

  await saveLearningItem({
    kind,
    source: getSource(),
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    text,
    sentence: selectedText,
    selectedText: text,
    ...createReadingTranslationFields(text)
  });
  currentSelectionLearned = true;
  render();
  showMiniResult("Learned.", getOtherAutoCloseMs());
}

async function explainGrammar(): Promise<void> {
  const text = getActiveSelectionText();
  if (!text) {
    return;
  }

  if (!(settings.localLlmEnabled && settings.localLlmBaseUrl && settings.localLlmModel)) {
    showMiniResult("Local LLM is not configured.", 3000);
    return;
  }

  try {
    showMiniResult("");
    const explanation = await streamLocalLlmResponse({
      type: "ylang:llm.explainGrammar",
      sentence: selectedText,
      selectedText: text,
      translation: lastTranslation?.source === text ? lastTranslation.translation : undefined,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      localLlmEnabled: settings.localLlmEnabled,
      localLlmBaseUrl: settings.localLlmBaseUrl,
      localLlmModel: settings.localLlmModel,
      localLlmApiKey: settings.localLlmApiKey,
      localLlmDebugEnabled: settings.localLlmDebugEnabled,
      promptTemplates: settings.promptTemplates
    }, (partial) => showMiniResult(partial));

    await saveLearningItem({
      kind: "grammar",
      source: getSource(),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      text: `Grammar: ${text}`,
      sentence: selectedText,
      selectedText: text,
      grammar: explanation
    });
    showMiniResult(explanation, getLlmAutoCloseMs());
  } catch (error) {
    showMiniResult(error instanceof Error ? error.message : String(error), 2000);
  }
}

function openWordView(): void {
  panelOpen = true;
  wordViewOpen = true;
  render();
}

async function saveLearningItem(input: SaveLearningItemInput): Promise<void> {
  const id = await createLearningItemId(input);
  const key = createLearningItemKey(id);
  const stored = await chrome.storage.local.get(key);
  const existing = stored[key] as LearningItem | undefined;
  const now = new Date().toISOString();
  const occurrence = {
    id: `${input.source.url}:${normalizeLearningText(input.text)}`,
    source: input.source,
    sentence: input.sentence,
    selectedText: input.selectedText,
    translation: input.translation,
    grammar: input.grammar,
    createdAt: now
  };
  const item: LearningItem = {
    ...input,
    id,
    normalizedText: normalizeLearningText(input.text),
    collectionId: existing?.collectionId ?? createDefaultLearningCollectionId(input.sourceLanguage),
    translation: input.translation ?? existing?.translation,
    grammar: input.grammar ?? existing?.grammar,
    notes: input.notes ?? existing?.notes,
    media: [],
    occurrences: existing?.occurrences?.some((candidate) => candidate.id === occurrence.id)
      ? existing.occurrences
      : [occurrence, ...(existing?.occurrences ?? [])],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const index = ((await chrome.storage.local.get(LEARNING_INDEX_KEY))[LEARNING_INDEX_KEY] as Array<Record<string, unknown>> | undefined) ?? [];
  await chrome.storage.local.set({
    [key]: item,
    [LEARNING_INDEX_KEY]: [
      {
        id,
        kind: item.kind,
        text: item.text,
        normalizedText: item.normalizedText,
        sentence: item.sentence,
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        collectionId: item.collectionId,
        occurrenceCount: item.occurrences.length,
        updatedAt: item.updatedAt
      },
      ...index.filter((candidate) => candidate.id !== id)
    ]
  });
}

function createDefaultLearningCollectionId(sourceLanguage: string): string {
  return `source:${encodeURIComponent(sourceLanguage)}`;
}

async function deleteLearningItem(kind: string, text: string): Promise<void> {
  const id = await sha256(`${kind}:${settings.sourceLanguage}:${settings.targetLanguage}:${normalizeLearningText(text)}`);
  await chrome.storage.local.remove(createLearningItemKey(id));
  const index = ((await chrome.storage.local.get(LEARNING_INDEX_KEY))[LEARNING_INDEX_KEY] as Array<Record<string, unknown>> | undefined) ?? [];
  await chrome.storage.local.set({ [LEARNING_INDEX_KEY]: index.filter((item) => item.id !== id) });
}

async function refreshCurrentSelectionLearned(): Promise<void> {
  const text = getActiveSelectionText();
  if (!text) {
    currentSelectionLearned = false;
    return;
  }
  const kind = text.includes(" ") ? "phrase" : "word";
  const id = await sha256(`${kind}:${settings.sourceLanguage}:${settings.targetLanguage}:${normalizeLearningText(text)}`);
  const stored = await chrome.storage.local.get(createLearningItemKey(id));
  currentSelectionLearned = Boolean(stored[createLearningItemKey(id)]);
  render();
}

function createReadingTranslationFields(text: string): Pick<SaveLearningItemInput, "translation" | "notes"> {
  if (lastTranslation?.source !== text) {
    return {};
  }

  return splitTranslationAndNotes(lastTranslation.translation);
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

async function createLearningItemId(input: SaveLearningItemInput): Promise<string> {
  return sha256(`${input.kind}:${input.sourceLanguage}:${input.targetLanguage}:${normalizeLearningText(input.text)}`);
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function getActiveSelectionText(): string {
  if (!wordViewOpen) {
    return browserSelectedText || selectedText;
  }

  const words = tokenizeWords(selectedText);
  return words.filter((_, index) => selectedWords.has(index)).join(" ").trim() || selectedText;
}

function getSelectionRect(): DOMRect {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return new DOMRect(20, 20, 0, 0);
  }
  return selection.getRangeAt(0).getBoundingClientRect();
}

function positionReadingRoot(root: HTMLElement, rect: DOMRect): void {
  const placementWidth = getReadingPlacementWidth();
  const popoverWidth = getReadingPopoverWidth();
  const margin = 12;
  const viewportLeft = window.scrollX + margin;
  const viewportRight = window.scrollX + window.innerWidth - margin;
  const shouldMoveLeft = wordViewOpen && tokenizeWords(selectedText).length < 8;
  const desiredLeft = shouldMoveLeft
    ? rect.left + window.scrollX - popoverWidth - 8
    : rect.right + window.scrollX + 8;
  root.style.left = `${Math.round(clamp(desiredLeft, viewportLeft, viewportRight - placementWidth))}px`;
}

function getReadingPlacementWidth(): number {
  if (wordViewOpen) {
    return getReadingPopoverWidth();
  }

  if (panelOpen) {
    return Math.min(360, Math.max(window.innerWidth - 24, 48));
  }

  return 48;
}

function getReadingPopoverWidth(): number {
  const wordCount = tokenizeWords(selectedText).length;
  if (wordViewOpen && wordCount > 0 && wordCount < 8) {
    return Math.min(Math.max(wordCount * 82, 260), Math.max(window.innerWidth - 24, 260));
  }

  return Math.min(760, Math.max(window.innerWidth - 32, 260));
}

function positionMiniResult(root: HTMLElement, result: HTMLElement): void {
  const wordView = root.querySelector<HTMLElement>(".ylang-reading-word-view");
  const offsetTop = wordView && wordViewOpen
    ? wordView.offsetTop + wordView.offsetHeight + 8
    : 38;
  result.style.top = `${offsetTop}px`;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function ensureRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.appendChild(root);
  }
  return root;
}

function hideOverlay(): void {
  selectedText = "";
  browserSelectedText = "";
  selectedWords = new Set();
  panelOpen = false;
  wordViewOpen = false;
  lastClickedWordIndex = undefined;
  if (miniResultTimer) {
    clearTimeout(miniResultTimer);
    miniResultTimer = undefined;
  }
  document.getElementById(ROOT_ID)?.remove();
}

function showMiniResult(message: string, autoHideMs?: number): void {
  if (miniResultTimer) {
    clearTimeout(miniResultTimer);
    miniResultTimer = undefined;
  }
  const root = ensureRoot();
  panelOpen = true;
  const existing = root.querySelector(".ylang-reading-result");
  existing?.remove();
  const result = document.createElement("div");
  result.className = "ylang-reading-result";
  result.textContent = message;
  root.appendChild(result);
  positionMiniResult(root, result);
  if (autoHideMs) {
    miniResultTimer = setTimeout(() => {
      if (result.isConnected && result.textContent === message) {
        result.remove();
      }
      miniResultTimer = undefined;
    }, autoHideMs);
  }
}

function hideMiniResult(): void {
  if (miniResultTimer) {
    clearTimeout(miniResultTimer);
    miniResultTimer = undefined;
  }
  document.getElementById(ROOT_ID)?.querySelector(".ylang-reading-result")?.remove();
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

function tokenizeWords(text: string): string[] {
  return text.match(/\p{L}+(?:['-]\p{L}+)*|\p{N}+/gu) ?? [];
}

async function translateWithDeepL(text: string): Promise<string | undefined> {
  const response = (await chrome.runtime.sendMessage({
    type: "ylang:deepl.translate",
    text,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    pinToTop: settings.deepLPinToTop,
    focusOnUpdate: settings.deepLFocusOnUpdate,
    windowPreset: settings.deepLWindowPreset,
    windowXPercent: settings.deepLWindowXPercent,
    windowYPercent: settings.deepLWindowYPercent,
    screenId: settings.deepLScreenId
  })) as { ok?: boolean; translatedText?: string; error?: string };
  if (!response.ok) {
    throw new Error(response.error ?? "DeepL fallback failed.");
  }
  return response.translatedText?.trim() || undefined;
}

async function openDeepLFallback(text: string): Promise<void> {
  hideMiniResult();
  await translateWithDeepL(text);
}

function getLlmAutoCloseMs(): number | undefined {
  return secondsToOptionalMs(settings.llmResultAutoCloseSeconds);
}

function getOtherAutoCloseMs(): number | undefined {
  return secondsToOptionalMs(settings.otherResultAutoCloseSeconds);
}

function secondsToOptionalMs(seconds: number): number | undefined {
  const normalized = Math.max(0, seconds);
  return normalized > 0 ? normalized * 1000 : undefined;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createReadingSelectionState(selection: Selection, rawText: string): {
  rawText: string;
  contextText: string;
  selectedWordIndexes: number[];
} {
  const selectedWordCount = tokenizeWords(rawText).length;
  const contextText = selectedWordCount >= 2 && selectedWordCount < 5
    ? findSentenceContext(selection, rawText, 21)
    : rawText;
  const selectedWordIndexes = selectedWordCount >= 5 ? [] : findSelectedWordIndexes(contextText, rawText);
  return {
    rawText,
    contextText,
    selectedWordIndexes
  };
}

function findSentenceContext(selection: Selection, selected: string, maxWords: number): string {
  const range = selection.rangeCount ? selection.getRangeAt(0) : undefined;
  const container = range ? getNearestTextBlock(range.commonAncestorContainer) : undefined;
  const text = normalizeLearningText(container?.textContent ?? selected);
  const normalizedSelected = normalizeLearningText(selected);
  if (!text || !normalizedSelected || text === normalizedSelected) {
    return selected;
  }

  const selectedStart = text.toLocaleLowerCase().indexOf(normalizedSelected.toLocaleLowerCase());
  if (selectedStart < 0) {
    return trimContextWords(selected, maxWords);
  }
  const selectedEnd = selectedStart + normalizedSelected.length;
  const sentences = splitSentencesWithPositions(text);
  const matched = sentences.filter((sentence) => sentence.end >= selectedStart && sentence.start <= selectedEnd);
  const context = (matched.length ? matched.map((sentence) => sentence.text).join(" ") : selected).trim();
  return trimContextWords(context, maxWords, selected);
}

function getNearestTextBlock(node: Node): HTMLElement | undefined {
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  return start?.closest("p, li, blockquote, article, section, main, div, body") ?? undefined;
}

function splitSentencesWithPositions(text: string): Array<{ text: string; start: number; end: number }> {
  const matches = [...text.matchAll(/[^.!?。！？]+[.!?。！？]*/gu)];
  return matches.map((match) => ({
    text: match[0].trim(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  })).filter((sentence) => sentence.text);
}

function trimContextWords(context: string, maxWords: number, selected = ""): string {
  const words = tokenizeWords(context);
  if (words.length <= maxWords) {
    return context;
  }

  const selectedWords = tokenizeWords(selected);
  const startIndex = selectedWords.length ? findWordSubsequence(words, selectedWords) : 0;
  const safeStart = Math.max(0, startIndex < 0 ? 0 : startIndex - Math.floor((maxWords - selectedWords.length) / 2));
  return words.slice(safeStart, safeStart + maxWords).join(" ");
}

function findSelectedWordIndexes(context: string, selected: string): number[] {
  const contextWords = tokenizeWords(context);
  const selectedWords = tokenizeWords(selected);
  if (!selectedWords.length) {
    return [];
  }
  const start = findWordSubsequence(contextWords, selectedWords);
  if (start < 0) {
    return contextWords
      .map((word, index) => selectedWords.some((selectedWord) => wordsMatch(word, selectedWord)) ? index : -1)
      .filter((index) => index >= 0);
  }
  return selectedWords.map((_, offset) => start + offset);
}

function findWordSubsequence(words: string[], selectedWords: string[]): number {
  for (let start = 0; start <= words.length - selectedWords.length; start += 1) {
    if (selectedWords.every((word, offset) => wordsMatch(words[start + offset], word))) {
      return start;
    }
  }
  return -1;
}

function wordsMatch(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function toggleWordIndex(index: number): void {
  if (selectedWords.has(index)) {
    selectedWords.delete(index);
  } else {
    selectedWords.add(index);
  }
}

function toggleWordRange(start: number, end: number, shouldSelect: boolean): void {
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  for (let index = lower; index <= upper; index += 1) {
    if (shouldSelect) {
      selectedWords.add(index);
    } else {
      selectedWords.delete(index);
    }
  }
}

function getSource(): SourceRef {
  return {
    provider: "generic",
    url: location.href,
    title: document.title
  };
}

function normalizeLearningText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function createLearningItemKey(id: string): string {
  return `ylang:learning-item:${id}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
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

function normalizeCssColor(value: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#f4c461";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function triggerIconTwitch(): void {
  const iconButton = document.querySelector<HTMLElement>(".ylang-reading-icon");
  const iconImage = iconButton?.querySelector<HTMLImageElement>(".ylang-reading-logo");
  if (!iconButton || !iconImage) {
    return;
  }

  if (iconTwitchTimeout) {
    clearTimeout(iconTwitchTimeout);
  }

  iconButton.classList.remove("twitch");
  void iconButton.offsetWidth;
  iconButton.classList.add("twitch");
  iconImage.src = ICON_TWITCH_URL;
  iconTwitchTimeout = setTimeout(() => {
    iconButton.classList.remove("twitch");
    iconImage.src = ICON_URL;
    iconTwitchTimeout = undefined;
  }, 400);
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: absolute;
      z-index: 2147483647;
      --ylang-reading-ui-color: #f4c461;
      color-scheme: only light;
      forced-color-adjust: none;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: Arial, Helvetica, sans-serif;
    }

    #${ROOT_ID},
    #${ROOT_ID} *,
    #${ROOT_ID} *::before,
    #${ROOT_ID} *::after {
      color-scheme: only light;
    }

    #${ROOT_ID} button {
      border: 1px solid color-mix(in srgb, var(--ylang-reading-ui-color) 42%, rgba(255, 255, 255, 0.14));
      border-radius: 999px;
      background: color-mix(in srgb, var(--ylang-reading-ui-color) 16%, rgba(12, 22, 28, 0.94));
      color: white;
      cursor: pointer;
      font: 700 12px/1 Arial, Helvetica, sans-serif;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
    }

    #${ROOT_ID} .ylang-reading-icon {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      position: relative;
      background: color-mix(in srgb, var(--ylang-reading-ui-color) 16%, rgba(12, 22, 28, 0.94));
      border-color: color-mix(in srgb, var(--ylang-reading-ui-color) 76%, #12391f);
      padding: 0;
      overflow: visible;
    }

    #${ROOT_ID} .ylang-reading-logo {
      width: 28px;
      height: 28px;
      display: block;
      object-fit: contain;
      pointer-events: none;
      transform: translateY(-4.5px);
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28));
      position: relative;
      z-index: 1;
    }

    #${ROOT_ID} .ylang-reading-burst {
      position: absolute;
      width: 48px;
      height: 48px;
      pointer-events: none;
      forced-color-adjust: none;
      opacity: 0;
      transform: scale(0.72) rotate(0deg);
    }

    #${ROOT_ID} .ylang-reading-icon.twitch .ylang-reading-logo {
      animation: ylang-reading-twitch 400ms ease;
    }

    #${ROOT_ID} .ylang-reading-icon.twitch .ylang-reading-burst {
      animation: ylang-reading-burst 420ms ease;
    }

    #${ROOT_ID} .ylang-reading-panel {
      display: flex;
      gap: 6px;
      padding-top: 0;
    }

    #${ROOT_ID} .ylang-reading-panel button {
      padding: 8px 10px;
    }

    #${ROOT_ID} .ylang-reading-panel span {
      opacity: 0.72;
      margin-left: 4px;
    }

    #${ROOT_ID} .ylang-reading-word-view,
    #${ROOT_ID} .ylang-reading-result {
      position: absolute;
      top: 38px;
      left: 0;
      width: min(var(--ylang-reading-popover-width), calc(100vw - 24px));
      min-width: min(240px, calc(100vw - 24px));
      max-height: 56vh;
      overflow: auto;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--ylang-reading-ui-color) 30%, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      background: rgba(8, 14, 18, 0.96);
      color: white;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    }

    #${ROOT_ID} .ylang-reading-word-view button {
      margin: 2px;
      padding: 5px 7px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.12);
    }

    #${ROOT_ID} .ylang-reading-word-view button.selected {
      background: color-mix(in srgb, var(--ylang-reading-ui-color) 72%, rgba(12, 22, 28, 0.9));
    }

    #${ROOT_ID} .ylang-reading-word-view .ylang-reading-clear-words {
      margin-left: 8px;
      border-style: dashed;
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.72);
    }

    #${ROOT_ID} .ylang-reading-result {
      white-space: pre-wrap;
      font: 600 13.5px/1.45 Arial, Helvetica, sans-serif;
    }

    @keyframes ylang-reading-twitch {
      0% { transform: translateY(-4.5px) rotate(0deg) scale(1); }
      22% { transform: translateY(-4.5px) rotate(-10deg) scale(1.13); }
      44% { transform: translateY(-4.5px) rotate(9deg) scale(1.08); }
      70% { transform: translateY(-4.5px) rotate(-4deg) scale(1.04); }
      100% { transform: translateY(-4.5px) rotate(0deg) scale(1); }
    }

    @keyframes ylang-reading-burst {
      0% { opacity: 0; transform: scale(0.72) rotate(0deg); }
      24% { opacity: 1; }
      100% { opacity: 0; transform: scale(1.26) rotate(18deg); }
    }
  `;
  document.documentElement.appendChild(style);
}
}
