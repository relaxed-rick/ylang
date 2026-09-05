type SetTextMessage = {
  type: "ylang:deepl.setText";
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

type SetTextResponse = {
  ok: boolean;
  translatedText?: string;
};

type ResumeSourcePlaybackMessage = {
  type: "ylang:deepl.resumeSourcePlayback";
};

declare const chrome: {
  runtime: {
    sendMessage(message: ResumeSourcePlaybackMessage): Promise<unknown>;
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
};

let compactObserver: MutationObserver | undefined;

resetCompactDeepLMode();
document.addEventListener("keydown", handleDeepLKeyboardShortcut, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isPingMessage(message)) {
    sendResponse({ ok: true });
    return false;
  }

  if (!isSetTextMessage(message)) {
    return false;
  }

  void setDeepLSourceText(message.text)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
});

function handleDeepLKeyboardShortcut(event: KeyboardEvent): void {
  if (event.key !== " " && event.code !== "Space") {
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  if (document.documentElement.dataset.ylangDeeplManaged !== "true") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void chrome.runtime.sendMessage({ type: "ylang:deepl.resumeSourcePlayback" });
}

async function setDeepLSourceText(text: string): Promise<SetTextResponse> {
  installCompactDeepLMode();
  const target = await waitForInput();
  if (!target) {
    return { ok: false };
  }

  target.focus();
  await clearDeepLSourceAndResult(target);
  setEditableText(target, text);
  cleanupDeepLChrome();
  return {
    ok: true,
    translatedText: await waitForTranslation(text)
  };
}

async function waitForInput(): Promise<HTMLElement | null> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const input = findSourceInput();
    if (input) {
      return input;
    }

    await delay(200);
  }

  return null;
}

function findSourceInput(): HTMLElement | null {
  const selectors = [
    "[data-testid='translator-source-input'] [contenteditable='true']",
    "[data-testid='translator-source-input'] textarea",
    "[dl-test='translator-source-input'] [contenteditable='true']",
    "[dl-test='translator-source-input'] textarea",
    "[data-testid='translator-source-input']",
    "[dl-test='translator-source-input']",
    "d-textarea textarea",
    "d-textarea [contenteditable='true']",
    "[aria-labelledby*='translation-source']",
    "textarea[aria-label*='source' i]",
    "[contenteditable='true'][role='textbox'][aria-label*='source' i]"
  ];

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && isVisible(element)) {
      return element;
    }
  }

  return null;
}

async function waitForTranslation(sourceText: string): Promise<string | undefined> {
  const insertedAt = Date.now();
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const translatedText = findTranslatedText();
    if (Date.now() - insertedAt > 600 && translatedText && translatedText !== sourceText.trim()) {
      return translatedText;
    }

    await delay(300);
  }

  return undefined;
}

async function clearDeepLSourceAndResult(element: HTMLElement): Promise<void> {
  setEditableText(element, "");
  await waitForTranslationClear();
}

async function waitForTranslationClear(): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!findTranslatedText()) {
      return;
    }

    await delay(100);
  }
}

function findTranslatedText(): string | undefined {
  const selectors = [
    "[data-testid='translator-target-input']",
    "[data-testid='translator-target-input'] [contenteditable='true']",
    "[data-testid='translator-target-input'] textarea",
    "[dl-test='translator-target-input']",
    "[dl-test='translator-target-input'] [contenteditable='true']",
    "[dl-test='translator-target-input'] textarea",
    "[aria-labelledby*='translation-target']",
    "section[aria-label*='Translation' i] [contenteditable='true']",
    "section[aria-label*='target' i] [contenteditable='true']"
  ];

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const text = readElementText(element);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function readElementText(element: HTMLElement | null): string | undefined {
  if (!element || !isVisible(element)) {
    return undefined;
  }

  const text =
    element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
      ? element.value
      : element.textContent;
  const normalized = text?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function setEditableText(element: HTMLElement, text: string): void {
  element.focus();
  if (text) {
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text
      })
    );
    dispatchPasteEvent(element, text);
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    valueSetter?.call(element, "");
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
        data: ""
      })
    );
    valueSetter?.call(element, text);
    element.setSelectionRange(text.length, text.length);
  } else {
    document.getSelection()?.selectAllChildren(element);
    document.execCommand("delete", false);
    if (text) {
      document.execCommand("insertText", false, text);
    }
    if ((element.textContent ?? "").trim() !== text.trim()) {
      element.textContent = text;
    }
  }

  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: text ? "insertText" : "deleteContentBackward",
      data: text
    })
  );
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " ", code: "Space" }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  element.blur();
  element.focus();
}

function dispatchPasteEvent(element: HTMLElement, text: string): void {
  try {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData
      })
    );
  } catch {
    // Some browser contexts do not allow constructing clipboard data.
  }
}

function installCompactDeepLMode(): void {
  document.documentElement.dataset.ylangDeeplManaged = "true";
  installCompactDeepLStyle();
  cleanupDeepLChrome();
  installDeepLBrandMarker();
  if (compactObserver) {
    return;
  }

  compactObserver = new MutationObserver(() => {
    cleanupDeepLChrome();
    installDeepLBrandMarker();
  });
  compactObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function resetCompactDeepLMode(): void {
  delete document.documentElement.dataset.ylangDeeplManaged;
  document.getElementById("ylang-deepl-compact-style")?.remove();
  document.getElementById("ylang-deepl-brand")?.remove();
  compactObserver?.disconnect();
  compactObserver = undefined;
}

function cleanupDeepLChrome(): void {
  const selectors = [
    "[data-testid*='cookie' i]",
    "[id*='cookie' i]",
    "[class*='cookie' i]",
    "[class*='newsletter' i]",
    "[class*='upsell' i]",
    "[class*='proAd' i]",
    "[class*='appBanner' i]",
    "[class*='downloadApp' i]"
  ];

  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (!canRemoveDeepLChrome(element)) {
        return;
      }

      element.remove();
    });
  }
}

function canRemoveDeepLChrome(element: HTMLElement): boolean {
  if (element.id === "ylang-deepl-brand" || containsTranslatorInput(element)) {
    return false;
  }

  if (element.closest("main, form, section, [data-testid*='translator' i], [class*='translator' i]")) {
    return false;
  }

  return true;
}

function installCompactDeepLStyle(): void {
  if (document.getElementById("ylang-deepl-compact-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "ylang-deepl-compact-style";
  style.textContent = `
    html,
    body,
    main {
      min-height: auto !important;
      overflow-x: hidden !important;
    }

    body {
      padding: 0 !important;
    }

    #ylang-deepl-brand {
      position: sticky;
      top: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      height: 24px;
      padding: 0 10px;
      background: #0f2b46;
      color: white;
      font: 700 12px/1 Arial, Helvetica, sans-serif;
      letter-spacing: 0;
    }

    main,
    [data-testid*="translator" i],
    [class*="translator" i] {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }

    [data-layout-id="translator"] {
      gap: 2px !important;
    }

    .grid.grid-cols-1.auto-rows-fr,
    [class*="auto-rows-fr" i][class*="grid-cols-1" i] {
      min-height: 0 !important;
      height: auto !important;
      grid-auto-rows: minmax(0, auto) !important;
    }

    textarea,
    [contenteditable="true"],
    [role="textbox"] {
      scroll-margin-top: 0 !important;
    }

    [data-layout-id="textarea-layout-source"] {
      min-height: 104px !important;
      height: 118px !important;
      max-height: 132px !important;
    }

    [data-layout-id="textarea-layout-source"] > div,
    [data-layout-id="textarea-layout-source"] [class*="flex-col" i] {
      min-height: 0 !important;
    }

    [data-layout-id="textarea-layout-source"] [data-layout-id="textarea-layout-action-bar"] {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
    }

    [data-layout-id="textarea-layout-source"] [data-layout-id="interventionSourceTranslatorArea"],
    [data-layout-id="textarea-layout-source"] [data-placeholder="true"] {
      display: none !important;
    }

    [data-layout-id="textarea-layout-source"] [data-layout-id="sourceTextareaTopCornerButton"] {
      top: 6px !important;
      right: 8px !important;
    }

    [data-testid="translator-source-input"],
    [dl-test="translator-source-input"],
    [data-layout-id="textarea-layout-source"] d-textarea {
      min-height: 82px !important;
      height: 100% !important;
      max-height: 112px !important;
    }

    [data-testid="translator-source-input"] textarea,
    [data-testid="translator-source-input"] [contenteditable="true"],
    [dl-test="translator-source-input"] textarea,
    [dl-test="translator-source-input"] [contenteditable="true"],
    [data-layout-id="textarea-layout-source"] d-textarea textarea,
    [data-layout-id="textarea-layout-source"] d-textarea [contenteditable="true"] {
      min-height: 76px !important;
      height: 84px !important;
      max-height: 104px !important;
      padding-top: 10px !important;
      padding-bottom: 10px !important;
    }

    [data-layout-id="textarea-layout-target"] {
      min-height: 220px !important;
    }

    [data-testid="translator-target-input"],
    [data-testid="translator-target-input"] textarea,
    [data-testid="translator-target-input"] [contenteditable="true"],
    [dl-test="translator-target-input"],
    [dl-test="translator-target-input"] textarea,
    [dl-test="translator-target-input"] [contenteditable="true"],
    [data-layout-id="textarea-layout-target"],
    [data-layout-id="textarea-layout-target"] textarea,
    [data-layout-id="textarea-layout-target"] [contenteditable="true"] {
      font-size: 1.08em !important;
      line-height: 1.36 !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function installDeepLBrandMarker(): void {
  if (document.getElementById("ylang-deepl-brand")) {
    return;
  }

  const marker = document.createElement("div");
  marker.id = "ylang-deepl-brand";
  marker.textContent = "DeepL";
  document.body.prepend(marker);
}

function containsTranslatorInput(element: HTMLElement): boolean {
  return Boolean(
    element.querySelector(
      [
        "[data-testid='translator-source-input']",
        "[data-testid='translator-source-input'] textarea",
        "[dl-test='translator-source-input']",
        "[dl-test='translator-source-input'] textarea",
        "d-textarea textarea",
        "d-textarea [contenteditable='true']"
      ].join(",")
    )
  );
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isSetTextMessage(message: unknown): message is SetTextMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as SetTextMessage).type === "ylang:deepl.setText" &&
    typeof (message as SetTextMessage).text === "string"
  );
}

function isPingMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: string }).type === "ylang:deepl.ping"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export {};
