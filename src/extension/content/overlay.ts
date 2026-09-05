import type {
  OverlayMode,
  SelectionTranslationHint,
  SubtitleCue,
  TranslationRecord,
  YlangSettings
} from "../../core/types";

const ROOT_ID = "ylang-overlay-root";
const STYLE_ID = "ylang-overlay-style";
const NATIVE_HIDDEN_CLASS = "ylang-native-subtitles-hidden";
const NATIVE_SUBTITLE_SELECTORS = [
  "tv-player-subtitles",
  ".ytp-caption-window-container",
  ".ytp-caption-segment",
  ".bmpui-ui-subtitle-overlay",
  ".bmpui-subtitle-vtt-cue-container",
  ".bmpui-subtitle-vtt-cue",
  "[data-uia='player-subtitle-text']",
  ".player-timedtext",
  ".player-timedtext-text-container"
];

export interface OverlayState {
  cue?: SubtitleCue;
  translation?: TranslationRecord;
  settings: YlangSettings;
  episodeLineCount: number;
  episodeStatus?: string;
  transcriptSaved: boolean;
  currentSelectionLearned: boolean;
  canUseLocalLlm: boolean;
  selectionTranslationHints: SelectionTranslationHint[];
  getEpisodeScriptText: () => string;
  onFetchEpisodeTranscript: () => void;
  onCopyEpisodeScript: () => void;
  onSaveEpisodeTranscript: () => void;
  onDeleteSavedTranscript: () => void;
  onImportEpisodeTranslation: (translatedText: string) => void;
  onExplainGrammar: (cue: SubtitleCue, selectedText?: string) => void;
  onSelectionChanged: (selectedText?: string) => void;
  onToggleLearn: (cue: SubtitleCue, selectedText?: string) => void;
  onAttemptTranslation: (cue: SubtitleCue) => void;
  onSaveResultAsLearningItem: () => void;
  onUpdateSettings: (settings: Partial<YlangSettings>) => void;
  onCloseResultBubble: () => void;
  onTranslate: (cue: SubtitleCue, selectedText?: string) => void;
  onOpenOptions: () => void;
  resultBubble?: {
    title: string;
    body: string;
    learnActionLabel?: string;
  };
}

let selectedWordIndexes = new Set<number>();
let lastClickedWordIndex: number | undefined;
let selectionTextKey = "";
let episodePanelOpen = false;
let quickPanelOpen = false;
let currentOverlayState: OverlayState | undefined;

export function mountOverlay(state: OverlayState): void {
  currentOverlayState = state;
  ensureStyle();
  const player = findVideoPlayerHost();
  if (!player) {
    return;
  }

  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    player.appendChild(root);
  } else if (root.parentElement !== player) {
    player.appendChild(root);
  }

  if (getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }

  root.style.setProperty("--ylang-font-scale", String(state.settings.fontScale));
  root.style.setProperty("--ylang-offset", `${state.settings.verticalOffset}px`);
  root.style.setProperty("--ylang-ui-color", normalizeCssColor(state.settings.videoUiColor));
  root.classList.toggle("ylang-augment-native-mode", state.settings.overlayMode === "augment-native");
  setNativeSubtitleVisibility(state.settings.overlayMode);

  const original = state.cue?.normalizedText ?? "";
  const translated = state.translation?.translatedText ?? "";
  const hasCue = Boolean(original);
  const showOriginal = state.settings.showOriginalLine && !state.settings.transcriptModeEnabled;
  const showTranslated = state.settings.showTranslatedLine;
  const showTranslateButton = state.settings.provider !== "local-llm" || state.canUseLocalLlm;

  root.innerHTML = `
    <div class="ylang-subtitle-shell ${hasCue ? "" : "ylang-empty"}">
      ${state.settings.transcriptModeEnabled && state.settings.showOriginalLine ? `<div class="ylang-transcript-float"></div>` : ""}
      <div class="ylang-lines">
        ${showOriginal ? `<div class="ylang-line ylang-original"></div>` : ""}
        ${showTranslated ? `<div class="ylang-line ylang-translation"></div>` : ""}
      </div>
      <div class="ylang-actions">
        ${showTranslateButton ? `<button class="ylang-button" type="button" data-action="translate">Translate</button>` : ""}
        ${state.canUseLocalLlm ? `<button class="ylang-button" type="button" data-action="grammar">Grammar</button>` : ""}
        <button class="ylang-button" type="button" data-action="learn">${state.currentSelectionLearned ? "Unlearn" : "Learn"}</button>
        ${state.canUseLocalLlm ? `<button class="ylang-button" type="button" data-action="attempt">Attempt</button>` : ""}
        <button class="ylang-button ylang-icon-button" type="button" data-action="quick-settings" title="ylang quick settings" aria-label="ylang quick settings">&#9881;</button>
      </div>
      ${state.resultBubble ? renderResultBubble(state.resultBubble) : ""}
      ${quickPanelOpen ? renderQuickPanel(state) : ""}
      ${episodePanelOpen ? renderEpisodePanel(state) : ""}
    </div>
  `;

  const originalNode = root.querySelector<HTMLElement>(".ylang-original");
  const transcriptFloatNode = root.querySelector<HTMLElement>(".ylang-transcript-float");
  const translationNode = root.querySelector<HTMLElement>(".ylang-translation");
  if (originalNode) {
    renderWordChips(originalNode, original);
  }
  if (transcriptFloatNode) {
    transcriptFloatNode.textContent = original;
  }
  if (translationNode) {
    translationNode.textContent = translated || (hasCue ? "No translation saved yet" : "");
    translationNode.classList.toggle("ylang-placeholder", !translated);
  }

  root.querySelector("[data-action='translate']")?.addEventListener("click", () => {
    if (state.cue) {
      state.onTranslate(state.cue, getSelectedText(originalNode));
    }
  });
  root.querySelector("[data-action='grammar']")?.addEventListener("click", () => {
    if (state.cue) {
      state.onExplainGrammar(state.cue, getSelectedText(originalNode));
    }
  });
  root.querySelector("[data-action='learn']")?.addEventListener("click", () => {
    if (state.cue) {
      state.onToggleLearn(state.cue, getSelectedLearningText(originalNode, state.settings.maxPhraseGapWords));
    }
  });
  root.querySelector("[data-action='attempt']")?.addEventListener("click", () => {
    if (state.cue) {
      state.onAttemptTranslation(state.cue);
    }
  });

  root.querySelectorAll("[data-action='quick-settings']").forEach((button) => button.addEventListener("click", () => {
    quickPanelOpen = !quickPanelOpen;
    mountOverlay(state);
  }));
  root.querySelector("[data-action='fetch-episode']")?.addEventListener("click", state.onFetchEpisodeTranscript);
  root.querySelector("[data-action='copy-episode']")?.addEventListener("click", state.onCopyEpisodeScript);
  root.querySelector("[data-action='save-transcript']")?.addEventListener("click", state.onSaveEpisodeTranscript);
  root.querySelector("[data-action='delete-transcript']")?.addEventListener("click", state.onDeleteSavedTranscript);
  root.querySelector("[data-action='import-episode']")?.addEventListener("click", () => {
    const textarea = root.querySelector<HTMLTextAreaElement>(".ylang-episode-translation");
    state.onImportEpisodeTranslation(textarea?.value ?? "");
  });
  root.querySelector("[data-action='close-episode']")?.addEventListener("click", () => {
    episodePanelOpen = false;
    mountOverlay(state);
  });
  root.querySelector("[data-action='close-bubble']")?.addEventListener("click", () => {
    state.onCloseResultBubble();
  });
  root.querySelector("[data-action='learn-result']")?.addEventListener("click", () => {
    state.onSaveResultAsLearningItem();
  });
  root.querySelectorAll<HTMLInputElement>("[data-setting-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.settingToggle as keyof YlangSettings | undefined;
      if (key) {
        state.onUpdateSettings({ [key]: input.checked } as Partial<YlangSettings>);
      }
    });
  });
  root.querySelectorAll<HTMLSelectElement>("[data-setting-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const key = select.dataset.settingSelect as keyof YlangSettings | undefined;
      if (key) {
        state.onUpdateSettings({ [key]: select.value } as Partial<YlangSettings>);
      }
    });
  });
  root.querySelector("[data-action='open-full-settings']")?.addEventListener("click", state.onOpenOptions);
  root.querySelector("[data-action='open-episode-panel']")?.addEventListener("click", () => {
    episodePanelOpen = true;
    quickPanelOpen = false;
    mountOverlay(state);
  });
}

export function unmountOverlay(): void {
  document.getElementById(ROOT_ID)?.remove();
  clearNativeSubtitleVisibility();
}

export function clearOverlayWordSelection(): boolean {
  if (!selectedWordIndexes.size) {
    return false;
  }

  selectedWordIndexes = new Set();
  lastClickedWordIndex = undefined;
  const root = document.getElementById(ROOT_ID);
  const originalNode = root?.querySelector<HTMLElement>(".ylang-original");
  if (originalNode) {
    renderSelectedWordClasses(originalNode);
  }

  return true;
}

function renderWordChips(container: HTMLElement, text: string): void {
  container.textContent = "";
  if (selectionTextKey !== text) {
    selectedWordIndexes = new Set();
    lastClickedWordIndex = undefined;
    selectionTextKey = text;
  }

  const tokens = text.match(/\p{L}+(?:['-]\p{L}+)*|\p{N}+|\s+|[^\s\p{L}\p{N}]+/gu) ?? [];
  let wordIndex = 0;

  for (const token of tokens) {
    if (/^\s+$/u.test(token)) {
      container.appendChild(document.createTextNode(token));
      continue;
    }

    if (/^[^\p{L}\p{N}]+$/u.test(token)) {
      container.appendChild(document.createTextNode(token));
      continue;
    }

    const chip = document.createElement("button");
    const index = wordIndex;
    wordIndex += 1;

    chip.type = "button";
    chip.className = "ylang-word-chip";
    chip.classList.toggle("selected", selectedWordIndexes.has(index));
    chip.dataset.wordIndex = String(index);
    chip.textContent = token;
    chip.title = createWordChipTitle(token);
    chip.addEventListener("click", (event) => {
      updateWordSelection(index, event.shiftKey);
      renderSelectedWordClasses(container);
      lastClickedWordIndex = index;
      currentOverlayState?.onSelectionChanged(
        getSelectedLearningText(container, currentOverlayState.settings.maxPhraseGapWords)
      );
      event.preventDefault();
    });
    container.appendChild(chip);
  }

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "ylang-word-clear";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", (event) => {
    selectedWordIndexes.clear();
    lastClickedWordIndex = undefined;
    renderSelectedWordClasses(container);
    currentOverlayState?.onSelectionChanged(undefined);
    event.preventDefault();
  });
  container.appendChild(clearButton);
}

function renderEpisodePanel(state: OverlayState): string {
  return `
    <div class="ylang-episode-panel">
      <div class="ylang-episode-header">
        <strong>Episode script</strong>
        <button class="ylang-button ylang-icon-button" type="button" data-action="close-episode" title="Close episode panel" aria-label="Close episode panel">x</button>
      </div>
      <div class="ylang-episode-actions">
        <button class="ylang-button" type="button" data-action="fetch-episode">Fetch Transcript</button>
        <button class="ylang-button" type="button" data-action="copy-episode">Copy Script</button>
        <button class="ylang-button" type="button" data-action="save-transcript">Save Transcript</button>
        <button class="ylang-button" type="button" data-action="delete-transcript">Delete Saved</button>
        <button class="ylang-button" type="button" data-action="import-episode">Import Translation</button>
        <span>${state.episodeLineCount ? `${state.episodeLineCount} lines` : "No timed script loaded"}${state.transcriptSaved ? " - saved" : ""}</span>
      </div>
      <textarea class="ylang-episode-original" readonly rows="6">${escapeHtml(state.getEpisodeScriptText())}</textarea>
      <textarea class="ylang-episode-translation" rows="6" placeholder="Paste one translated line per original line. Leading numbers like 0001 are OK."></textarea>
      <div class="ylang-episode-status">${escapeHtml(state.episodeStatus ?? "")}</div>
    </div>
  `;
}

function renderQuickPanel(state: OverlayState): string {
  return `
    <div class="ylang-quick-panel">
      <div class="ylang-result-header">
        <strong>ylang</strong>
        <button class="ylang-button ylang-icon-button" type="button" data-action="quick-settings" title="Close" aria-label="Close">x</button>
      </div>
      <div class="ylang-quick-language-row">
        <select data-setting-select="sourceLanguage" aria-label="Source language">
          ${renderFavoriteLanguageOptions(state, "source")}
        </select>
        <span aria-hidden="true">➜</span>
        <select data-setting-select="targetLanguage" aria-label="Translation language">
          ${renderFavoriteLanguageOptions(state, "target")}
        </select>
      </div>
      <label>
        <input type="checkbox" data-setting-toggle="showTranslatedLine" ${state.settings.showTranslatedLine ? "checked" : ""} />
        Show translated line
      </label>
      <label>
        <input type="checkbox" data-setting-toggle="showOriginalLine" ${state.settings.showOriginalLine ? "checked" : ""} />
        Show original line
      </label>
      <label>
        <input type="checkbox" data-setting-toggle="transcriptModeEnabled" ${state.settings.transcriptModeEnabled ? "checked" : ""} />
        Transcript mode
      </label>
      <button class="ylang-button" type="button" data-action="open-episode-panel">Episode translation</button>
      <button class="ylang-button" type="button" data-action="fetch-episode">Fetch transcript</button>
      <button class="ylang-button" type="button" data-action="open-full-settings">Full settings</button>
    </div>
  `;
}

function renderFavoriteLanguageOptions(state: OverlayState, kind: "source" | "target"): string {
  const favorites = state.settings.favoriteLanguageCodes.filter(Boolean);
  const currentValue = kind === "source" ? state.settings.sourceLanguage : state.settings.targetLanguage;
  const baseCodes = kind === "source" ? ["auto", ...favorites] : favorites;
  const codes = currentValue && !baseCodes.includes(currentValue) ? [currentValue, ...baseCodes] : baseCodes;
  const selectedValue = codes.includes(currentValue) ? currentValue : kind === "source" ? "auto" : codes[0];
  return codes
    .map((code) => `
      <option value="${escapeHtml(code)}" ${code === selectedValue ? "selected" : ""}>
        ${escapeHtml(formatInlineLanguageName(code))}
      </option>
    `)
    .join("");
}

function formatInlineLanguageName(code: string): string {
  if (code === "auto") {
    return "Auto detect";
  }

  try {
    const languageName = new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
    return `${languageName} (${code})`;
  } catch {
    return code;
  }
}

function renderResultBubble(result: { title: string; body: string; learnActionLabel?: string }): string {
  return `
    <div class="ylang-result-bubble">
      <div class="ylang-result-header">
        <strong>${escapeHtml(result.title)}</strong>
        <button class="ylang-button ylang-icon-button" type="button" data-action="close-bubble" title="Close" aria-label="Close">x</button>
      </div>
      <pre>${escapeHtml(result.body)}</pre>
      ${result.learnActionLabel ? `<button class="ylang-button" type="button" data-action="learn-result">${escapeHtml(result.learnActionLabel)}</button>` : ""}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateWordSelection(index: number, selectRange: boolean): void {
  if (selectRange && lastClickedWordIndex !== undefined) {
    const start = Math.min(lastClickedWordIndex, index);
    const end = Math.max(lastClickedWordIndex, index);
    for (let current = start; current <= end; current += 1) {
      selectedWordIndexes.add(current);
    }
    return;
  }

  if (selectedWordIndexes.has(index)) {
    selectedWordIndexes.delete(index);
  } else {
    selectedWordIndexes.add(index);
  }
}

function renderSelectedWordClasses(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".ylang-word-chip").forEach((chip) => {
    const index = Number(chip.dataset.wordIndex);
    chip.classList.toggle("selected", selectedWordIndexes.has(index));
  });
}

function getSelectedText(container: HTMLElement | null): string | undefined {
  if (!container || !selectedWordIndexes.size) {
    return undefined;
  }

  const selected = [...container.querySelectorAll<HTMLElement>(".ylang-word-chip")]
    .filter((chip) => selectedWordIndexes.has(Number(chip.dataset.wordIndex)))
    .map((chip) => chip.textContent?.trim() ?? "")
    .filter(Boolean);

  return selected.length ? selected.join(" ") : undefined;
}

function getSelectedLearningText(container: HTMLElement | null, maxGapWords: number): string | undefined {
  if (!container || !selectedWordIndexes.size) {
    return undefined;
  }

  const chips = [...container.querySelectorAll<HTMLElement>(".ylang-word-chip")]
    .map((chip) => ({
      index: Number(chip.dataset.wordIndex),
      text: chip.textContent?.trim() ?? ""
    }))
    .filter((chip) => chip.text);

  const selected = chips
    .filter((chip) => selectedWordIndexes.has(chip.index))
    .sort((a, b) => a.index - b.index);
  if (!selected.length) {
    return undefined;
  }

  const parts: string[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    const chip = selected[index];
    const previous = selected[index - 1];
    if (previous && chip.index > previous.index + 1) {
      const gap = chips.filter((candidate) => candidate.index > previous.index && candidate.index < chip.index);
      parts.push(gap.length <= Math.max(0, maxGapWords) ? `[${gap.map((candidate) => candidate.text).join(" ")}]` : "[..]");
    }
    parts.push(chip.text);
  }

  return parts.join(" ");
}

function createWordChipTitle(word: string): string {
  const normalizedWord = normalizeHintText(word);
  const hints = currentOverlayState?.selectionTranslationHints ?? [];
  const matchingHint = hints.find((hint) =>
    normalizeHintText(hint.sourceText)
      .split(" ")
      .some((part) => part === normalizedWord || part.includes(normalizedWord) || normalizedWord.includes(part))
  );

  return matchingHint ? `${matchingHint.sourceText}: ${matchingHint.translatedText}` : "Select word";
}

function normalizeHintText(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function setNativeSubtitleVisibility(mode: OverlayMode): void {
  for (const nativeContainer of findNativeSubtitleContainers()) {
    nativeContainer.style.opacity = "";
    nativeContainer.classList.toggle(NATIVE_HIDDEN_CLASS, mode === "ylang-controlled");
  }
}

function clearNativeSubtitleVisibility(): void {
  for (const nativeContainer of findNativeSubtitleContainers()) {
    nativeContainer.style.opacity = "";
    nativeContainer.classList.remove(NATIVE_HIDDEN_CLASS);
  }
}

function findVideoPlayerHost(): HTMLElement | null {
  return document.querySelector("tv-player") ??
    document.querySelector<HTMLElement>("#movie_player") ??
    document.querySelector<HTMLElement>(".html5-video-player") ??
    document.querySelector<HTMLElement>(".watch-video") ??
    document.querySelector<HTMLElement>(".VideoContainer") ??
    document.querySelector<HTMLElement>(".NFPlayer") ??
    findBitmovinPlayerHost() ??
    document.querySelector("video")?.parentElement ??
    document.body;
}

function findBitmovinPlayerHost(): HTMLElement | null {
  const subtitleOverlay = document.querySelector<HTMLElement>(".bmpui-ui-subtitle-overlay");
  const controlbar = document.querySelector<HTMLElement>(".bmpui-ui-controlbar, .bmpui-controlbar-bottom");
  const subtitleHost = subtitleOverlay?.parentElement;
  const controlbarHost = controlbar?.parentElement;
  return subtitleHost && subtitleHost === controlbarHost
    ? subtitleHost
    : subtitleHost ?? controlbarHost ?? null;
}

function findNativeSubtitleContainers(): HTMLElement[] {
  return [...new Set(
    NATIVE_SUBTITLE_SELECTORS.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
  )];
}

function normalizeCssColor(value: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#f4c461";
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
      inset: 0;
      z-index: 2147483647;
      --ylang-ui-color: #f4c461;
      pointer-events: none;
      font-family: Arial, Helvetica, sans-serif;
    }

    .${NATIVE_HIDDEN_CLASS} {
      opacity: 0 !important;
    }

    #${ROOT_ID} .ylang-subtitle-shell {
      position: absolute;
      left: 50%;
      bottom: calc(9% + var(--ylang-offset));
      transform: translateX(-50%);
      width: min(88%, 980px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }

    #${ROOT_ID}.ylang-augment-native-mode .ylang-subtitle-shell {
      bottom: calc(20% + var(--ylang-offset));
    }

    #${ROOT_ID} .ylang-empty {
      display: none;
    }

    #${ROOT_ID} .ylang-lines {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      text-align: center;
    }

    #${ROOT_ID} .ylang-transcript-float {
      max-width: min(92vw, 920px);
      padding: 4px 10px;
      border-radius: 5px;
      background: rgba(8, 14, 18, 0.82);
      color: #fff;
      font: 700 calc(18px * var(--ylang-font-scale))/1.28 Arial, Helvetica, sans-serif;
      text-align: center;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
      pointer-events: none;
    }

    #${ROOT_ID} .ylang-line {
      width: fit-content;
      max-width: 100%;
      padding: 2px 10px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.68);
      color: #fff;
      font-size: calc(20px * var(--ylang-font-scale));
      line-height: 1.28;
      font-weight: 700;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
      white-space: pre-wrap;
      user-select: text;
      pointer-events: auto;
    }

    #${ROOT_ID} .ylang-translation {
      color: #dff7ff;
      font-size: calc(18px * var(--ylang-font-scale));
      font-weight: 650;
    }

    #${ROOT_ID} .ylang-placeholder {
      color: rgba(255, 255, 255, 0.66);
      font-style: italic;
    }

    #${ROOT_ID} .ylang-word-chip {
      display: inline;
      margin: 0 1px;
      border: 1px solid color-mix(in srgb, var(--ylang-ui-color) 42%, rgba(223, 247, 255, 0.42));
      border-radius: 6px;
      padding: 0 3px;
      background: color-mix(in srgb, var(--ylang-ui-color) 8%, rgba(255, 255, 255, 0.04));
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-shadow: inherit;
      user-select: text;
    }

    #${ROOT_ID} .ylang-word-chip:hover,
    #${ROOT_ID} .ylang-word-chip.selected {
      border-color: color-mix(in srgb, var(--ylang-ui-color) 82%, white);
      background: color-mix(in srgb, var(--ylang-ui-color) 34%, transparent);
    }

    #${ROOT_ID} .ylang-word-clear {
      margin-left: 8px;
      padding: 2px 7px;
      border: 1px dashed color-mix(in srgb, var(--ylang-ui-color) 36%, rgba(255, 255, 255, 0.24));
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.72);
      font: 700 11px/1.2 Arial, Helvetica, sans-serif;
      cursor: pointer;
    }

    #${ROOT_ID} .ylang-actions {
      position: relative;
      z-index: 3;
      display: flex;
      gap: 6px;
      opacity: 0.96;
      pointer-events: auto;
    }

    #${ROOT_ID} .ylang-actions:hover,
    #${ROOT_ID}:focus-within .ylang-actions {
      opacity: 1;
    }

    #${ROOT_ID} .ylang-button {
      border: 1px solid color-mix(in srgb, var(--ylang-ui-color) 42%, rgba(255, 255, 255, 0.16));
      border-radius: 6px;
      padding: 5px 9px;
      background: color-mix(in srgb, var(--ylang-ui-color) 16%, rgba(15, 24, 28, 0.9));
      color: #fff;
      cursor: pointer;
      font: 700 12px/1.2 Arial, Helvetica, sans-serif;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    #${ROOT_ID} .ylang-button:hover {
      background: color-mix(in srgb, var(--ylang-ui-color) 28%, rgba(28, 55, 64, 0.96));
    }

    #${ROOT_ID} .ylang-icon-button {
      width: 26px;
      padding-inline: 0;
    }

    #${ROOT_ID} .ylang-episode-panel {
      position: relative;
      z-index: 4;
      width: min(92vw, 760px);
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--ylang-ui-color) 30%, rgba(255, 255, 255, 0.12));
      border-radius: 7px;
      background: rgba(8, 14, 18, 0.94);
      color: #fff;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
      display: grid;
      gap: 8px;
      pointer-events: auto;
      font: 600 12px/1.3 Arial, Helvetica, sans-serif;
    }

    #${ROOT_ID} .ylang-quick-panel {
      position: relative;
      z-index: 4;
      min-width: 220px;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--ylang-ui-color) 30%, rgba(255, 255, 255, 0.12));
      border-radius: 7px;
      background: rgba(8, 14, 18, 0.94);
      color: #fff;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
      display: grid;
      gap: 8px;
      pointer-events: auto;
      font: 600 12px/1.3 Arial, Helvetica, sans-serif;
    }

    #${ROOT_ID} .ylang-quick-panel label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #${ROOT_ID} .ylang-quick-language-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 6px;
    }

    #${ROOT_ID} .ylang-quick-language-row span {
      color: var(--ylang-ui-color);
      font-weight: 700;
    }

    #${ROOT_ID} .ylang-quick-language-row select {
      min-width: 0;
      border: 1px solid rgba(165, 190, 220, 0.34);
      border-radius: 6px;
      padding: 5px 6px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 700 11px/1.2 Arial, Helvetica, sans-serif;
    }

    #${ROOT_ID} .ylang-result-bubble {
      position: relative;
      z-index: 4;
      width: min(88vw, 720px);
      max-height: 62vh;
      overflow: auto;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--ylang-ui-color) 30%, rgba(255, 255, 255, 0.12));
      border-radius: 7px;
      background: rgba(10, 18, 22, 0.96);
      color: #fff;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
      font: 600 14px/1.4 Arial, Helvetica, sans-serif;
    }

    #${ROOT_ID} .ylang-result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    #${ROOT_ID} .ylang-result-bubble pre {
      margin: 0;
      white-space: pre-wrap;
      color: #dff7ff;
      font: 500 13px/1.45 Consolas, "Courier New", monospace;
    }

    #${ROOT_ID} .ylang-episode-header,
    #${ROOT_ID} .ylang-episode-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    #${ROOT_ID} .ylang-episode-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
      color: rgba(255, 255, 255, 0.72);
    }

    #${ROOT_ID} .ylang-episode-original,
    #${ROOT_ID} .ylang-episode-translation {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      border: 1px solid rgba(223, 247, 255, 0.24);
      border-radius: 6px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 500 12px/1.4 Consolas, "Courier New", monospace;
      white-space: pre;
    }

    #${ROOT_ID} .ylang-episode-status {
      min-height: 1.3em;
      color: #dff7ff;
    }
  `;

  document.head.appendChild(style);
}
